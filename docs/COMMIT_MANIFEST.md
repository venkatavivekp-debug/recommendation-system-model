# Milestone Commit Manifest

**All inventory rows are INCLUDE.** This is the reviewed milestone inventory, not an instruction to stage or publish. The status counts and path statuses describe the pre-commit snapshot, not the current working tree. Existing historical work is preserved.

- Repository: `venkatavivekp-debug/recommendation-system-model`
- Branch: `main`
- Base commit: `27a7ebf03e80a2ad8b9a26b996f69df48e73bc87`
- Modified tracked paths: 57
- Visible untracked paths: 117
- Intended paths: 174
- Staged paths: none

All 117 visible untracked files are classified INCLUDE individually below: required application source/tests, documentation, research reproducibility code, and frozen scientific artifacts. No visible untracked path is IGNORE or TEMPORARY-REMOVE. Ignored data and tooling are separately excluded below. No scientific artifact or checkpoint was regenerated.

SHA-256 and byte counts are current for every included file except this manifest: its own digest/size are deliberately omitted to avoid self-reference. Its existence and unique inclusion are checked separately.

## Newly Included Adaptive Core Paths

These 13 paths were missing from the earlier manifest. All are INCLUDE; none is a temporary helper.

| Path | Classification | Reviewed reason |
|---|---|---|
| `backend/src/models/dataStore.js` | INCLUDE | Atomic JSON persistence, isolated-copy reuse and compact impression serialization. |
| `backend/src/models/mongo/recommendationInteractionDocument.js` | INCLUDE | Persist canonical event/domain/candidate fields in the existing Mongo schema. |
| `backend/src/models/mongo/userDocument.js` | INCLUDE | Persist per-user/per-domain adaptivePolicies. |
| `backend/src/models/recommendationInteractionModel.js` | INCLUDE | Durable canonical impression lookup and idempotent feedback records. |
| `backend/src/models/userContentInteractionModel.js` | INCLUDE | Idempotent Media feedback persistence. |
| `backend/src/models/userModel.js` | INCLUDE | Atomic user/domain policy mutation and Mongo compare-and-swap. |
| `backend/src/services/banditDecisionService.js` | INCLUDE | Single LinUCB feature/ranking/impression/update implementation. |
| `backend/src/services/evaluationService.js` | INCLUDE | Remove unsupported delayed-reward proxy calculation. |
| `backend/src/services/mlService.js` | INCLUDE | Do not double-learn versioned policy feedback through legacy weight updates. |
| `backend/src/services/nutritionPlannerService.js` | INCLUDE | Retain explicit Food-to-Fitness context provenance in advisory guidance. |
| `backend/src/services/recommendationService.js` | INCLUDE | Reuse policy in existing generic ranked path; remove downstream random exploration. |
| `backend/src/services/searchService.js` | INCLUDE | Avoid logging a second impression for the same returned Food card. |
| `backend/src/utils/feedbackSignals.js` | INCLUDE | Canonical explicit immediate reward mapping and no silence-derived policy update. |

## Reviewed Stale-Hash Resolutions

All 17 paths are unchanged in name. Each diff was reviewed as approved Adaptive Core work layered on the inherited project changes, not treated as corruption. The old digest below identifies the superseded manifest entry; the current full digest appears in the inventory. No research artifact is in this stale set.

| Same old/current path | Previous SHA-256 | Intended reason for changed hash |
|---|---|---|
| `README.md` | `ae24041382bf5b44eff8b3519a6d8b5418613eeaf1bf09e77556ea9058b53666` | Final title, LIVE/OFFLINE boundary, fixed LinUCB schema, immediate-feedback policy and measured latency. |
| `backend/src/controllers/contentController.js` | `6446f7053ce22fd6661f1b86a2f48b7f5677a2e6003f665a828ff7e4d24abd53` | Carry original impression IDs and context; log only final Media response and validate explicit feedback. |
| `backend/src/controllers/foodController.js` | `df4349a9522c3692e4f36d85cc5135595ad487986a617cb59a6a20dcca4ab804` | Use persisted Food policy; diversify after ranking; persist final impressions before response. |
| `backend/src/services/contentRecommendationService.js` | `74bb755080e62b94d128888968d68df2d726f33e46f5b2e55320e4843f73a8f8` | Canonical Media policy/impressions, immediate feedback and trace; verified wording fix describes context without inventing candidate energy fit. |
| `backend/src/services/crossDomainMappingService.js` | `34cc4d58db43d38d872d4b98515ef4ca265ea2b5d92a02f63faa9ba1314a8089` | Explicit source event/time/target/reason provenance; session context remains distinct from taste. |
| `backend/src/services/feedbackLearningService.js` | `140df8b44397269926511c4bf3a8e27e67c3c58e1990b3c503b3bd432d98d3a3` | Original-impression policy updates; remove delayed proxies/arbitrary adaptive weights; retain valid legacy affinity. |
| `backend/src/services/feedbackStorageService.js` | `bd3d9f65e7bc2f54b9a6a2e3c36a473e99a7969f880767ad17e184bdb198660c` | Preserve impression ID, ingredient and tag evidence through Food feedback normalization. |
| `backend/src/services/recommendationScoringService.js` | `04f6ea8384620ee0b9739f078012cd12e39f239bbd4896716a84f3eae44af93e` | Fixed base scoring, session/context trace and existing post-policy diversity; no second exploration path. |
| `backend/test/api.test.js` | `bb2a715de33c584d2a86a24b08c1347021762733d5ef01df95b1b6706abacb74` | Adaptive integrity, persistence, endpoint and explanation regression assertions; 51 total backend tests. |
| `frontend/src/components/ContentRecommendationCard.jsx` | `7d372043f5a9070c40134b57876140d3069cbd5e238deee7d2af2b84779d49d2` | Display actual policy score components and propagate explicit feedback. |
| `frontend/src/components/FoodScanPanel.jsx` | `6f5bdd70f2ef8c7d2f45685b601f966fe043b10266733002c3391bcdd0fdf00f` | Forward original impression ID on feedback. |
| `frontend/src/components/SearchResultCard.jsx` | `d016b6de12ef7d932496dad2f95da40d37b4351e5bcb8feb2e8c7db592758aa3` | Render canonical score trace instead of invented explanation scores. |
| `frontend/src/pages/DashboardPage.jsx` | `b458b1839c26a3a7d518a0c3385b038d2dd557da1bed5ef8dba0b09c17a34e6e` | Forward impression IDs, show persisted adaptive effects, refresh after explicit feedback. |
| `frontend/src/pages/ExerciseTrackerPage.jsx` | `2b293afc3e8217774f33f6318cf5017b21228a2d93bd6fb4458d77928b19ddcf` | Carry Media impression IDs from the existing workout flow. |
| `frontend/src/pages/ResultsPage.jsx` | `5c5cbe4584475aa6957c46c8d35d28ed1a97b82b7c8a0e882baeceac17de965a` | Carry Food/Media impression IDs and refresh existing lists after feedback. |
| `frontend/src/utils/recommendationDisplay.js` | `d4b7df4a63c2aed9365b82458f0fbd2b686978f367171c31f1f7ebf5141293d6` | One score-summary formatter based on actual trace values. |
| `frontend/test/recommendationDisplay.test.js` | `5d0af2e120e49e3058954e3a9831e38de2dad6ca5bd074c8ba5f6ab6589dd06c` | Assert trace-backed signed explanation values without fabricated scores. |

