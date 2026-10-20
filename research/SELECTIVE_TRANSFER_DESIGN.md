# Selective Transfer: Design Audit

Status: design only, 2026-10-14. No model, inference, installation, or training was run for this audit. The naive-sharing study remains frozen. This document proposes a decision for approval, not permission to execute it.

## 1. Decision and empirical motivation

**B. A faithful SyNCRec baseline is not practical as the next small local experiment.** This is an execution/reproduction decision, not a mathematical incompatibility. SyNCRec is already multi-domain, not a two-domain method. Its official implementation needs substantial reconciliation with the paper and our evaluation contract before it could be called faithful.

Recommend **D: independent NeuMF branches with a domain-gated shared-user residual**. This tests one selective-sharing mechanism, not SyNCRec reproduction. It keeps an independent prediction path available rather than adding another sequential architecture.

Frozen historical V2 macro nDCG means: A 0.004239715, B 0.004139369, C 0.004138107. Expanded seed-42 macro values: Most Popular 0.0017443302717580478, A 0.0020414444315519855, B 0.0018636107591094876, C 0.002174579688245429. Shared models improve Food directionally and lose Fitness relative to A; all paired nDCG intervals contain zero. Media has no Top-10 hits despite valid candidates and finite scores. These motivate testing interference, but do not prove it or establish an overall winner. The two cohorts are not a matched comparison.

## 2. SyNCRec: mathematical specification

