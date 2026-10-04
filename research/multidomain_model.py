"""Three controlled NeuMF variants; no live application inference."""
import torch
from torch import nn

from model import NeuMF

VARIANTS = ('independent', 'shared', 'shared_domain_specific')


class MultiDomainNeuMF(nn.Module):
    def __init__(self, user_count, item_counts, domain_users, variant='shared',
                 embedding_dim=16, hidden_sizes=(32, 16), domain_dim=4):
        super().__init__()
        if variant not in VARIANTS or len(item_counts) != 3 or any(n < 1 for n in item_counts):
            raise ValueError('A supported variant and three nonempty item catalogs are required')
        if user_count < 1 or len(domain_users) != 3 or any(not users for users in domain_users):
            raise ValueError('Each domain needs training users')
        self.variant = variant
        self.user_count = user_count
        self.register_buffer('item_counts', torch.tensor(item_counts))
        self.register_buffer('offsets', torch.tensor([0, item_counts[0], sum(item_counts[:2])]))
        lookup = torch.full((3, user_count), -1, dtype=torch.long)
        for domain, users in enumerate(domain_users):
            lookup[domain, users] = torch.arange(len(users))
        self.register_buffer('user_lookup', lookup)
        if variant == 'independent':
            self.models = nn.ModuleList([NeuMF(len(users), count, embedding_dim, hidden_sizes)
                                         for users, count in zip(domain_users, item_counts)])
        else:
            # Disjoint row blocks are equivalent to separate item tables, with shared branch layers.
            self.core = NeuMF(user_count, sum(item_counts), embedding_dim, hidden_sizes, context_dim=domain_dim)
            self.domain_embedding = nn.Embedding(3, domain_dim)
            nn.init.normal_(self.domain_embedding.weight, std=0.01)
            if variant == 'shared_domain_specific':
                self.gmf_offset = nn.Embedding(3 * user_count, embedding_dim)
                self.mlp_offset = nn.Embedding(3 * user_count, embedding_dim)
                nn.init.zeros_(self.gmf_offset.weight)
                nn.init.zeros_(self.mlp_offset.weight)

    def forward(self, users, items, domains):
        if users.ndim != 1 or items.shape != users.shape or domains.shape != users.shape:
            raise ValueError('Expected matching one-dimensional user, item and domain indices')
        if ((users < 0) | (users >= self.user_count) | (domains < 0) | (domains >= 3)).any():
            raise ValueError('Unknown user or domain')
        if ((items < 0) | (items >= self.item_counts[domains])).any():
            raise ValueError('Unknown item in the requested domain')
        if self.variant == 'independent':
            local_users = self.user_lookup[domains, users]
            if (local_users < 0).any():
                raise ValueError('User has no training history in this domain')
            scores = torch.empty(users.shape, device=users.device)
            for domain, model in enumerate(self.models):
                mask = domains == domain
                if mask.any():
                    scores[mask] = model(local_users[mask], items[mask])
            return scores
        global_items = items + self.offsets[domains]
        context = self.domain_embedding(domains)
        if self.variant == 'shared':
            return self.core(users, global_items, context)
        offset_ids = domains * self.user_count + users
        gmf_user = self.core.gmf_user(users) + self.gmf_offset(offset_ids)
        mlp_user = self.core.mlp_user(users) + self.mlp_offset(offset_ids)
        gmf = gmf_user * self.core.gmf_item(global_items)
        mlp = self.core.mlp(torch.cat([mlp_user, self.core.mlp_item(global_items), context], dim=-1))
        return self.core.output(torch.cat([gmf, mlp], dim=-1)).squeeze(-1)
