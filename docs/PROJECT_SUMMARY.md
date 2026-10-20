# ContextFit Project Summary

## Resume

Built ContextFit, a leakage-aware cross-domain recommendation research platform and full-stack adaptive recommendation application. Evaluated independent, shared-user, domain-offset, and selective-residual NeuMF models on a 7,016-user Amazon global-time benchmark; implemented deterministic memory-safe sampling, matched training streams, validation-only checkpoint selection, full-catalog ranking, provenance fingerprints, and paired bootstrap analysis. The study found no reliable overall benefit from naïve sharing or learned scalar gating under the tested protocol and documented sparse-item and cross-domain relatedness limits.

## LinkedIn

I built ContextFit to investigate when cross-domain recommendation helps and when it causes negative transfer. The project combines a leakage-safe Amazon Reviews 2023 research pipeline with a separate interactive React/Node recommendation application. On the research side, I compared independent and shared NeuMF variants, controlled for additional representation capacity, and audited temporal, representation, gradient, cold-start, and subgroup evidence. The results are intentionally reported as protocol-specific: cross-domain sharing did not show a reliable advantage on the tested Food/Fitness/Media product-preference benchmark. Engineering work focused on deterministic sampling and matched streams, train-only cohort/mapping construction, test isolation until checkpoint freeze, full-catalog ranking, paired-user uncertainty, streamed dataset processing, and reproducible provenance.

## Portfolio

**ContextFit: Transferability-Aware Cross-Domain Recommendation** is a completed research and engineering project. It tests whether Amazon reviewers' preferences transfer across Grocery & Gourmet Food, Sports & Outdoors, and Movies & TV under a global calendar-time split. Independent NeuMF, naïve shared-user, domain-offset, fixed-residual, and learned-residual variants were evaluated with train-only eligibility and mappings. Additional audits measured cold-start coverage, item support, user history, transition structure, representation similarity, gradient interaction, and two predeclared secondary category pairs. The evidence supports a bounded negative result: these categories did not provide a reliable transfer advantage under the tested protocol; this does not imply that transfer fails universally. A separate React/Vite and Node/Express application demonstrates persistent feedback-driven recommendations and workout context, but does not serve the offline research models.

## Engineering Contributions

- Deterministic, memory-bounded negative sampling for future expanded-cohort runs; historical experiments retain their original sampler provenance.
- Matched model input streams and cryptographic sampling/protocol fingerprints.
- Train-only cohort eligibility and mappings with global calendar-time separation.
- Validation-selected checkpoints with test scoring deferred until all matched checkpoints are frozen.
- Full-catalog warm-item ranking, consistent Precision/Recall/nDCG aggregation, and paired user-bootstrap uncertainty.
- Streamed Amazon source processing and frozen train-only domain-pair screening.
- Provenance-rich JSON records, derived CSV tables, hash verification, and research integrity tests.
- Separate live application loop with user-isolated persisted feedback and immediate recommendation refresh.

## Claim Boundary

The study does not claim general superiority or universal failure of cross-domain recommendation. Expanded architecture results use a single training seed, while the historical V2 architecture comparison uses three seeds and a different protocol. User-bootstrap intervals are within-fit uncertainty, not training-seed confidence intervals. Amazon product categories are behavioral proxies, not direct measures of nutrition, exercise, or media consumption.
