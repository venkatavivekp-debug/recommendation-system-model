# Data Directory

This folder holds local datasets for offline experiments. Start with the MovieLens 100K setup in [research/README.md](../research/README.md).

- `raw/`: downloaded datasets such as MovieLens, Food.com, or activity data
- `processed/`: normalized files ready for training/evaluation

The expected processed interaction shape is:

```json
{
  "userId": "user-1",
  "itemId": "food:recipe-1",
  "domain": "food",
  "action": "selected",
  "timestamp": "2026-01-01T12:00:00.000Z",
  "context": {}
}
```

Large dataset files should stay out of Git.

The NCF experiment keeps its normalized interactions, chronological splits, and ID maps with each local run under `research/runs/`. This keeps the exact input beside its model checkpoint; it does not require a second processed copy here.