## Documentation (6)

| State | Path | Bytes | SHA-256 |
|---|---|---:|---|
| `M` | `README.md` | 26153 | `63217f83d9f0795c759a8a403bf681bf46c732e2c4b7103033ea15b036a40c89` |
| `??` | `docs/COMMIT_MANIFEST.md` | 0 | `self-referential digest and size omitted` |
| `??` | `docs/PROJECT_SUMMARY.md` | 3920 | `ec77b0d368ed83508bebf447dcc9907257d7b79769af963a2bca9a6e5baa4f94` |
| `??` | `research/FINAL_STUDY.md` | 120990 | `c787bb2a9d73d957869016666e758b47775f1f041ae56b3fc0562ba446bb34b6` |
| `??` | `research/RESEARCH_CODE_AUDIT.md` | 58700 | `96eb1e34686b8eabad6246419c9014b3803e5686b71f9300ec896df9b24f6d3c` |
| `??` | `research/SELECTIVE_TRANSFER_DESIGN.md` | 22305 | `ad50e1b3002d35fc47f7e827e855b971c3f429dbf4967ae91268b4b55ad37d7d` |

## Application Source / Tests / Configuration (61)

| State | Path | Bytes | SHA-256 |
|---|---|---:|---|
| `M` | `backend/src/controllers/contentController.js` | 5963 | `a756f069721c6190ddf94d0f5c520136144ea7974aef1fde701fe81729491c2b` |
| `M` | `backend/src/controllers/foodController.js` | 11921 | `fd5ad5a446701ffe464ea3ad1e373fb023699f45b96514be3dea52db109c7c70` |
| `M` | `backend/src/data/contentCatalog.js` | 17446 | `dffdbd61f27f5cf834bedd33312be385fec5ebcd4a1608384ed83d5306309f09` |
| `M` | `backend/src/middleware/validationMiddleware.js` | 39204 | `264348e57d2a8ecab14b65451ad6d2dcbc6137b2bbfeac1d43a4fa93a75614f0` |
| `M` | `backend/src/models/dataStore.js` | 4217 | `5b0808812c00796cbfb07d058ac5ec54dacc495794f71439d38b7357da2c02ec` |
| `M` | `backend/src/models/mongo/exerciseSessionDocument.js` | 1616 | `40eb80a1bee783974f41f535cbfcc9b34d0006fba2331016eb584cd26a464221` |
| `M` | `backend/src/models/mongo/recommendationInteractionDocument.js` | 2363 | `073fbb562d5aa2ad65e091f806b8dacf64cef62da025e5127c2c4f12999656d5` |
| `M` | `backend/src/models/mongo/userDocument.js` | 4534 | `93392c22b3f23d8610ad2934a157bf4840555f4a0a6b86a5ed7f1354f93af985` |
| `M` | `backend/src/models/recommendationInteractionModel.js` | 4757 | `cd4af5299a902e482f2e262dffbe3a59668188b0476529fc88802d3604f65560` |
| `M` | `backend/src/models/userContentInteractionModel.js` | 2561 | `1154395e00b9c96ac1251cc5ea9bd838f060d6c4484b6fee4ff8c7ce1cb45855` |
| `M` | `backend/src/models/userModel.js` | 3650 | `156d95d5cf9731b3784136bbc42660d6949054248696cc51454b453d2d8af4b9` |
| `M` | `backend/src/services/banditDecisionService.js` | 11849 | `fbc09f979ee7bfd28179f6d83193da13bfc04589926a96b9c60d29c185f93113` |
| `M` | `backend/src/services/candidateGenerationService.js` | 10922 | `b004871a2fc7cd4178cc03c101456f04a587c09e6ebaac8034460fa7e61e3f2f` |
| `M` | `backend/src/services/contentRecommendationService.js` | 56103 | `c4fcf212707ba2ff448833bc37c2cff1b514253e7535365f678944aed59dcbcb` |
| `M` | `backend/src/services/crossDomainMappingService.js` | 9998 | `6f136399a03944bc0734af15b82687f62486306af6e9bdc0c8f355a7c1792683` |
| `M` | `backend/src/services/dashboardService.js` | 20960 | `011b344e5f687253bad8739751491ff737cfbb7f3776039d8558246f2d3a359a` |
| `M` | `backend/src/services/dataProviders/foodDataProvider.js` | 16184 | `fc244d59beb0e7c178db770c0d26e9d025dfbf054e96166e40316c6c3d90b31e` |
| `M` | `backend/src/services/dataProviders/movieDataProvider.js` | 13779 | `b45d24d364dbf41d311a45780261756721b63abf1d4c6231919daa3be1834bdc` |
| `M` | `backend/src/services/dataProviders/songDataProvider.js` | 11907 | `d3273469cca7f0594db4be885fac6fa752a082c65b09855530f8aa6fd26870e8` |
| `M` | `backend/src/services/evaluationService.js` | 25296 | `2ad2945ab539f2bd0bdadab4e451f4822f711f16fc5cd6edf2c3bf9451c7a083` |
| `M` | `backend/src/services/exerciseService.js` | 17862 | `49445c865f85dc9cd94ba55981388e5b0bc63ec45a698c19f4c00c01b1aad0ca` |
| `M` | `backend/src/services/explanationService.js` | 4839 | `b686b53c55c9c093a35893af2f4b866d34fe316e31977ff0563ece2f31416ccd` |
| `M` | `backend/src/services/feedbackLearningService.js` | 11162 | `d7ab0b543bf8973ad3c0346f111ea102e56aa1520ec03f5eab36ace276743f6d` |
| `M` | `backend/src/services/feedbackStorageService.js` | 1646 | `ba58c95c4e370b140c3e86a7297da05c148d565cb3aba014cc778a08cc3f12b1` |
| `M` | `backend/src/services/foodLookupService.js` | 14922 | `888f8170976f23464a7110ebf5ab616df7796c1ccf1e589a869674f2e526ba8a` |
| `M` | `backend/src/services/mlService.js` | 21730 | `8b034ad1cc380dba68c034093d4a13181a171b1b15f984d49802140c706c828f` |
| `M` | `backend/src/services/nutritionPlannerService.js` | 20079 | `328b5a5e619892f1623d3e6b24147374eb10d56a6e67577b17b1314532512baa` |
| `M` | `backend/src/services/recommendationScoringService.js` | 14096 | `2294eb580dd951f99da5f998120856e05a10814d1609fed9924229f9402f87cd` |
| `M` | `backend/src/services/recommendationService.js` | 17875 | `5b573249c0884b90c991f469e01e78c0d1badfb21b0ec68ce4055bd4e3eaf8f8` |
| `M` | `backend/src/services/searchService.js` | 11778 | `25f3f9f0b6b7fd04df8548c00d6984d83421eda31cafdfb93856f99963a851e8` |
| `M` | `backend/src/utils/feedbackSignals.js` | 1677 | `32ce534301c07e11fb3c333d251ea6664703f2ee27ee2dce32a49f19a266333f` |
| `M` | `backend/test/api.test.js` | 49672 | `778b46d5264e5e5d236cbd8bd33c88bc285a9d073511f84f8527d9f67c6aeaec` |
| `M` | `frontend/index.html` | 359 | `b31447ff191d3d5835e60f54f4cffa4819bc061e9456ace2532a5c0315408269` |
| `M` | `frontend/package.json` | 759 | `7e622a0dd000154f94527413e574b63b11f93b9faa2ee8784b6f54356110cc30` |
| `M` | `frontend/src/App.jsx` | 3139 | `fc96d2e725d82d35a21ef9227f8b3d0967643ffb63580f159455a3490ea23cc4` |
| `M` | `frontend/src/components/ContentRecommendationCard.jsx` | 3037 | `78f5876aa4d3c83662007b002c12413a2f4957a373748d555d645204535d0bfd` |
| `??` | `frontend/src/components/DashboardFocus.jsx` | 4939 | `a2e58df23f9837e4bd3c818d56ba924029fc0661b7ab6c6243649ef1bbb000e5` |
| `??` | `frontend/src/components/FeedbackActions.jsx` | 1474 | `f3f48243dc3de3e33ddbbb99d60e288c446b794bf87baebd8f8375af4dc7c7b7` |
| `M` | `frontend/src/components/FoodScanPanel.jsx` | 17681 | `58fc38bbcafb6e61d891f133ae6aa78c9d2d40c82f9bb7c4836c7c56dd8dc995` |
| `M` | `frontend/src/components/Layout.jsx` | 2648 | `94ac467e3733ec21255db4e260dc783ab295ba8594f70524e45b346e1e7eb5c8` |
| `M` | `frontend/src/components/SearchResultCard.jsx` | 6993 | `8ee976257dd76570bc5a63e62d9a87b7a26ab63f2236b8254f0b06f6cc3e7e9d` |
| `M` | `frontend/src/context/AuthContext.jsx` | 1847 | `0ed91800af52dc949f768f04d1b8888a13f30cc54352e2e1b0fe92e990edfdaa` |
| `M` | `frontend/src/index.css` | 24285 | `86302b1d94255e7d65daa8eeee933fa20d106c1fafb2ef241e38c86de7aa265c` |
| `M` | `frontend/src/pages/CommunityRecipesPage.jsx` | 16421 | `a2fd8dfba8886486c7c0af54e16b05f843da7ac73cfd8cefe338f190cfe6ca7a` |
| `M` | `frontend/src/pages/DashboardPage.jsx` | 81638 | `2072a1a16028eb87a84f3122bba4aa980b574ac0993dc53c29837430da0c0025` |
| `M` | `frontend/src/pages/ExerciseTrackerPage.jsx` | 30101 | `c496b6a803620ecb9ac504544a97edd4d22f2b7b07cdb435c0d030027e6ea1b6` |
| `M` | `frontend/src/pages/HistoryPage.jsx` | 9096 | `aecece707841b2a9e5730ee6e5c9cc96385a55e78743f99b4885698c55d35161` |
| `M` | `frontend/src/pages/LoginPage.jsx` | 5704 | `03992d37ef35e9ea27bc8c963c8bc4b2e4c44987279651ae29bf6dc57447e95c` |
| `M` | `frontend/src/pages/ProfilePage.jsx` | 16639 | `f78bbdfa8986032588abf44b3df92f57602df49a1d0f63478fa707e42d95a16b` |
| `M` | `frontend/src/pages/RegisterPage.jsx` | 3965 | `213bff0d501c456e4dee16e1ee787a704d5ad1e9a309432d70daddfade920405` |
| `M` | `frontend/src/pages/ResultsPage.jsx` | 12343 | `df938f4524d4e9bb816d35c58a96ff96c5efab38a2b9df04f8f3b4fae05cd9a0` |
| `M` | `frontend/src/pages/RouteSummaryPage.jsx` | 6899 | `2fe1a74c24500a9a639d635485810562c381cb48bf110c4a438fa8160c81698b` |
| `M` | `frontend/src/pages/SearchPage.jsx` | 13132 | `459273f336b40deb47c7c113a25c0b8187b9cda82eb4ce99eced3b23fc1087c7` |
| `M` | `frontend/src/services/api/client.js` | 2181 | `765c51d56b860fe6609ba6f24bc83b0d1b78167693b2b437aa477614cad58a93` |
| `M` | `frontend/src/services/api/contentApi.js` | 728 | `29cfd4e8251f86fe8ff01af893f44e54027bbd241c85e079a8ff8874bb1af2d5` |
| `M` | `frontend/src/services/api/exerciseApi.js` | 1513 | `4bb5776a753c7a29f7395aa79f4afc449e87d0a5996eee385e619ab48a11f4f1` |
| `??` | `frontend/src/services/api/session.js` | 729 | `f8ff7c47695dde0f7a35d11bdcba8cf2d70c499484955af7cbeb9b98ed426d3d` |
| `M` | `frontend/src/utils/recommendationDisplay.js` | 5971 | `1cf679d02f42a5a57d4f58822592a5ed515c63d151e668f1ee9664fded79438a` |
| `??` | `frontend/test/recommendationDisplay.test.js` | 1383 | `1a2885b0ceb40fd38131ab06699c75a5d3d2af78da41995447dc2b4c40a25d5b` |
| `??` | `frontend/test/sessionExpiry.test.js` | 3418 | `c5bb910a429ae15f51d8def97f48828e3af0cb9cb4c67e9f67cd008fa433fd2e` |
| `??` | `frontend/test/sessionIntent.test.js` | 644 | `7098c05467133b2acb7e0d163c3a48c0e33884e5315893a8a50332ef62cebff2` |

