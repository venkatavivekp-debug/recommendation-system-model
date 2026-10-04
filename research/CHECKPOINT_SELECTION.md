# Validation checkpoint selection

This experiment changes checkpoint selection, not the model or training. It follows the Natural B diagnosis, so it is an exploratory follow-up, not an independent confirmation on new data. The 1,000-reviewer cohort, split, candidates, negatives, initialization, loss, optimizer and batching are unchanged.

## Rules and verification

- BCE remains the default. B/C minimize mean per-domain validation BCE. A retains its existing separate minimum-BCE checkpoint for each domain; these may come from different epochs.
- `checkpoint_metric: macro_validation_ndcg` selects the complete model snapshot with the highest unweighted mean Food/Fitness/Media validation nDCG@10. Strict improvement is required at full stored float precision, so ties retain the earlier epoch. BCE is not a tie breaker.
- Training still stops by the original BCE rule, with the same patience and epoch cap. Both selectors see the same completed epochs. This does not test whether longer training would help ranking.
- The rules were saved before new test evaluation. Validation alone chooses epochs. Test is evaluated once per distinct selected state; identical states reuse metrics. Reload checks use tensors and validation, not another test sweep.
- Each new run retains `best.pt` for the original BCE state and `ranking_best.pt` for ranking selection. Its primary metrics describe ranking selection, with both policies in `checkpoint_comparison`. Checkpoints stay under ignored `research/runs/`.

Sixteen configurations needed one training pass retaining both states. Natural B seeds 43/44 were reconstructed from saved validation curves and their existing checkpoint because both rules select the same epoch. Every rerun exactly matched its original epoch losses, BCE checkpoint tensors and BCE test metrics. All ranking checkpoints passed reload validation. Existing replication/diagnostic files were preserved.

The [structured comparison](results/checkpoint_selection_comparison.json) contains selection rules, the timestamped predeclaration, fingerprints, all validation curves, selected epochs, BCE values, per-domain test Precision/Recall/nDCG, deltas and sample SDs. `validation_test_agreement` counts all epoch disagreements; the strictly higher-validation subset is distinguished below. The dataset SHA256 remains `e737299b20e9cb40987227a88dc507cec6f3cbb0692a2886863c1d59061adc02`.

## Natural B control

| Seed | BCE / ranking epoch | BCE test Food / Fitness / Media | Ranking test Food / Fitness / Media | Macro BCE -> ranking |
| --- | --- | --- | --- | --- |
| 42 | 2 / 5 | .000000 / .000000 / .000000 | .007191 / .000000 / .000000 | .000000 -> .002397 |
| 43 | 4 / 4 | .003642 / .014979 / .005411 | .003642 / .014979 / .005411 | .008011 -> .008011 |
| 44 | 1 / 1 | .000000 / .013261 / .000000 | .000000 / .013261 / .000000 | .004420 -> .004420 |

Seed 42 selects a worse BCE value (.523026 rather than .500485) but higher validation macro nDCG (.003781 rather than zero). Test Food improves; Fitness and Media remain zero despite validation gains. Seeds 43/44 retain exactly the same states and metrics. Checkpoint mismatch explains part of seed 42's result, not all of Natural B's weakness.

## Three-seed results

nDCG@10 mean +/- sample SD over seeds 42/43/44. These are warm-subset results, not whole-catalog coverage or confidence intervals.

| Mode/model/rule | Food | Fitness | Media | Macro |
| --- | --- | --- | --- | --- |
| Natural A BCE | .004763 +/- .000613 | .007343 +/- .004706 | .003191 +/- .002587 | .005099 +/- .002512 |
| Natural A ranking | .005981 +/- .000603 | .009089 +/- .002988 | .004698 +/- .002178 | .006589 +/- .001794 |
| Natural B BCE | .001214 +/- .002102 | .009413 +/- .008197 | .001804 +/- .003124 | .004144 +/- .004013 |
| Natural B ranking | .003611 +/- .003596 | .009413 +/- .008197 | .001804 +/- .003124 | .004943 +/- .002843 |
| Natural C BCE | .003083 +/- .002392 | .002699 +/- .003561 | .001809 +/- .001938 | .002530 +/- .002501 |
| Natural C ranking | .003867 +/- .002366 | .005288 +/- .002120 | .001284 +/- .002225 | .003480 +/- .001662 |
| Balanced A BCE | .004998 +/- .002280 | .016609 +/- .002705 | .001523 +/- .001397 | .007710 +/- .000604 |
| Balanced A ranking | .006761 +/- .003608 | .015772 +/- .003000 | .002800 +/- .002756 | .008444 +/- .000658 |
| Balanced B BCE | .006760 +/- .000917 | .011502 +/- .000535 | .001833 +/- .000300 | .006699 +/- .000551 |
| Balanced B ranking | .006832 +/- .002391 | .007976 +/- .003383 | .001583 +/- .000518 | .005464 +/- .001666 |
| Balanced C BCE | .008327 +/- .003070 | .011498 +/- .006674 | .001716 +/- .001082 | .007180 +/- .002078 |
| Balanced C ranking | .008689 +/- .003003 | .011686 +/- .006359 | .001098 +/- .000522 | .007158 +/- .002117 |

