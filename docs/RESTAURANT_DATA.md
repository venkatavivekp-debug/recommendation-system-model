# Restaurant Data And Feedback

## Data Paths

Restaurant search, dashboard restaurant suggestions, food resolution and the restaurant part of `/api/food/recommendations` now share `restaurantProviderService`. The existing Google Places client is used when a key is configured. Otherwise, OpenStreetMap restaurant and fast-food POIs are requested through Overpass. These are place records, not restaurant menus or user interaction data.

Discovery returns at most 50 normalized candidates for scoring. Search returns at most 10. IDs include the provider and its place identifier, including OSM node/way/relation type. Duplicate IDs and matching name/location records are removed. Nearby POIs are ordered by available name/cuisine matches and distance before the 50-candidate cap; a query like chicken is not proof that every restaurant serves chicken.

The OSM request has a five-second server budget and a 6.5-second client timeout. Searches share in-flight requests and a bounded, 30-minute memory cache. Dish text is not interpolated into Overpass queries. OSM discovery is capped at ten miles even if the UI radius is larger, to limit public-server load. Failed requests trigger a one-minute cooldown. This is for local demos, not a high-traffic public deployment. See the [Overpass operator's usage guidance](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html).

Configuration in `backend/.env`:

```text
RESTAURANT_PROVIDER=auto
GOOGLE_API_KEY=
OVERPASS_URL=https://overpass-api.de/api/interpreter
FALLBACK_MODE=false
```

Use `RESTAURANT_PROVIDER=local` for offline demonstrations/tests, or `osm` to explicitly select OSM. Keep credentials out of Git. Google discovery is retained but was not tested against a paid account in this pass. The server key is not included in browser image URLs.

## Fallback And Nutrition

One local catalog consolidates twelve places that were already in the repository's separate catalogs. It is a demo fallback, not a new source of live data. Results label their source. A successful external response with zero places remains empty rather than silently becoming demo results. Old fallback IDs are retained as aliases so stored feedback still applies after consolidation.

No cross-provider identity match is invented. OSM and Google may describe the same business with different IDs; transferring feedback between providers would require a verified mapping. OSM records can also be incomplete or outdated. Attribution is shown in the results page; see [OpenStreetMap licensing](https://www.openstreetmap.org/copyright).

Nutrition is separate from discovery. Existing chain baselines and deterministic, seeded macro/ingredient examples remain illustrative estimates, not measured menu nutrition. They must not be treated as verified allergy or diet information. The UI labels these values and example images. A future nutrition integration needs actual dish-level evidence.

## Feedback Rules

Food feedback belongs to the authenticated user and is shared across search, delivery and daily food contexts. Exact IDs are handled separately from cuisine/source preferences; a dislike of a chicken restaurant no longer becomes an exact-item dislike of every chicken result.

One Not Interested action sets exact affinity to -0.8 and suppresses the item for seven days. The window is `min(30, negativeCount * 7)` days from the latest explicit dislike in the retained feedback history: two dislikes give 14 days. Repeated negatives increase its magnitude to -1. A later Select, Save or Helpful action lifts suppression; an ignored impression does not. Clearing suppression does not erase older negative affinity or guarantee a top-K position. Once suppression expires, remaining negative affinity still lowers ranking. The profile reads recent explicit feedback separately from impression traffic; the JSON datastore's existing retention limit still applies.

The ranking adjustment is `0.3 * itemAffinity`, separate from the displayed nutrition/context match percentage. Suppression happens before final top-K selection, within the provider's bounded candidate pool. Exploration does not override explicit food feedback. Select and Save retain positive effects. Results automatically refetches after Not Interested and has a Refresh Recommendations button that resubmits the original query and filters. Failed refreshes show an error. Older saved search snapshots without a request payload need a new Search first.

## Verification: September 30, 2026

Tests used a temporary datastore, not the normal project data. Browser feedback buttons submitted real requests to the running backend. OSM discovery at `2026-09-30T20:56:26.363Z`, near Athens (33.9519, -83.3576), returned:

| Stage | Count |
| --- | ---: |
| Raw OSM records | 259 |
| Normalized, deduplicated and radius-filtered | 258 |
| Candidate pool | 50 |
| Nutrition-filtered / ranking input | 50 |
| Final top-K | 10 |
| Duplicate final IDs | 0 |

The candidate pool contained 19 named cuisine values. Different branches of a chain are separate places, not duplicate IDs. Provider source is available in `candidateSource` (`osm`/`google` with `fallback: false`, or `local` with `fallback: true`) and in the UI. Counts describe the search stages, not the size of a training dataset.

| Restaurant | Initial rank | Initial reranking score | After Not Interested and fresh search |
| --- | ---: | ---: | --- |
| Lighthouse Seafood | 1 | 0.3599 | Suppressed |
| Ponko Chicken | 2 | 0.3560 | Suppressed |
| Dairy Queen | 3 | 0.3537 | Suppressed |

Canonical IDs were `restaurant:osm:node:5460073304`, `restaurant:osm:node:8833796080` and `restaurant:osm:way:304021825`. They stayed unchanged from discovery through response, feedback storage and reranking. Ten results remained after each replacement request. Lighthouse's first feedback POST returned 201; the automatic search POST returned 200 in about 708 ms, compared with about 4.5 seconds for the cold live search.

A second Lighthouse dislike produced weight -0.9 and two retained negatives. Select cleared suppression while retaining negative affinity (-0.88), so it did not immediately return to top-K. Dairy Queen's later Save cleared suppression and returned it at rank 1 with reranking score 0.4178 and exact-item adjustment +0.06. A separate temporary user still received all three places, with zero exact-item adjustments. Unrelated scores can still change through overall history and cuisine/source preferences; they are not exact-item suppressions.

Overpass also timed out during this pass. The app returned labelled local results without an API error. An earlier fallback search had 11 candidates and 8 final results because three were suppressed. Cached discovery is shared, but personalized rankings are recalculated per user. Google normalization and provider timeout fallback were tested with fixtures; no live Google account was used.

Final checks: 27/27 backend tests, 21/21 research tests, frontend lint/build and backend syntax checks passed. Browser checks found no console errors, failed requests or broken images in the completed feedback flow. Node 20.12.2 still triggers Vite's version warning; use a supported Node version. Screenshots from this check are temporary inspection artifacts, not replacements for the existing report screenshots.

The subsequent pre-commit review fixed stale overlapping refresh responses, cached illustrations retaining an old keyword, invalid recommendation-location parameters, and case-folding of opaque provider IDs. Backend coverage is now 29/29 tests; the other validation commands still pass. A temporary component-level check with delayed responses verified that older refreshes and responses after leaving Results do not overwrite the current search. The live observations above remain the earlier walkthrough, not a new experiment.

## Research Is Separate

MovieLens 100K remains the offline dataset for PyTorch NCF/NeuMF, context and adaptive-user-embedding experiments. No research files, frozen metrics or checkpoints were changed by this phase. Restaurant discovery supplies current application candidates; it is not collaborative training data or neural cross-domain learning.

### Possible Future Food Dataset

[Majumder et al.'s Food.com release](https://github.com/majumderb/recipe-personalization) is a possible offline recipe dataset, not a restaurant directory. The [paper](https://aclanthology.org/D19-1613.pdf) reports 230K+ collected recipes and 1M+ reviews, then a filtered 180K+/700K+ subset. Its training split has 25,076 users, 160,901 recipes and 698,901 actions. Development/test users overlap these populations; split user counts should not be summed as unique users.

The [released data](https://www.kaggle.com/datasets/shuyangli94/food-com-recipes-and-user-interactions) includes user/recipe identifiers, ratings and dated reviews. A future importer could namespace users as `foodcom:<user_id>` and items as `food:foodcom:<recipe_id>`, preserve review dates, and explicitly document rating-to-action thresholds. Date-only records need tied-timestamp handling. License/access terms and missing fields must be checked before import.

Food.com IDs must never be joined to MovieLens IDs as shared people. There is no established user linkage, so this remains separate food recommendation research rather than evidence of learned cross-domain transfer. No dataset download or model training was added here.