## Research Source / Historical Reproduction Code (10)

| State | Path | Bytes | SHA-256 |
|---|---|---:|---|
| `??` | `research/architecture_control.py` | 16437 | `33be81d53618b1c2e9e5d7db24ecc0aad1c01c86537e368824721916eced9120` |
| `??` | `research/architecture_replication.py` | 13174 | `9aeb44f7890881ebd1fa508f998f434bd12e80529f2bdef12bf30280c436bf0f` |
| `??` | `research/coverage_completion.py` | 6120 | `7e5abfbf297aebdfc3a2d1b0c30ef8a3da24cc1e0013171dc0d3b8dda35f5906` |
| `??` | `research/coverage_robustness.py` | 25868 | `78d236009af5f34e04dd659325f5405794589506d00a61d8dc36579a9d7e8889` |
| `??` | `research/coverage_tail_verification.py` | 7119 | `247c491e8f039b35ca2d047a548a7aba084ec32c39a4454f1493baad66b27e82` |
| `??` | `research/final_study.py` | 16938 | `b0cfc22768675263031bddd6a365175b1e9c3d8bb69358994e0a31a82802866d` |
| `??` | `research/final_study_report.py` | 4416 | `466f86e5eaa44956754f0f4bc1790ffa988551030b9deefb6d29254592c5876d` |
| `??` | `research/multidomain_context.py` | 3541 | `a696992688734c32eda5aeaf0315a2d132ed4724d3fd6d294e1ec583179beba4` |
| `M` | `research/multidomain_model.py` | 7439 | `d937cad823744986aa725deaae909820dba6c1cab7b84d9fe5f18218824f437c` |
| `??` | `research/training.py` | 10310 | `478ba145b19f4d184f3eb9c9d88f9921cf2f3b0b86e8c85bee3f40c3b0342c02` |

