"""Prior-event context for the isolated global-time Amazon feasibility study."""
from collections import defaultdict, deque
from datetime import datetime
from itertools import groupby

import torch
from torch import nn

from multidomain_data import DOMAINS
from multidomain_model import MultiDomainNeuMF

HISTORY_GROUPS = 5
GAP_SECONDS = (3600, 86400, 604800, 2592000)
CONTEXT_DIM = HISTORY_GROUPS * len(DOMAINS) + len(GAP_SECONDS) + 1


def global_splits(rows, train_ratio=.7, validation_ratio=.15):
    ordered = sorted(rows, key=lambda r: (r['timestamp'], r['userId'], r['itemId']))
    t1 = ordered[max(0, int(len(rows) * train_ratio) - 1)]['timestamp']
    t2 = ordered[max(0, int(len(rows) * (train_ratio + validation_ratio)) - 1)]['timestamp']
    splits = {'train': [], 'validation': [], 'test': []}
    for row in ordered:
        split = 'train' if row['timestamp'] <= t1 else 'validation' if row['timestamp'] <= t2 else 'test'
        splits[split].append(row)
    return splits, {'train_end': t1, 'validation_end': t2}


def contextual_groups(rows):
    """Yield a user's tied events together, before adding any of them to history."""
    users = defaultdict(list)
    for row in rows:
        users[row['userId']].append(row)
    for user, events in sorted(users.items()):
        history = deque(maxlen=HISTORY_GROUPS)
        previous = None
        ordered = sorted(events, key=lambda r: (r['timestamp'], r['domain'], r['itemId']))
        for timestamp, group in groupby(ordered, key=lambda r: r['timestamp']):
            group = list(group)
            moment = datetime.fromisoformat(timestamp)
            vector = [0.0] * CONTEXT_DIM
            for position, domain_mix in enumerate(reversed(history)):
                vector[position * 3:position * 3 + 3] = domain_mix
            if previous is not None:
                gap = (moment - previous).total_seconds()
                bucket = sum(gap >= boundary for boundary in GAP_SECONDS)
                vector[HISTORY_GROUPS * 3 + bucket] = 1.0
            yield user, timestamp, group, vector
            history.append([sum(r['domain'] == domain for r in group) / len(group) for domain in DOMAINS])
            previous = moment


class ContextNeuMF(MultiDomainNeuMF):
    """Model C with a zero-initialized context shift of its two user vectors."""
    def __init__(self, **kwargs):
        if kwargs.get('variant') != 'shared_domain_specific':
            raise ValueError('This controlled context extension requires Model C')
        super().__init__(**kwargs)
        self.context_shift = nn.Linear(CONTEXT_DIM, 2 * self.core.gmf_user.embedding_dim, bias=False)
        nn.init.zeros_(self.context_shift.weight)

    def forward(self, users, items, domains, context):
        if context.shape != (users.numel(), CONTEXT_DIM):
            raise ValueError('Expected one prior-event context per candidate')
        gmf_shift, mlp_shift = self.context_shift(context).chunk(2, dim=-1)
        offset_ids = domains * self.user_count + users
        global_items = items + self.offsets[domains]
        gmf_user = self.core.gmf_user(users) + self.gmf_offset(offset_ids) + gmf_shift
        mlp_user = self.core.mlp_user(users) + self.mlp_offset(offset_ids) + mlp_shift
        gmf = gmf_user * self.core.gmf_item(global_items)
        mlp = self.core.mlp(torch.cat([mlp_user, self.core.mlp_item(global_items),
                                       self.domain_embedding(domains)], dim=-1))
        return self.core.output(torch.cat([gmf, mlp], dim=-1)).squeeze(-1)
