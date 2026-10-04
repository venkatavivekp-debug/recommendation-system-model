# Equal-step domain-balance control

## Question and design

The earlier Amazon comparison gave Balanced runs more optimizer steps and examples than Natural runs. This control asks whether changing the domain sampling distribution matters when the update budget is held constant. It uses the existing three-domain data, 1,000-user cohort, IDs, temporal splits, negative sampler, candidates, models, optimizer, learning rate, batch size and evaluation implementation. No architecture or hyperparameter was changed.

The budget was declared before looking at these test results: **3,200 optimizer steps per run**, or ten common 320-step validation windows. The original Natural maximum was ten epochs. One Natural epoch has 163,585 sampled examples and `ceil(163,585 / 512) = 320` optimizer steps, so ten such windows give 3,200 steps. Each run processes 1,638,400 examples in full batches of 512. BCE early stopping is disabled for this control. Checkpoints are selected by the highest unweighted macro validation nDCG@10; the earliest exact tie wins. BCE is secondary. Test metrics do not select checkpoints.

The word “epoch” in the new run histories means a common validation window, not a full pass through a dataset. The existing ordered sampler is used within each window; Natural draws are truncated or cycled to fill the fixed budget, and Balanced cycles the smaller domain pools. Both modes use the same negative-sampling rule and seed/window schedule. Model A already trains three independent domain models through one mixed-domain loader and optimizer, so balance changes how its updates are allocated by domain. It does not create shared representations or cross-domain transfer.

## Exposure

The observed Natural source proportions are Food **30.84%**, Fitness **24.52%**, and Media **44.64%**. Balanced exposure is approximately one third per domain. Below is the recorded exposure for shared Model B, seed 42; small Natural count differences across seeds arise from the deterministic ordering. A run's unique example is a `(user, item, binary label)` tuple. Repeats include examples seen again in later windows, not just padding.

| Mode / domain | Unique examples | Sampled examples | Repeated examples | Sampled / unique | Exposure share |
| --- | ---: | ---: | ---: | ---: | ---: |
| Natural Food | 378,460 | 505,275 | 126,815 | 1.335x | 30.84% |
| Natural Fitness | 316,002 | 401,728 | 85,726 | 1.271x | 24.52% |
| Natural Media | 557,942 | 731,397 | 173,455 | 1.311x | 44.64% |
| Balanced Food | 378,460 | 546,140 | 167,680 | 1.443x | 33.33% |
| Balanced Fitness | 316,002 | 546,130 | 230,128 | 1.728x | 33.33% |
| Balanced Media | 427,850 | 546,130 | 118,280 | 1.276x | 33.33% |

Balanced sampling therefore repeats Fitness examples most heavily. It changes exposure, not the number of updates or total examples. Per-run/per-window counts for all 18 configurations are in [`equal_step_balance_control.json`](results/equal_step_balance_control.json).

## Held-out ranking results

The table reports test nDCG@10 as mean ± sample standard deviation across seeds 42/43/44. Delta is Balanced minus Natural, also mean ± sample SD. Parentheses show the number of seeds with a positive/negative delta; exact ties are not counted either way. Precision@10 and Recall@10 for each domain and macro average, plus every seed's full metrics and validation/training trajectories, are retained in the JSON artifact.

| Model / domain | Natural nDCG@10 | Balanced nDCG@10 | Balanced - Natural | + / - seeds |
| --- | ---: | ---: | ---: | ---: |
| B shared / Food | .006841 ± .006921 | .005398 ± .001259 | -.001443 ± .006523 | 2 / 1 |
| B shared / Fitness | .006671 ± .007358 | .005735 ± .001379 | -.000936 ± .006838 | 2 / 1 |
| B shared / Media | .002311 ± .002844 | .001692 ± .000837 | -.000619 ± .002019 | 2 / 1 |
| B shared / Macro | .005274 ± .002240 | .004275 ± .000602 | -.000999 ± .001868 | 1 / 2 |
| A independent / Food | .006454 ± .001014 | .004461 ± .003520 | -.001993 ± .002732 | 1 / 2 |
| A independent / Fitness | .007120 ± .001621 | .015531 ± .004808 | +.008411 ± .006337 | 3 / 0 |
| A independent / Media | .004494 ± .002104 | .002288 ± .002013 | -.002206 ± .002965 | 1 / 2 |
| A independent / Macro | .006023 ± .000712 | .007427 ± .001385 | +.001404 ± .000717 | 3 / 0 |
| C shared + domain offset / Food | .004102 ± .001988 | .006068 ± .000542 | +.001966 ± .001777 | 3 / 0 |
| C shared + domain offset / Fitness | .004597 ± .004100 | .002980 ± .002593 | -.001617 ± .006059 | 1 / 2 |
| C shared + domain offset / Media | .001536 ± .001981 | .001271 ± .001328 | -.000266 ± .000760 | 1 / 1 |
| C shared + domain offset / Macro | .003412 ± .002038 | .003440 ± .000295 | +.000028 ± .002331 | 2 / 1 |