## Research Integrity Tests (5)

| State | Path | Bytes | SHA-256 |
|---|---|---:|---|
| `??` | `research/test_architecture_control.py` | 4290 | `ab5afc8949ceb9c86119360aa13caf5be7c45de372a6c4e6a6a32e4bf8b38b1a` |
| `??` | `research/test_architecture_replication.py` | 2552 | `c8af3d8cef7e508fdb161a33affb72fb41ab7f2dc387a0b7ffd5aad7b68845d5` |
| `??` | `research/test_coverage_robustness.py` | 5756 | `d6535cc5f18972b0a6dd0b2bdd477480ebf15c47b1d05f42911bea41c42e630b` |
| `??` | `research/test_final_study.py` | 6803 | `e9b8dcd9b20ddfad8647877761889cd51017d4245b6475e4f5cd45fd67c968b9` |
| `??` | `research/test_research_foundation.py` | 15986 | `f927e368b5b618932c5a9e4575e3bba6106ccb2c1e8ecb6ec6e9cc0f67385b5f` |

## Scientific Artifacts / Derived Tables / Figures (92)

| State | Path | Bytes | SHA-256 |
|---|---|---:|---|
| `??` | `research/results/final_study/architecture_control_checkpoint_freeze_seeds43_44.csv` | 3329 | `0bb20582725e9cc07c8e148eeae02afec2d8da5a6838bb0050ec19f780ad2976` |
| `??` | `research/results/final_study/architecture_control_protocol_seed42.json` | 11658 | `4b775e9acc915b146090fbde13ddd2761f2db61d753ebc9bc38e818ee027a1e6` |
| `??` | `research/results/final_study/architecture_control_replication_protocol_seeds43_44.json` | 46214 | `151a49f2ea512ceb734140da0e12bd330932c2166c3621d2febcff46bfe584da` |
| `??` | `research/results/final_study/architecture_control_seed42.csv` | 3540 | `f2d1b1a4837e5f089ea50770136e6dde2e9285c216092bb2dcbef6747d9894c2` |
| `??` | `research/results/final_study/architecture_control_seed42.json` | 552040 | `686413f45f9414c2d46c17ffa736bb3efc3d1850f1a1acb202cac06d66887d32` |
| `??` | `research/results/final_study/architecture_control_seed42_deltas.csv` | 2775 | `9dd1646d44d50088d333b4fe8099312be14ef15f17f989d7cc084445a3c81223` |
| `??` | `research/results/final_study/architecture_control_seed43.json` | 552437 | `f20bf8d050a07f5e32610ae71cae53aa69fdae7ee3e796cb2fade3113244a5c2` |
| `??` | `research/results/final_study/architecture_control_seed44.json` | 552725 | `cfe129418dc151d34b3927c8e99a3bf23170d93fc152db704396a88ec99e0821` |
| `??` | `research/results/final_study/architecture_control_three_seed_deltas.csv` | 4669 | `c975450c59bf43fc5c6f4b3764154ac46cb0952ab4b80b0b8966e5cfabb91a74` |
| `??` | `research/results/final_study/architecture_control_three_seed_ndcg.svg` | 11219 | `e747145204c728dcf9d8e8abcfbb10841015ce9d94546873631eb8074463b3b6` |
| `??` | `research/results/final_study/architecture_control_three_seed_summary.csv` | 4526 | `966f1a63f3d9863a4a12aa6de6de26b4d9a52e0053088cee06c2cb647380e4b6` |
| `??` | `research/results/final_study/architecture_control_three_seed_summary.json` | 29449 | `a8e9f9fda47a5a82c1f44acc81e08eb7de2ccbc02fc0b090a763dfa85dcdbf91` |
| `??` | `research/results/final_study/cohort_scaling.csv` | 2900 | `88856c7a1c7736048c681f3cd010ab0dbfe4c75722a0929ea110f3e24c12c4f6` |
| `??` | `research/results/final_study/cold_item_analysis.csv` | 2615429 | `8bf18ab6b6a0f4845d64b0c429b9d934ebbb2ed8a21404a481c4f17a1fc11dd0` |
| `??` | `research/results/final_study/cold_item_summary.csv` | 1081 | `afe3ee2ccaed9a13fa9f99053c97ab2e6b39fa6c2921fafd7cdb4afefdcecc1b` |
| `??` | `research/results/final_study/context_delta.svg` | 2197 | `5aeabf150428a9be1531015f84e7b33c3aa6896f8c91615ee51ef8a90cc00a93` |
| `??` | `research/results/final_study/context_deltas.csv` | 913 | `228ebb7ce04bfaed4f10b58f1d2e34b0b668d741acb96c9ada8d1061c944b751` |
| `??` | `research/results/final_study/coverage.csv` | 456 | `e21397bddbfa5a1540964f8945644a5d34f64b9e9a65943a98ec32405b1fb02f` |
| `??` | `research/results/final_study/coverage_completion.json` | 2107 | `131ae6248fce39dc4ca69718714f975143ced51cdae89b144c25012eddc516a8` |
| `??` | `research/results/final_study/coverage_completion_validation.json` | 481 | `1f1724796081165c01e9434258ccbd7c8b70e78c1a60eff8d85bac43e80ad6bd` |
| `??` | `research/results/final_study/coverage_compute_7016.csv` | 1590 | `14f2d3b413aa7c4c56f6ae77d9b751fab77420074a5f58f98cc3053d700464f9` |
| `??` | `research/results/final_study/coverage_compute_estimates.csv` | 882 | `60d59c8bd189f6e381e9b7560eee706f0e267e77a2b594772fb63f58ea7fd3ca` |
| `??` | `research/results/final_study/coverage_eligibility_diagnostic.csv` | 140 | `09f567f9d335f540021b162a24427c8063f14c24dbe624404e752eb1ff2c8143` |
| `??` | `research/results/final_study/coverage_exposure_7016.csv` | 1530 | `1758791729a11a07dddfcf7e8112becce0fe43cccf88c73d117ad0f3602c1595` |
| `??` | `research/results/final_study/coverage_robustness_audit.json` | 946 | `5e99a3e0a6290dbef101b1291e9bcf7f6416bfbc71122e517b6cd75e6d091bc0` |
| `??` | `research/results/final_study/coverage_robustness_protocol.json` | 42096 | `e2c44712f34dd2c31724d601bd9d4401e0cd68c78988ea497a108a1e6b4e2479` |
| `??` | `research/results/final_study/coverage_summary.csv` | 787 | `e84b11a3c73047b8f2fe9a4c4aafa57fc215c9f057eadc145a261062fb12cd12` |
| `??` | `research/results/final_study/coverage_vs_cohort_size.svg` | 4730 | `6208b248b033d0eca97eb7db1ff4a1f2cf9ec28527e27b6dedbb703b8f2cb1f8` |
| `??` | `research/results/final_study/cross_domain_opportunity_deltas.csv` | 709 | `f9667da6111478eb33829a994120ea741d091db535900f1e0c9394cf98082ec5` |
| `??` | `research/results/final_study/cross_domain_opportunity_metrics.csv` | 12012 | `6c0a8d3d29cf8ddf712bc46652d68e698bb2b95b912fc0ff547dc72c85b8e7dc` |
| `??` | `research/results/final_study/domain_sparsity.csv` | 651 | `0548e460e4bdca609de9b7bf51f26bf9fdec74e88d62040e48be71160e050f16` |
| `??` | `research/results/final_study/evaluation_users_vs_cohort_size.svg` | 4413 | `89824cd2741d5c3ecb83ad9f55a682d7b03aadac68c7ea2779d09890bbc88672` |
| `??` | `research/results/final_study/expanded7016/A_seed42.json` | 353360 | `6eea53722e4dca56df0773927c877777d82d8cac179dee6d72981ea7752cd4a8` |
| `??` | `research/results/final_study/expanded7016/A_training_seed42.json` | 11799 | `d362019408a7b6e8863ffb827523dc39fe52dc354350d049d14d00130128de80` |
| `??` | `research/results/final_study/expanded7016/B_seed42.json` | 353697 | `af58a9373618dbdd04ebb0d37f9c53f569375fccdc39fbd2357323d0928a9a0d` |
| `??` | `research/results/final_study/expanded7016/B_training_seed42.json` | 12084 | `5220c205bb51b745afae2d1974634cebc9c47284aea2349f4726e32dd7cbc531` |
| `??` | `research/results/final_study/expanded7016/C_seed42.json` | 353925 | `acc990a28267ff8e5c50d20c3c16a93248167b4990c57613400c70e03c1855e7` |
| `??` | `research/results/final_study/expanded7016/C_training_seed42.json` | 12088 | `d7d3e8ab3bf33e77556405afb777ff3abe077e9f13d5e1ab6cfd0de96c5ded97` |
| `??` | `research/results/final_study/expanded7016/checkpoint_freeze.json` | 4027 | `cd17d68aff6d28b8d8d859360be8a32ea1963f5c91c6e54fe24458d68d8e5437` |
| `??` | `research/results/final_study/expanded7016/cohort_manifest.json` | 254951 | `1c853fe957214d1451e18bbb1dfb0de151dfe8827afaa96a9605cbf294ed54d8` |
| `??` | `research/results/final_study/expanded7016/media_artifact_diagnostic.json` | 2661 | `2430bf0f220efe067be16cb1e99635b92a8d84362eb41506bddf3869fc978bbc` |
| `??` | `research/results/final_study/expanded7016/media_candidate_sample.csv` | 2579 | `2768734edae252f8a1ca55aedd43c80599f5f621857632146640c88129fa269b` |
| `??` | `research/results/final_study/expanded7016/media_rank_diagnostic_protocol.json` | 3901 | `96f24aa55284daabd3d63d86b03856f7cb22b0069554ed40ee3f6e3c64dfbbd8` |
| `??` | `research/results/final_study/expanded7016/media_rank_diagnostic_sample.csv` | 11629 | `fd0ed476475b188a83f7fc1a8fe539bca671d2468307339a9d02f230955385e7` |
| `??` | `research/results/final_study/expanded7016/media_rank_diagnostic_summary.json` | 2198 | `ffd26abdcd3cb0e5bc7b97433776b53292440d79f478addd6e2d10f7cdb2dbc7` |
| `??` | `research/results/final_study/expanded7016/media_rank_diagnostic_targets.csv` | 785436 | `5b6fb04be8db90049942660b9137f34a2b7d5b62eb824becf5369aa55740cdb8` |
| `??` | `research/results/final_study/expanded7016/most_popular.json` | 346342 | `2ffb884f8cd70ed62d32331bd8e6ef84227148ec555b896610ea8190a684e88e` |
| `??` | `research/results/final_study/expanded7016/pairwise.csv` | 2822 | `0a5aad8b4637fe0f4d33025fb7dad0d71544569c55cc7c93cd24334b8cf83457` |
| `??` | `research/results/final_study/expanded7016/pairwise.json` | 7828 | `2662f5fd7a96a5b6959e6b797e920133ed2538b918bba9e7e8b804429258973b` |
| `??` | `research/results/final_study/expanded7016/protocol.json` | 5287 | `783fbddea1917e71100ed760352d3a01455f11623828601361c9ba125feafb6d` |
| `??` | `research/results/final_study/expanded7016/runtime_evidence.json` | 6365 | `20e0add2a7ac7c197b1cbb69031217df52e46ff08a7fc12d3a730a1ccf659692` |
| `??` | `research/results/final_study/expanded7016/summary.csv` | 1048 | `c322baa95a2fce794b9704731f804db0132e92e522f0d0af27136a7b56a796b5` |
| `??` | `research/results/final_study/figures/cold_start_coverage.svg` | 2324 | `12bd72fe806d0333652a475b07f089ccb0e45b3895d5251fb97a0b69b3030c15` |
| `??` | `research/results/final_study/figures/contextfit_protocol.svg` | 3763 | `b8ddd02e0fff52e25beb7a3c5dcb72dccf38a74b4994ca637578623c7be7bcc4` |
| `??` | `research/results/final_study/figures/expanded_seed42_ndcg.svg` | 6478 | `3c7d9c1d601dc9d7cf5efb9990b6d440b16e13a3ce2313c8d25be22ece7da7ab` |
| `??` | `research/results/final_study/figures/transferability_diagnostics.svg` | 5028 | `2986b7ab9534cbdeee5ad0007ef43552065c6f6b7bcb77793432ead582943b0e` |
| `??` | `research/results/final_study/figures/warm_coverage_scaling.svg` | 4812 | `83142baad1c6a29a089bec0b880f29a8de1a8e725674c9e3ae39d620ee705dbe` |
| `??` | `research/results/final_study/final_results_seed42.csv` | 4044 | `68a7873a9a8cf685c53a0b2bc42b564b7cc8f210e6750ac85170ac5bbf72577f` |
| `??` | `research/results/final_study/global_vs_cohort_coldness.csv` | 3450 | `35505aa8105d1d4dbcf5bb18a8493d9c9849c9bc7c930039b164e7de21fed687` |
| `??` | `research/results/final_study/gradient_conflict_seed42.csv` | 213467 | `d8f1843d24b5d647868825e828e74f721d8e68bc9ab530598b7a623e4d0e5762` |
| `??` | `research/results/final_study/gradient_conflict_seed42.json` | 96879 | `847b76663489ac1064f056aff6a96768b89f6d47c00f66dddfce121c6ffde5ad` |
| `??` | `research/results/final_study/item_support_distribution.csv` | 21813 | `5df5ba104e3d4d3e5ea3e63d9c1c75c7da4c9a18e5c85439e9dd5d61fbc76d41` |
| `??` | `research/results/final_study/metrics.csv` | 1420 | `1d8cbfcc047679e2f2ff5616188a0a1ce802b9e4121fe6bf9fec64c2c70fdadd` |
| `??` | `research/results/final_study/pilot_seed42.json` | 527620 | `c96b1a6d6c44d8fd28c43e2f8585fda506fcfe4d69a17452426330440cc964bf` |
| `??` | `research/results/final_study/protocol.json` | 11985 | `6442c90b8ad4541f393fcdb92d12b9639da58971d9d5ef78f2e7be509b443152` |
| `??` | `research/results/final_study/secondary_benchmark_screening_plan.json` | 84239 | `af213e2d7f5f157d4a9802756ea73641d0080446a3e1e6a7f326b0741e6fbf63` |
| `??` | `research/results/final_study/selective_transfer/D_FIXED_minus_A_seed42.csv` | 999 | `7b9e76f42c82e80b69406464c2c3c636b7df7926fe4a3c74373a2fc8b1a27a64` |
| `??` | `research/results/final_study/selective_transfer/D_FIXED_minus_A_seed42.json` | 3014 | `0a7cc323efe29db07266e2af26ae07283075505574ab40bbc2eb0c1a1a93d689` |
| `??` | `research/results/final_study/selective_transfer/D_FIXED_test_seed42.json` | 411096 | `a51aa87f929690ffdc7e0c8c8aa5cd466b50a2cb839686fdb7a079eb8d8a24ab` |
| `??` | `research/results/final_study/selective_transfer/D_FIXED_training_seed42.json` | 18730 | `14a734ac1e6d36b318faf1eabf0bf037a4edd8964534784fdd997dbe796d982d` |
| `??` | `research/results/final_study/selective_transfer/D_test_seed42.json` | 411199 | `d3a0757ba164c05a7a3896cffd7064f4dbaf6e108462e66351ae242d1e377aaa` |
| `??` | `research/results/final_study/selective_transfer/D_training_seed42.json` | 18798 | `c2c1a7fc5fb926a58aedbb73f1f112e9e36e6fc1a23a7d6ea3f0e15c59c160c6` |
| `??` | `research/results/final_study/selective_transfer/checkpoint_freeze_seed42.json` | 2980 | `3e351bd8261e7e1135674f856ee15baca2f7b2716f9d64ec82c03e7e0dd56e1f` |
| `??` | `research/results/final_study/selective_transfer/execution_seed42.json` | 73141 | `4805e5002436fa174392239a4611e9ce4ae304757e098a153c9fe700f2212076` |
| `??` | `research/results/final_study/selective_transfer/feasibility_conclusion_seed42.json` | 2679 | `ed2852f3f05d03a985b7da7dddb2ac955b8c1e145d4112dc5b4e568efaf4d5e0` |
| `??` | `research/results/final_study/selective_transfer/gate_diagnostics_seed42.json` | 6754 | `542e44a08af243da88a1448cd30a8751a299c11b9889e97158ed9b55d16f378e` |
| `??` | `research/results/final_study/selective_transfer/pairwise_seed42.csv` | 4546 | `4d4c3497acdf9d9ac74c7484a4495dd3bd875de4f2a95976e697d48c0ea50146` |
| `??` | `research/results/final_study/selective_transfer/pairwise_seed42.json` | 12602 | `29cf8b3f013b9f7ea1d388f2210b76b97b9e423b34e40d69533b24694a3d7786` |
| `??` | `research/results/final_study/selective_transfer/protocol_seed42.json` | 5904 | `484e35d35ab10958fef512cd2d955f7d778543de7912560edd246153d7fc7ce5` |
| `??` | `research/results/final_study/selective_transfer/summary_seed42.csv` | 1559 | `f4554a6c606828f8448b625bb61b79302665b49381bbfc705bd1ed81045f5ede` |
| `??` | `research/results/final_study/selective_transfer/technical_preflight_seed42.json` | 25837 | `424015bc1af646462b4ec6eae7374ee470a6dd19cade0903810cbdc0c2f58051` |
| `??` | `research/results/final_study/selective_transfer/test_inference_started_seed42.json` | 363 | `9a118762a3b0916a67ebc2d394975cf2164838ddcf6d82c959119f3581d988a9` |
| `??` | `research/results/final_study/support_band_metrics.csv` | 13525 | `9ccdfe0fab9d57e2f6dc9ae7b4b1d737e832b444167a3cbf562ffc2fa4fe26a3` |
| `??` | `research/results/final_study/tail_metric_hand_checks.csv` | 20106 | `b9a580e81e4c5e04037f2bfea44af0ab1f9fa5a2d951177d38c7e276ca9bfc64` |
| `??` | `research/results/final_study/tail_verification_cases.csv` | 16844 | `e42c284b7fa3c3fca2ce0c4334ecc4150df490f8a321c57a61414c70161299bf` |
| `??` | `research/results/final_study/tail_verification_protocol.json` | 1773 | `3db5707fb71bc5b4b164e516f8e4513e8c2e8fe470cde3e264a43785827b045e` |
| `??` | `research/results/final_study/tail_verification_result.json` | 675 | `76bb6abc79262abd0e16b50d766208890052873cb0884db6957205ed7ab61be0` |
| `??` | `research/results/final_study/tail_verification_summary.csv` | 1627 | `f363fba0137121969df32032e9d847fa35bc7afd3d5673e0629c32fc9372aec4` |
| `??` | `research/results/final_study/train_item_support.csv` | 2367844 | `a22494e65fc749bbc22c884e8fc42605a361b3b664daeafefe4dfb8a6fc21cf5` |
| `??` | `research/results/final_study/transferability_seed42.json` | 164189 | `1aa1e6bce5bf37cd5de6b3a6478563fc1484b2e7a59adce1211ac3091aeb6cb3` |
| `??` | `research/results/final_study/transferability_summary.csv` | 1109 | `eebc8b82fa33d3683c00c65bdd05eff3f76d617645f04ecc83fd4ac032c487c4` |
| `??` | `research/results/final_study/user_history_metrics.csv` | 17342 | `1b391a6f535ce6ae6ec0472fd71dc023af72adfd3f8ffbe689541ff2577028b4` |

