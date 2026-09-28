import torch
from torch import nn


class NeuMF(nn.Module):
    def __init__(self, user_count, item_count, embedding_dim=16, hidden_sizes=(32, 16), context_dim=0):
        super().__init__()
        self.context_dim = context_dim
        self.gmf_user = nn.Embedding(user_count, embedding_dim)
        self.gmf_item = nn.Embedding(item_count, embedding_dim)
        self.mlp_user = nn.Embedding(user_count, embedding_dim)
        self.mlp_item = nn.Embedding(item_count, embedding_dim)
        layers = []
        size = embedding_dim * 2
        for hidden in hidden_sizes:
            layers.extend([nn.Linear(size, hidden), nn.ReLU()])
            size = hidden
        self.mlp = nn.Sequential(*layers)
        self.output = nn.Linear(embedding_dim + size, 1)
        for embedding in (self.gmf_user, self.gmf_item, self.mlp_user, self.mlp_item):
            nn.init.normal_(embedding.weight, std=0.01)
        if context_dim:
            # Preserve the baseline's initialization; learn the added context columns from zero.
            original = self.mlp[0]
            expanded = nn.Linear(original.in_features + context_dim, original.out_features)
            with torch.no_grad():
                expanded.weight[:, :original.in_features].copy_(original.weight)
                expanded.weight[:, original.in_features:].zero_()
                expanded.bias.copy_(original.bias)
            self.mlp[0] = expanded

    def forward(self, users, items, context=None):
        gmf = self.gmf_user(users) * self.gmf_item(items)
        inputs = [self.mlp_user(users), self.mlp_item(items)]
        if self.context_dim:
            if context is None or context.shape != (users.shape[0], self.context_dim):
                raise ValueError('Expected one context vector per user/item pair')
            inputs.append(context)
        mlp = self.mlp(torch.cat(inputs, dim=-1))
        return self.output(torch.cat([gmf, mlp], dim=-1)).squeeze(-1)