The trajectories contain ten common windows for each run, including training BCE and per-domain validation BCE and nDCG@10. Ranking-selected windows vary by model, sampler and seed; the results do not show one consistent convergence advantage for Balanced. They show different domain trade-offs: A's balanced Fitness and macro nDCG gains repeat across all three seeds, while its Food and Media means decline; C's Food gain repeats, while Fitness and Media are mixed; B's macro mean is lower with Balanced. Three seeds are descriptive, not enough to claim significance or settle small effects.

## Interpretation and limits

The evidence supports **domain-specific mixed effects**, not a universal benefit from balancing. With Model B, the earlier Balanced advantage is not retained in the equal-step macro mean. This does not establish that extra training explained most of the old difference: the new control also uses a fixed 3,200-step budget, disables early stopping, and evaluates at a common 320-step cadence, unlike the original epoch-based runs. Those protocol differences prevent a clean causal decomposition of the old result. The original results remain unchanged and are included for context in the JSON artifact.

This is a 1,000-user, 1/1-filtered warm-start cohort with low warm-item coverage: **22.66% Food, 12.01% Fitness, and 19.78% Media** of test positives are warm. Cold-item exclusions and sparse histories limit the interpretation. The models are small offline Amazon product-preference experiments, not food, exercise, or streaming behavior. No significance tests were added, and no frozen MovieLens runs were retrained.

At the time this three-seed note was written, the proposed follow-up was a paired extension to seeds 45, 46, and 47. That replication is now complete below. The next research phase should address the low warm-item coverage and cohort construction; it should be a separately defined experiment, not another automatic seed extension.

## Reproduction and validation

Run the experiment with `research/.venv/bin/python research/equal_step_control.py`. The result file contains the predeclared budget, source/candidate/code hashes, all per-window histories, exposure counts, test metrics, paired deltas, original-run comparison and deterministic replay check. Focused equal-step tests are in `test_equal_step_control.py`.

The original three-seed run covered A/B/C × Natural/Balanced × seeds 42/43/44, plus a repeated Balanced B seed-42 determinism check. All nine Natural/Balanced pairs used exactly 3,200 steps and 1,638,400 examples per run. The B pairs and repeat were validated before the script proceeded to A/C. Existing result files were verified unchanged. Its result remains in [`equal_step_balance_control.json`](results/equal_step_balance_control.json).

## Six-seed replication

The follow-up added seeds **45, 46, and 47** for the same A/B/C and Natural/Balanced configurations. It reused the fixed cohort, source data, IDs, temporal splits, negative sampler, candidates, model sizes, optimizer, batch size, 3,200-step maximum and macro validation nDCG@10 checkpoint rule. New runs were saved individually, selected checkpoints were reloaded and checked, and each paired run was asserted to have exactly 3,200 steps and 1,638,400 sampled examples. Model B was completed and validated first. No new deterministic duplicate was needed: the earlier seed-42 Balanced B replay remains the determinism check.

All values below are test nDCG@10 across seeds 42–47, shown as mean ± sample SD. Precision@10 and Recall@10 are included in the result artifact with the same summaries.

| Model / domain | Natural mean ± SD | Balanced mean ± SD |
| --- | ---: | ---: |
| B shared / Food | .006860 ± .004786 | .006000 ± .001396 |
| B shared / Fitness | .006001 ± .006377 | .005762 ± .001539 |
| B shared / Media | .002192 ± .002315 | .002374 ± .002143 |
| B shared / Macro | .005018 ± .001888 | .004712 ± .000780 |
| A independent / Food | .005826 ± .001415 | .005459 ± .002607 |
| A independent / Fitness | .006960 ± .001756 | .011563 ± .005497 |
| A independent / Media | .003629 ± .001815 | .002976 ± .001833 |
| A independent / Macro | .005472 ± .000937 | .006666 ± .001410 |
| C shared + domain offset / Food | .004210 ± .001621 | .007175 ± .002129 |
| C shared + domain offset / Fitness | .004147 ± .003147 | .005431 ± .003575 |
| C shared + domain offset / Media | .001523 ± .001339 | .002252 ± .003140 |
| C shared + domain offset / Macro | .003293 ± .001557 | .004953 ± .002173 |

Paired deltas are Balanced minus Natural. The table gives the mean delta, median delta, and counts of seeds where Balanced was better/worse; there were no exact ties in these comparisons.

| Model / domain | Mean delta | Median delta | Better / worse |
| --- | ---: | ---: | ---: |
| B / Food | -.000860 | +.000282 | 3 / 3 |
| B / Fitness | -.000238 | +.002399 | 4 / 2 |
| B / Media | +.000182 | +.000233 | 4 / 2 |
| B / Macro | -.000306 | -.000468 | 2 / 4 |
| A / Food | -.000367 | +.000161 | 3 / 3 |
| A / Fitness | +.004603 | +.002420 | 5 / 1 |
| A / Media | -.000653 | +.000219 | 4 / 2 |
| A / Macro | +.001194 | +.001047 | 5 / 1 |
| C / Food | +.002965 | +.001720 | 6 / 0 |
| C / Fitness | +.001284 | +.001561 | 4 / 2 |
| C / Media | +.000729 | -.000328 | 2 / 3 (1 tie) |
| C / Macro | +.001659 | +.001425 | 5 / 1 |