## Disagreements and domain trade-offs

Choices differ in **12/18 runs**; six agree. Mean epoch distance among disagreements is **1.667**, maximum **5**. For A, distance is averaged across its three BCE domain epochs before averaging across runs. The maximum is the largest individual domain distance.

Across all 12 disagreements, test macro improves in **9**, is unchanged in **0**, and worsens in **3**. In Natural A seed 43 and Balanced A seed 43, the BCE composite has higher validation macro nDCG than the best single-epoch snapshot. Excluding those two cases, strictly higher validation macro gives **7 test gains and 3 losses**. This is descriptive validation/test agreement, not causal proof or statistical significance.

Below are all disagreement runs. A's BCE epochs are ordered Food/Fitness/Media; B/C have one epoch. Test deltas are ranking-selected minus BCE-selected nDCG@10.

| Mode/model/seed | BCE epochs -> ranking | Food delta | Fitness delta | Media delta |
| --- | --- | ---: | ---: | ---: |
| Natural A 42 | 5/2/4 -> 7 | +.001161 | +.005095 | +.001904 |
| Natural A 43 | 4/2/4 -> 2 | +.001697 | .000000 | +.001079 |
| Natural A 44 | 4/5/4 -> 3 | +.000798 | +.000142 | +.001536 |
| Natural B 42 | 2 -> 5 | +.007191 | .000000 | .000000 |
| Natural C 42 | 2 -> 4 | +.003972 | +.002855 | -.001572 |
| Natural C 44 | 1 -> 4 | -.001619 | +.004913 | .000000 |
| Balanced A 42 | 3/3/2 -> 3 | .000000 | .000000 | +.002891 |
| Balanced A 43 | 3/3/4 -> 3 | .000000 | .000000 | +.002766 |
| Balanced A 44 | 3/2/2 -> 1 | +.005289 | -.002512 | -.001825 |
| Balanced B 42 | 3 -> 1 | +.002503 | -.002864 | +.000164 |
| Balanced B 43 | 3 -> 4 | -.002286 | -.007714 | -.000915 |
| Balanced C 44 | 2 -> 3 | +.001086 | +.000562 | -.001854 |

The six unchanged runs are Natural B 43/44, Natural C 43, Balanced B 44, and Balanced C 42/43. Their selected epochs are 4/1/4/3/3/2 respectively. Validation-domain peak epochs, including ties, are retained for every disagreement. For example, Natural A seed 42 peaks at 4/8/7 by domain while macro selection chooses 7. A common snapshot need not be each domain's preferred checkpoint.

## Interpretation and next step

Checkpoint selection is **partially important, but not sufficient**. Natural A improves in every seed, Natural B recovers only Food at seed 42, and balanced B's mean test macro becomes worse. The original BCE rule remains available and is not replaced globally. There is no basis here for claiming Shared NeuMF is the best model.

Low warm coverage, seed variation, sparse items and the natural/balanced update-budget difference remain. Model A's composite-versus-single-epoch distinction also limits a simple pooled interpretation. This comparison neither fixes coverage nor isolates balancing.

**One next experiment:** an equal-optimizer-step Natural B versus Balanced B control, holding the original BCE checkpoint rule fixed. This would separate update budget from domain exposure without changing architecture, loss or cohort. Do not choose the rule per seed or from test outcomes. This control has not been run.

Validation: 57/57 research tests pass, including macro weighting, earliest ties, exact checkpoint snapshots, validation-only selection, unchanged training, deterministic selection and aggregation. Python compilation, JSON validation, reload checks and whitespace checks pass. No application changes, staging, commits or pushes were made.
