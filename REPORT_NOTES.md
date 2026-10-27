# ContextFit Evidence Guide

ContextFit combines a live contextual adaptive recommendation application with a separate frozen offline study. The application uses per-user/per-target-domain LinUCB and explicit cross-domain context; it does not serve the Amazon NeuMF checkpoints.

## System Evidence

- [Architecture and policy](README.md#architecture): candidate scoring, adaptive state, provenance, diversity and explanations.
- [Canonical verification](docs/VERIFICATION.md): exact feedback observations, user/domain isolation, context behavior, latency and automated validation.
- [Interface captures](docs/VERIFICATION.md#interface-quality-verification): application views, distinct from controlled accuracy evidence.

## Research Evidence

- [Final Study](research/FINAL_STUDY.md): bounded conclusions, methodology, limitations and references.
- [Canonical expanded results](research/results/final_study/final_results_seed42.csv): Most Popular, A/B/C and D_FIXED/D under the matched seed-42 protocol.
- [Expanded A/B/C paired comparisons](research/results/final_study/expanded7016/pairwise.csv) and [D/D_FIXED paired comparisons](research/results/final_study/selective_transfer/pairwise_seed42.csv): within-fit uncertainty; [D_FIXED minus A](research/results/final_study/selective_transfer/D_FIXED_minus_A_seed42.csv) is recorded separately.
- [Coverage summary](research/results/final_study/coverage_summary.csv) and [cold-start analysis](research/results/final_study/global_vs_cohort_coldness.csv): warm-item eligibility and catalog limitations.
- [Media rank diagnostic](research/results/final_study/expanded7016/media_rank_diagnostic_summary.json): verified target mapping/candidates and the Top-10 floor.
- [Gradient diagnostic](research/results/final_study/gradient_conflict_seed42.json): train-only shared-parameter gradient comparisons without optimizer updates.
- [Transferability summary](research/results/final_study/transferability_summary.csv): separate activity, temporal and representation diagnostics plus secondary screens.
- [Secondary-screen protocol and results](research/results/final_study/secondary_benchmark_screening_plan.json): predeclared train-only category gates and stopping decision.
- [Historical three-seed control](research/results/final_study/architecture_control_three_seed_summary.csv): separate cohort/protocol from the expanded study.

The expanded benchmark has one training seed. Historical V2 has three seeds under a different cohort/protocol and is not pooled with expanded results. Paired-user intervals are within-fit uncertainty, not training-seed uncertainty. Live feedback checks establish behavior, not offline ranking accuracy.