The artifact also records each paired delta's sample SD, min/max, per-seed values, and the A/B/C architecture comparisons for each sampler and domain. Architecture means ± sample SD are shown below; names A/B/C refer to Independent, Shared, and Shared + Domain Offset respectively.

| Sampler / domain | A | B | C |
| --- | ---: | ---: | ---: |
| Natural / Food | .005826 ± .001415 | .006860 ± .004786 | .004210 ± .001621 |
| Natural / Fitness | .006960 ± .001756 | .006001 ± .006377 | .004147 ± .003147 |
| Natural / Media | .003629 ± .001815 | .002192 ± .002315 | .001523 ± .001339 |
| Natural / Macro | .005472 ± .000937 | .005018 ± .001888 | .003293 ± .001557 |
| Balanced / Food | .005459 ± .002607 | .006000 ± .001396 | .007175 ± .002129 |
| Balanced / Fitness | .011563 ± .005497 | .005762 ± .001539 | .005431 ± .003575 |
| Balanced / Media | .002976 ± .001833 | .002374 ± .002143 | .002252 ± .003140 |
| Balanced / Macro | .006666 ± .001410 | .004712 ± .000780 | .004953 ± .002173 |

Architecture contrasts are paired per seed. The entries below show mean B−A, C−A, and C−B nDCG deltas (sample SD), followed by positive/negative seed counts. The artifact also has medians, ranges and per-seed values.

| Sampler / domain | B−A: mean ± SD; +/− | C−A: mean ± SD; +/− | C−B: mean ± SD; +/− |
| --- | ---: | ---: | ---: |
| Natural / Food | +.001034 ± .004132; 4/2 | -.001617 ± .002313; 1/5 | -.002651 ± .005041; 2/4 |
| Natural / Fitness | -.000959 ± .006381; 2/4 | -.002813 ± .003822; 1/5 | -.001854 ± .003680; 3/2 (1 tie) |
| Natural / Media | -.001437 ± .001403; 1/5 | -.002106 ± .001521; 1/5 | -.000669 ± .001490; 3/3 |
| Natural / Macro | -.000454 ± .001480; 2/4 | -.002179 ± .001742; 1/5 | -.001724 ± .001405; 1/5 |
| Balanced / Food | +.000541 ± .002531; 4/2 | +.001716 ± .003304; 4/2 | +.001175 ± .001234; 5/1 |
| Balanced / Fitness | -.005801 ± .005617; 1/5 | -.006132 ± .008290; 2/4 | -.000331 ± .004231; 2/4 |
| Balanced / Media | -.000603 ± .003307; 2/4 | -.000724 ± .004001; 1/4 (1 tie) | -.000122 ± .001143; 3/3 |
| Balanced / Macro | -.001954 ± .001927; 1/5 | -.001713 ± .003212; 2/4 | +.000241 ± .001797; 2/4 |

## Updated interpretation

- **Model B macro:** Balanced remains lower on average, but the delta is modest (-.000306), variable (SD .001697), and favors Balanced in only 2/6 seeds. This is not a strong basis to rank the samplers universally.
- **Model A Fitness:** the Balanced gain is now 5/6 seeds, not all six. Mean delta is +.004603 with SD .006080, so the direction is fairly consistent but its size is seed-sensitive.
- **Model C Food:** the Balanced gain holds in all six seeds, mean +.002965, SD .003084. This is the clearest sampling/domain pattern in this control.
- **Model C macro:** the three-seed result looked flat; the six-seed mean delta is +.001659, positive in 5/6 seeds. That earlier “approximately flat” observation does not hold in this extended sample, though variability remains (SD .002767).
- At least 5/6 same-direction results occur for A Fitness and A macro, C Food and C macro. Other domain/method pairs remain mixed. Media has no consistent Natural-vs-Balanced direction.

Seed variability remains material. For example, Natural B Fitness and Media each include a zero nDCG seed and have CVs just over 1; Balanced C Media also has high dispersion (CV about 1.39). CV is omitted when the mean is below 1e-6 and should be treated cautiously for these small, low-valued metrics. No significance tests were run.

Food's most repeatable result is C with Balanced sampling. Fitness favors Balanced for A in 5/6 seeds, but not consistently across B/C. Media remains mixed. Model architecture comparisons also depend on domain and sampler; no overall winner follows from macro alone. Fixed warm-item coverage remains low: **22.66% Food, 12.01% Fitness, and 19.78% Media**. These are Amazon product preferences, not live food/fitness/media behavior.

The six-seed artifact is [`equal_step_balance_control_6seed.json`](results/equal_step_balance_control_6seed.json). Run the added replication with `research/.venv/bin/python research/equal_step_replication.py`; it refuses to overwrite the result and resumes completed runs from its ignored progress record. The full research suite now passes **61/61 tests**; compilation, JSON validation, fixed-step/example assertions, candidate fingerprints, checkpoint reloads, and `git diff --check` pass. The next experiment should examine warm-item coverage and cohort construction while keeping this six-seed sampling result fixed.