Sources: [paper, Sections 3-5](https://arxiv.org/html/2407.11245v1), [official implementation](https://github.com/cpark88/SyNCRec/tree/2292eef3da4d33434d4f4e7f37938d0e40aa120f). Paper notation below is transcribed compactly; implementation differences follow separately.

Pacer = SDSR tasks; Runner = CDSR task. For domains \(\mathcal D\), \(|\mathcal D|\ge3\), use chronological sequences \(X^d\) and their ordered merge \(X\). There are \(|\mathcal D|+1\) prediction tasks. Item/position embeddings are shared. Causal Transformer experts encode padded/truncated histories. Let \(F_k\) be expert \(k\), \(g\) softmax gates, \(h\) towers, and \(\operatorname{sg}\) stop-gradient. Equations (2)-(4):

\[
Y_s^d=h^d\!\left[\sum_{k\le j}g_k^d(E^d)\operatorname{sg}F_k(E^d)
+\sum_{k>j}g_k^d(E^d)F_k(E^d)\right],\quad
g^d(E^d)=\operatorname{softmax}(W_g^d\operatorname{vec}E^d),
\]
\[
Y_c=h^c\!\left[\sum_{k\le j}g_k^c(E)F_k(E)
+\sum_{k>j}g_k^c(E)\operatorname{sg}F_k(E)\right].
\]

Both paths consume expert outputs; their expert-gradient partitions differ. Shared embeddings are not independent teachers. Chronologically aligned single/cross representations cooperate through experts, loss correction, and mutual information. Inference uses the cross-domain representation.

Paper equations (8)-(12), with \(v\in\{s,c\}\), aligned domain positions \(T_d\), positive/negative items \(i^+,i^-\):

\[
p_v(i)=\sigma(y_v^\top M_i),\quad
q_{v,t}=\log\sigma\big(p_v(i^+)-p_v(i^-)\big),\quad
\phi_d=\sum_{t\in T_d}(q_{s,t}-q_{c,t}),
\]
\[
\lambda_d^{(b)}=
\frac{\exp[(\alpha\lambda_d^{(b-1)}+\beta\phi_d^{(b)})/\delta]}
{\sum_e\exp[(\alpha\lambda_e^{(b-1)}+\beta\phi_e^{(b)})/\delta]},\quad
L_c^{lc}=\sum_d\lambda_d\sum_{t\in T_d}q_{c,t}.
\]

Equations (16)-(18), domain-aligned views \(U_u^d,V_u^d\), other users \(u^-\):

\[
\rho(U,V)=\sigma(U^\top W^H V),\quad
J_d=\rho(U_u^d,V_u^d)-\log\sum_{u^-}\exp\rho(U_{u^-}^d,V_u^d),
\]
\[
L=\eta\left(\sum_d L_s^d+L_c^{lc}\right)+(1-\eta)\sum_d J_d.
\]

The paper defines negative transfer through \(L_s^d-L_c^d<0\), intending smaller corrected cross-domain gradients. Its displayed log-sigmoid/MI terms have maximization signs despite being called losses. Do not silently turn these into an unambiguous minimization recipe: sign, normalization, and MI denominator require reconciliation with code. Ordered histories, consistent IDs, domain membership, causal alignment, and within-domain scoring are required; metadata/LLMs are not.

Paper evaluation/settings: Amazon and Telco, five domains each; leave-one-out; 99 sampled negatives; HR/nDCG@5/10 and MRR@10; embedding/batch/sequence length 128; Adam. Baselines span BPRMF/GCMC, SASRec/S3Rec, CMF/CAT-ART, C2DSR/CGRec. This is not our global-time, full warm-catalog evaluation. The paper's public description does not establish our rating>=4 filter or exact raw-to-cohort recipe.

## 3. Official code audit

Inspected main at **2292eef3da4d33434d4f4e7f37938d0e40aa120f**, without installing or executing it. Findings are static code observations, not claims about the authors' unpublished experiment environment.

| Area | Finding and consequence |
|---|---|
| Environment | Python 3; no explicit supported minor-version contract found. Committed CPython 3.10 caches suggest use, not a requirement. `requirements.txt` pins torch 2.2.1+cu118, pandas 2.2.1, scipy 1.10.1, tqdm 4.65.0 and many unrelated packages. It is not a minimal portable environment. |
| Hardware | `run_pretrain.py` initializes CUDA/NCCL from distributed environment variables. Trainer calls `.module`; CPU/single-device operation is not a clean supported path. `train.sh` launches four processes. No trustworthy measured peak-memory requirement is published in the inspected files. |
| Sequence format | Parallel lists of comma-separated domain IDs, item IDs, timestamps serialized to pickle. Loader consumes type/item lists; chronology must already be correct. PAD/special IDs 0-4 are excluded from negatives. |
| Domains | `pretrain_seq` and reporting hard-code IDs `[5,6,7,8,9]`; launch uses six tasks. Three domains require removing those constants and index assumptions, not inventing a new theoretical architecture. |
| Preparation | `Preprocessing` reads prebuilt `amazon_seq.txt` plus separate vocab files. It does not establish train-only vocabulary construction or rebuild chronological reviews for us. Custom data need an adapter with explicit split/tie/mapping contracts. |

Sources: [requirements](https://github.com/cpark88/SyNCRec/blob/2292eef3da4d33434d4f4e7f37938d0e40aa120f/src/requirements.txt), [launcher](https://github.com/cpark88/SyNCRec/blob/2292eef3da4d33434d4f4e7f37938d0e40aa120f/src/train.sh), [preprocessing](https://github.com/cpark88/SyNCRec/blob/2292eef3da4d33434d4f4e7f37938d0e40aa120f/src/preprocessing.py), [dataset conversion](https://github.com/cpark88/SyNCRec/blob/2292eef3da4d33434d4f4e7f37938d0e40aa120f/src/make_dataset.py).

Reproduction blockers in [models.py](https://github.com/cpark88/SyNCRec/blob/2292eef3da4d33434d4f4e7f37938d0e40aa120f/src/models.py):

- `ModuleList([self.item_encoder ...])`, towers, and gates repeat object references. They are not independent expert/tower instances. Detaching one call does not isolate parameters updated through another call to the same module.
- Training uses positive/negative binary cross-entropy, not the displayed pairwise probability-difference objective. Final scaling divides single/cross losses by 1000 and adds an MI proxy rather than implementing the displayed eta-weighted expression literally.
- NTG updates reconstruct tensors from loss/weight values. This detaches paths needed to learn alpha/beta through the final weighted loss. The released MI proxy also differs from the paper's displayed multi-user InfoNCE expression.

In [modules.py](https://github.com/cpark88/SyNCRec/blob/2292eef3da4d33434d4f4e7f37938d0e40aa120f/src/modules.py), partitioned gating adds random noise even in evaluation, without a `self.training` guard. That would require an explicit reproducibility decision.

In [datasets.py](https://github.com/cpark88/SyNCRec/blob/2292eef3da4d33434d4f4e7f37938d0e40aa120f/src/datasets.py), train slices are `[:-3]`/`[1:-2]`; negatives exclude the complete stored sequence, including future items. Evaluation generates 100 negatives plus the target, unlike the paper's 99. These are not our train-only sampler or candidate protocol.

In [run_pretrain.py](https://github.com/cpark88/SyNCRec/blob/2292eef3da4d33434d4f4e7f37938d0e40aa120f/src/run_pretrain.py), each epoch evaluates `data_type='test'` and selects by `scores[-4]` (nDCG@5). The provided shell sets one epoch, length 50, hidden size 512, five experts; parser defaults differ. [trainers.py](https://github.com/cpark88/SyNCRec/blob/2292eef3da4d33434d4f4e7f37938d0e40aa120f/src/trainers.py) drops most incomplete evaluation batches and assumes five-domain reporting. We must not transplant this selection loop.

Thus neither option C (two-domain restriction) nor an unqualified A (ready faithful baseline) is supported. A later paper-faithful implementation is possible, but requires resolving discrepancies, sequence tests, device adaptation, and separate compute approval. It would be a sequential-method study, not a three-parameter modification to NeuMF.

## 4. Data compatibility

| Required input | Status | Our evidence / necessary preparation |
|---|---|---|
| Common user IDs across domains | COMPATIBLE | Shared reviewer ID; existing mappings. |
| Item IDs and domain labels | COMPATIBLE | Domain-qualified item keys avoid cross-catalog collisions. |
| Positive events | COMPATIBLE | Rating>=4 is available; our declared choice, not an asserted paper default. |
| Chronological order | PARTIALLY COMPATIBLE | Timestamps exist, but tied events do not reveal an internal order. Predict tied targets from strictly earlier history; never treat an arbitrary tie sort as observed sequence. |
| Mixed and domain-specific histories | COMPATIBLE | Derivable by merge/filter using timestamps; preserve causal alignment and train-only vocabulary. |
| Ready-made sequence tensors and targets | PARTIALLY COMPATIBLE | Not the current NeuMF training interface; need padding/truncation, masks, aligned next-domain targets and explicit empty-history handling. |
| True consumption/workout/session sequence | INCOMPATIBLE | Reviews are product-preference proxies, not eating, exercise, or viewing sessions. Not required to model review sequences. |
| Text, audio, nutrition, user attributes | Not required | Do not invent them or add them to this experiment. |

Food=Grocery & Gourmet Food; Fitness=Sports & Outdoors; Media=Movies & TV. They are not the paper's full five-category Amazon population. Three-domain sequences are feasible without extending SyNCRec's domain cardinality. A faithful mechanism under our cutoffs would still be a benchmark adaptation, not reproduction of its published metrics.

## 5. Minimum controlled model

| Candidate | Assessment |
|---|---|
| Domain scalar gate | Three learned values, directly tests whether domains need different sharing strength. Selected. |
| User/domain/history-conditioned gate | Could vary sharing within a domain, but adds gate-network capacity and threshold/features choices. Defer until domain-level selectivity has evidence. |
| Runner/Pacer teacher or expert objectives | Closer to SyNCRec but adds branches, sequence encoders, loss weights and training-cost confounds. Not a minimal next NeuMF control. |

### D: gated residual over independent branches

For branch \(b\in\{GMF,MLP\}\), domain-private user vectors \(p_{u,d}^b\), shared vectors \(s_u^b\), and one scalar per domain:

\[
g_d=\sigma(a_d),\qquad z_{u,d}^b=p_{u,d}^b+g_d s_u^b.
\]
\[
f_D(u,i,d)=w_d^\top\left[(z_{u,d}^{GMF}\odot q_{i,d}^{GMF});
MLP_d([z_{u,d}^{MLP};q_{i,d}^{MLP}])\right]+b_d,
\]
\[
\mathcal L_D=\frac1{|\mathcal B|}\sum_{(u,i,d,y)\in\mathcal B}
\left[\operatorname{softplus}(f_D)-y f_D\right].
\]

Only the two shared-user tables and three scalar logits are added to A. Item tables, private users, MLPs and output heads remain independent. All parameters/gates learn jointly from TRAIN BCE; validation selects a checkpoint only. No teacher, NTG surrogate, auxiliary loss, gate pretraining, or hand-assigned Fitness penalty.

Initialize private branches exactly as A before drawing added tables. Initialize both shared tables Normal(0,0.01), then gate logits to zero (gates=0.5). The same gate is used in both branches. No gate penalty, normalization, or extra optimizer group. This initialization is fixed before implementation/testing, not tuned to test ranks.

At a fixed zero gate, D is exactly A and a target-domain loss has no gradient into shared users. A learned sigmoid gate can approach, not attain, zero. For each branch, \(\partial\mathcal L_d/\partial s_u^b=g_d\,\partial\mathcal L_d/\partial z_{u,d}^b\). Smaller gates attenuate this shared path; private heads are not exposed to other domains' gradients. This is a proposed mechanism, not a guarantee of benefit.

Important limitation: free embeddings can absorb scale changes and private vectors can absorb residuals. Gates are not identifiable causal transfer coefficients. Log both gates and \(\|g_ds_u^b\|/(\|p_{u,d}^b\|+10^{-12})\) on TRAIN users, plus gradient connectivity. Do not claim that a smaller Fitness gate proves interference. This tests optimization/parameter coupling, not a new identifiable latent factorization or source-specific transfer matrix.

### Baselines and one necessary ablation

- A: independent user/item representations and heads.
- B: shared users and shared MLP/output, disjoint item blocks, domain embedding.
- C: B plus private user offsets; a zero shared-user contribution alone would still leave shared head weights.
- D: A plus the gated residual above; no shared head. A scalar gate inserted only into C would not provide A's independent fallback.
- **D-fixed:** exactly D with all gates fixed at 0.5, matching D's initial function and added capacity. This is one ablation of D, not another architecture family. It isolates learning the gate from merely adding a residual. Fixed-zero equivalence to A is a unit test, not another training run.

D versus B/C alone cannot attribute improvement to gates because their head sharing differs. D versus D-fixed is mandatory for that claim. Frozen A/B/C seed42 outputs may be reused only after exact provenance checks; do not rerun them under this approval.

## 6. Predeclared hypotheses and decision rules

Primary outcome: unweighted macro nDCG@10 with the existing warm-user aggregation. Also report P/R@10, domain results, paired-user intervals and coverage; no selecting the best metric afterward.

H1: D exceeds both B and D-fixed in macro validation and test nDCG@10 direction.

H2: D improves Fitness nDCG over B and reduces the deficit relative to A.

H3: D retains a positive Food nDCG difference versus A rather than recovering Fitness by sacrificing Food.

H4 (mechanistic, not causal): D develops domain-differentiated effective shared contributions; gate learning improves over the fixed-gate control. No preassigned gate ordering is required.

Replication is worth proposing only if H1-H3 hold directionally, macro test D-A is nonnegative, diagnostics show an operative shared path, and measured runtime is <=1.3x A. Require these same directional tests on validation before viewing test results. Freeze both checkpoints first, evaluate once, then report every outcome. Within-fit CIs can include zero at feasibility; a positive point estimate alone is not evidence of superiority. These are screening rules, not significance or clinical/practical benefit thresholds.

Stop and report failure/mixed evidence if D does not beat D-fixed, trades away Food, fails to reduce Fitness degradation, or exceeds cost limits without a clear benefit. Treat all gates <0.05 or all >0.95 as a saturation warning, not automatic success. All-zero-like rejection can be a valid conclusion that sharing is unhelpful, but cannot justify a positive selective-transfer claim. Equal/near-fixed gates, negligible residuals, or rankings indistinguishable from A/D-fixed weaken the mechanism claim. Do not fix those outcomes by changing gate initialization, penalties or test thresholds.

## 7. Data, Media and budget policy

Primary: **expanded 7,016-user benchmark only**. Historical V2 stays descriptive background. Preserve train-only >=5 positives/domain eligibility, rating>=4, exact calendar cutoffs, mappings, prepared queries, chronological exclusions and tie-breaking. No cohort reselection.

Media remains in Balanced training, the three-domain macro and checkpoint selection. Its zero @10 result cannot identify beneficial or harmful transfer. For the prospective D study predeclare **Media Recall@100 and nDCG@100** as secondary diagnostics, plus positive-rank quartiles; keep K=10 primary. No @50 sweep and no larger-K checkpoint selection. Existing A/B/C Media rank files allow new, clearly versioned diagnostic summaries without inference. Do not rewrite the frozen benchmark's K or label new @100 summaries original results. All models must use identical users/candidates. Gate activity alone is not Media recommendation improvement.

Budget for D and D-fixed: seed42, Balanced complement-position-v1 sampler, four negatives, batch512, Adam lr0.001, identical existing BCE, 12,486 steps and 6,392,832 draws. No weight decay added. Preserve exact sampled-stream fingerprint; extra model RNG draws must not affect the sampler. Validation at:

`1249, 2497, 3746, 4994, 6243, 7492, 8740, 9989, 11237, 12486`.

Select highest macro validation nDCG@10, earliest exact tie. Never force D to use the old step2497. Keep ten opportunities, no early stopping, no extra post-test search. Equal exposure is the primary fairness constraint; report measured time/RSS/parameters separately. A materially slower future teacher design would need a separate compute-matched control, not silently receive extra passes.

## 8. Seeds and estimated compute

Stage1, only after approval: two fits, D42 and D-fixed42, using frozen expanded A/B/C42 references. Stage2 is a request for separate approval, not automatic: D/D-fixed plus matched A/B/C seeds43-44 if the screening rules justify it. The current prohibition on new A/B/C seeds remains in force. Without matched new controls, do not claim three-seed comparative evidence. Stage3: six seeds only for a justified final comparison, never to pursue significance.

Parameter estimate from current definitions: A 5,863,763; B 5,411,645; C 6,085,181. D adds \(2\times7016\times16+3=224515\), giving **6,088,278 trainable parameters**. D-fixed has 6,088,275 trainable parameters. A's private embeddings/heads are reused structurally, not loaded as pretrained weights. No extra domain embedding is added.

Estimated D/D-fixed fit time: **38-50 minutes each**, roughly 1.0-1.3x measured A; two fits **76-100 minutes**, plus approximately 5-15 minutes preparation/evaluation allowance. This is an estimate, not a measurement or wall-clock guarantee. Baseline A/B/C fit times were 38.2/35.1/38.3 minutes. A full fresh A/B/C/D/control seed would be about 188-212 fit-minutes, but is not needed for Stage1 and is not authorized.

Added FP32 weights+gradients+Adam moments are about 3.43 MiB (16 bytes per added parameter), excluding activations/allocator overhead. Expect RSS in the same order as the observed ~1.0-1.1 GiB baseline peaks; provision 1-2 GiB, retain the existing 6GiB warning/10GiB stop guards. Exact memory requires a future technical preflight. Official SyNCRec has no credible local runtime estimate: multiple sequential expert passes and O(batch*heads*sequence_length^2) attention activations are not comparable to this residual's cost.

## 9. Implementation footprint if approved

Prefer zero new Python files and one compact class in `multidomain_model.py`, leaving A/B/C initialization and definitions unchanged. A small shared embedding-to-score helper in `model.py` avoids copying NeuMF's forward math; test bitwise equivalence of the old path. Extend `training.py` dispatch/config/provenance only for D/fixed, reusing the same sampler, loss, checkpoint selection and evaluator. Keep the explicit expanded protocol in the existing frozen-config style; no manager or new runner framework.

Estimated footprint: 4-5 existing Python files, roughly 120-200 implementation/config lines plus 80-120 focused test lines; one future protocol artifact. Tests belong in existing model/foundation test files. Cover zero-gate=A, no cross-domain private gradients, correct shared gradients, gate trainability, D/fixed initial-state equivalence, exact sample-stream matching, count accounting and unchanged A/B/C outputs. Reuse saved rank records for larger-K diagnostics rather than build another evaluation framework.

**Exact next coding task, subject to approval:** implement D and its fixed-0.5 mode, the shared score helper and focused synthetic tests; prepare a separate protocol and no-training parameter/memory preflight. Full seed42 training requires explicit authorization after those checks. Do not touch frontend/backend or overwrite any existing experiment artifact.

## 10. Limits and paper roles

The proposed D is non-sequential and only SyNCRec-inspired in preserving private learning while controlling a shared path. It has no ACMoE, NTG correction, SC-MIM, or claim of faithful Runner/Pacer reproduction. A domain scalar cannot select particular source domains or individual users; shared-vector scale and private compensation limit gate interpretation. Partial overlap/cold users, review-timestamp uncertainty, low warm coverage and the Media floor remain unsolved.

The original paper provides a defensible motivation for selective cooperation, not evidence that this simplified model will work. Any eventual faithful SyNCRec study needs separately documented fixes versus released code, causal sequence construction, train-only vocabulary/sampling, validation-only selection, and realistic hardware estimates.

This design was motivated by already observed A/B/C test results. Predeclaring D now prevents further outcome-driven changes, but does not make this reused benchmark an untouched confirmatory test. New training seeds measure initialization variability, not independence from benchmark-level design choices. Report that limitation even if D succeeds; stronger generalization would eventually require separately held-out data or another benchmark.

Impatient Bandits is reserved for later feedback/replay, TimeMCL for later diversity, and Microsoft Recommenders/CRSLab for engineering references. None supplies an additional loss, component or success claim in D. No offline model is connected to the application.