## Excluded / IGNORE

- Raw Amazon archives and processed datasets in `data/raw/` and `data/processed/`.
- Frozen checkpoints and run directories in `research/runs/`.
- Environments, node_modules, build output, runtime datastores/snapshots, caches, bytecode, SQLite scratch databases, secrets and logs.
- Browser helpers, evidence, latency helpers and diagnostic scripts in the system temporary directory, outside the repository. In particular, `walkthrough.cjs` and `manifest-audit.cjs` are not commit candidates.
- The already tracked empty `backend/runtime-data/.gitkeep` is only a directory placeholder, not a datastore; it is unchanged and not a milestone candidate.
- No deletions are proposed. No historical scientific artifact is removed merely because it is old.

## Security / Provenance Review

- Candidate scan found no private-user absolute paths, private keys, AWS/GitHub/JWT-shaped credentials, raw archives, checkpoints, or database dumps. Test password literals are deliberately synthetic test fixtures, not deployment credentials.
- No candidate exceeds 10 MiB. Largest files are intentional scientific tables, not raw datasets.
- Historical frozen research audit prose and the secondary-screening artifact mention former system-temporary analysis locations. These are provenance descriptions, not required runtime paths or included scripts. They remain unchanged to preserve the protected scientific hashes.
- Reviewed inherited application changes include the prior session-intent/UI work; historical research code/results remain part of this milestone but were not rewritten during final verification.
- Final verification made only the Media explanation wording correction and assertions in the existing API test, plus this manifest update. Policy parameters, schema, reward mapping and frozen research are unchanged.
- Before any later staging, recheck current status and this inventory; stage only individually approved paths. Do not use `git add -A`. No commit or push is authorized by this document.
