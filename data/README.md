# Data Directory

This folder holds local datasets for the frozen offline study. The final Amazon Reviews 2023 benchmark and its global-time protocol are documented in [Final Study](../research/FINAL_STUDY.md). The earlier MovieLens 100K setup remains in [research/README.md](../research/README.md).

- `raw/amazon2023/`: source rating archives; exact categories, URLs and hashes are recorded in the frozen research manifests
- `raw/`: other local sources, including the historical MovieLens baseline
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

Large dataset files stay out of Git. Inspect saved results without downloading data or running a fit. Reproduction requires the exact source versions and protocol for the chosen artifact; hypothetical Food.com/activity integrations are not completed datasets in this study.

The NCF experiment keeps its normalized interactions, chronological splits, and ID maps with each local run under `research/runs/`. This keeps the exact input beside its model checkpoint; it does not require a second processed copy here.
