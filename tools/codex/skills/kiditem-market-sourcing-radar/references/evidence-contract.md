# KidItem sourcing evidence contract

Use this reference to select the canonical read or collection surface. Routes assume the global `/api` prefix and an authenticated organization context.

## Canonical replay

Prefer Agent OS capabilities when they are available:

| Capability | Purpose | Effects |
|---|---|---|
| `market.collect_keyword_category_rankings` | Replay 30-day Naver/popular/1688/Shorts market signals | read |
| `coupang.match_products` | Replay Coupang model candidates and components | read |
| `coupang.collect_tracking_snapshot` | Replay persisted Coupang metrics | read |
| `supplier1688.match_products` | Replay/match 1688 supply evidence; supplied URLs may start scrape workflow | read; URL input may cause browser/write work |
| `sourcing.score_opportunities` | Return canonical 1688-first scores and components | read |
| `sourcing.create_recommendation_packet` | Return only persisted Coupang×1688 cross-evidence recommendations | read |
| `market.collect_shadow_signals` | Claim and collect the daily Google/optional LinkFox shadow snapshot | external I/O + DB write; admin approval |

Use the first-class MCP name `market_collect_shadow_signals` when the Agent OS MCP registry is the available surface. Do not add shadow collection to the normal sourcing opportunity playbook.

## HTTP reads

| Route | Evidence |
|---|---|
| `GET /api/sourcing/trend/naver-keywords?days=30` | Naver keyword search and trend history |
| `GET /api/sourcing/trend/popular-keywords?days=30` | Naver shopping popular boards and rank movement |
| `GET /api/sourcing/trend/1688-hot?days=30` | 1688 hot products and supply metrics |
| `GET /api/sourcing/trend/shorts?days=30` | Shorts velocity and engagement |
| `GET /api/sourcing/workspace-snapshots/today_recommendations/recent?days=30` | Coupang recommendation inputs |
| `GET /api/sourcing/workspace-snapshots/1688_new_products/recent?days=30` | 1688 new-product inputs |
| `GET /api/sourcing/workspace-snapshots/market_shadow_signals/recent?days=30` | Generic shadow snapshot read |
| `GET /api/sourcing/trend/shadow?days=30` | Dedicated shadow history read |

Do not invent authentication. Use an existing authenticated session/token or report that live evidence is unavailable.

## Explicit collections

- `POST /api/sourcing/trend/collect` with a validated subset of `naver`, `shorts`, and `1688` refreshes canonical trend snapshots.
- `POST /api/sourcing/trend/shadow/collect` performs the KST daily claim before external calls. Any existing row for that organization and KST business date—including `collecting`, `complete`, `partial`, or `failed`—prevents another call that day.

## Evidence families and confidence

Canonical discovery coverage has six evidence families:

1. Naver keyword history
2. Naver popular history
3. 1688 trend/supply history
4. Shorts history
5. Coupang recommendation evidence
6. 1688 supplier evidence

Use the returned `confidence` and `dataGaps`; do not infer full coverage from row counts. A recommendation additionally requires Coupang×1688 cross-evidence.

## Canonical models

- Coupang demand candidates come from `coupang_first_market_reaction`.
- Supply/order candidates come from `1688_first_new_product_validation`.
- Preserve each model's `score`, `grade`, `decision`, `components`, `reasons`, `risks`, and `modelTags` as emitted.
- Never backfill missing metrics with guessed values or recompute the canonical score in the skill.

## Shadow payload

Scope: `market_shadow_signals`, version `1`.

Expected controls:

- `result.decisionImpact` is always `disabled`.
- `result.evaluation.promotionGate.minimumObservationDays` is `30`.
- `reviewReady=true` only means an operator may review the experiment; `eligible` remains `false` until a separate reviewed implementation promotes a source.
- Google Trends is the fixed official KR RSS control and has no credential.
- LinkFox EchoTik is the paid treatment. Record region, product/relevant/fresh counts, evidence completeness, overlap, novel relevant count, and `costPoints`.

Supported EchoTik regions: `US`, `GB`, `ID`, `TH`, `PH`, `MY`, `VN`, `MX`, `SG`, `SA`, `BR`, `ES`, `JP`, `DE`, `IT`, `FR`. Never default to `US` or accept `KR` on behalf of the user.
