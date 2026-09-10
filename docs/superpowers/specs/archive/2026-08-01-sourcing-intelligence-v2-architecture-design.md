# Sourcing Intelligence V2 Architecture Design

- Date: 2026-08-01
- Status: Proposed
- Parent design: 2026-07-31-sourcing-agent-learning-architecture-design.md
- Classification: sourcing-domain reconstruction plus cross-layer ML control plane
- Scope: Chinese wholesale and manufacturing-cluster discovery, 1688 new-product discovery, SNS and keyword lead signals, China-to-Korea inflow proxies, peer-wholesaler assortment intelligence, Coupang market validation, KidItem-specific entrant fit, supplier economics, test-order recommendation, experimentation, and outcome learning
- Cross-domain exception: read-only projections from Channels, Orders, Finance, Supply, Inventory, Advertising, and Agent OS audit data for the single sourcing decision workflow

## 0. Executive decision

KidItem should build a **Cross-Market Product Intelligence System**, not one
large sourcing score model.

The system creates a platform-independent product concept, detects which
Chinese wholesale market or manufacturing cluster is producing an early supply
signal, estimates whether the related product family is flowing into Korea,
observes which major and category-specialist Korean wholesalers adopt, restock,
and diffuse the concept, and then estimates whether it will show observable
Coupang demand. A separate KidItem-specific model estimates whether this
organization can win after entering with a proposed price, content, ads,
fulfillment, and inventory plan. Supplier economics and hard risks are checked
before a constrained portfolio of small test orders is selected. Every
recommendation is joined through PO, shipment, customs, inventory, listing,
order, return, settlement, and realized profit so ranking and bounded
exploration policies can improve.

This architecture maximizes a calibrated probability and risk-adjusted
business outcome; it cannot honestly guarantee that an untested product will
sell. The defensible promise is that each recommendation carries traceable
evidence, a backtested probability range, an explicit downside, and a planned
test that makes the next recommendation more KidItem-specific.

The production decision has exactly one canonical value:

- **test_order**: evidence, economics, and risk gates are complete and the
  candidate is selected inside the current test budget;
- **hold**: promising but ambiguous, immature, unverified, or not selected by
  the current portfolio constraint;
- **reject**: demand failed, economics are negative, identity is invalid, or a
  blocking compliance, IP, safety, or supplier risk exists.

Order quantity is not encoded in the decision value. It is a separate,
auditable output of the portfolio optimizer.

### 0.1 What V2 changes

| Current behavior | V2 replacement |
|---|---|
| Title token overlap for cross-market matching | Image + multilingual text + attributes retrieval, pairwise reranking, and concept graph |
| One hand-written 0–100 score | Separately calibrated match, demand, entrant-fit, economics, and risk outputs |
| Daily point score | Event-time concept series with 3/7/14/28-day validation episodes |
| No peer-wholesaler behavior model | Adoption, restock, retail propagation, and price-compression observatory |
| 1688 treated as the whole Chinese source market | Multi-panel Chinese supply radar across 1688, export B2B, Yiwu physical-market platforms, and stationery/toy manufacturing clusters |
| “China to Korea orders” inferred from listings | Separate own exact import trace, public HSK-level inflow aggregate, KC entry-readiness proxy, and unavailable competitor order truth |
| External Coupang reaction treated like sales | Explicit proxy-demand prediction; KidItem actual sales only after its listing, with separately scoped provider-returned facts where available |
| One generic entrant score | Market prior plus KidItem/category calibration using controllable launch actions and actual matured outcomes |
| Rough single landed-cost value | Versioned offer terms and P10/P50/P90 landed-cost distribution |
| Recommend candidates independently | Budget/MOQ/risk/concentration constrained portfolio selection |
| Recommendation without learning contract | Immutable slate, score, propensity, override, and delayed outcome ledger |
| “RL first” | Rules, calibrated models, learning-to-rank, offline policy evaluation, then bounded contextual bandit |

### 0.2 Non-negotiable evidence gate

A positive test_order candidate must have:

1. at least three persisted supporting signals across at least two platforms;
2. persisted Coupang × 1688 cross-evidence;
3. the canonical scoring policy recommending an order;
4. decision confidence at or above 0.67;
5. known landed cost, contribution margin range, and required compliance data;
6. no blocking KC/safety, IP/licensing, supplier, or economics risk.

Google Trends, LinkFox, Chinese wholesale/cluster panels, public trade
aggregates, KC entry signals, and any licensed shipment-data provider begin as
separately governed shadow sources with decisionImpact set to disabled and
zero score contribution until a separate minimum 30-business-day review
approves promotion. They never replace persisted Coupang demand evidence.

## 1. The model is a system of specialist models

V2 has nine independently testable capabilities. Their outputs are composed
by policy; they are not hidden inside one opaque score.

| ID | Capability | Question | Primary output |
|---|---|---|---|
| M1 | Product Concept Resolver | Are these 1688, SNS, keyword, and Coupang entities the same product, a variant, or only a substitute? | relation probability and concept ID |
| M2 | Lead-Signal Detector | Is the signal early, accelerating, broadly confirmed, and likely to lead Korea? | trend phase, lead probability, expected lead days |
| M2P | Peer Sourcing Observatory | Which independent wholesalers adopted, restocked, or propagated the concept, and is diffusion early or already crowded? | peer adoption, persistence, propagation, and saturation vector |
| M2C | China Supply and Korea Inflow Observatory | Is this concept emerging across independent Chinese supply panels, and what exact or aggregate evidence shows Korean entry? | supply novelty, cluster breadth, HSK inflow state, KC readiness, and evidence granularity |
| M3 | Coupang Market Twin | Will observable Coupang market reaction validate within 7/14/28 days? | calibrated probability and reaction quantiles |
| M4 | KidItem Entrant-Fit Model | Given price, fulfillment, content, ads, and review disadvantage, can KidItem win? | 28/56-day success probability |
| M5 | Supply/Economics Engine | Can KidItem source safely at acceptable downside-adjusted economics? | landed-cost and margin distributions plus hard risks |
| M6 | Portfolio Policy | Which candidates and quantities maximize expected value under constraints? | test slate, quantity, capital at risk |
| M7 | Learning Policy | Where is bounded exploration worth spending test budget? | ranking, exploration flag, and propensity |

An LLM is outside these numeric models. It may extract attributes from difficult
evidence, explain a decision, ask for missing operator input, and orchestrate
approved tools. It cannot manufacture evidence, alter hard gates, or silently
replace a missing deployed model.

## 2. Logical architecture

~~~mermaid
flowchart TB
    subgraph Sources["Persisted market and operating evidence"]
      S1688["1688 offers, new products, suppliers"]
      China["Yiwu / Chinagoods / Yiwugo, Alibaba.com, Chenghai, Ningbo"]
      Trade["KCS HSK trade aggregates, KC certificates, requirements"]
      SNS["Shorts / TikTok / live commerce"]
      Search["Naver keyword and popular rank"]
      Peer["Major and specialist wholesaler catalogs"]
      Coupang["Coupang SERP, rank, review, price"]
      Import["KidItem PO, invoice, B/L, customs, inbound lot"]
      Own["KidItem Wing sales, orders, returns, ads, P&L, inventory"]
    end

    subgraph Evidence["Evidence and identity plane"]
      OL["Append-only observation ledger"]
      DQ["Freshness, quality, provenance"]
      PCG["Product Concept Graph"]
      SL["Source-lineage and independence graph"]
      IX["Multimodal retrieval index"]
    end

    subgraph Intelligence["Specialist intelligence plane"]
      LS["M2 Lead-signal detector"]
      CM["M1 Concept resolver"]
      PSO["M2P Peer Sourcing Observatory"]
      CIO["M2C China supply and Korea inflow"]
      MT["M3 Coupang Market Twin"]
      EF["M4 KidItem entrant fit"]
      SE["M5 Supply and economics"]
    end

    subgraph Decision["Decision plane"]
      HG["Hard policy gates"]
      PO["M6 Portfolio optimizer"]
      EP["M7 Bounded exploration policy"]
      DL["Immutable decision ledger"]
    end

    subgraph Action["Execution and learning"]
      RP["Recommendation packet"]
      AO["Agent OS explanation and approval"]
      TO["Test order / listing"]
      OP["Outcome projector"]
      TR["Point-in-time training and evaluation"]
    end

    S1688 --> OL
    China --> OL
    Trade --> OL
    SNS --> OL
    Search --> OL
    Peer --> OL
    Coupang --> OL
    Import --> OL
    Import --> OP
    Own --> OP
    OL --> DQ --> PCG
    DQ --> SL
    PCG --> IX --> CM
    DQ --> LS
    CM --> PSO
    SL --> PSO
    CM --> CIO
    DQ --> CIO
    CM --> MT
    LS --> MT
    PSO --> MT
    CIO --> MT
    CIO --> SE
    MT --> EF
    PCG --> SE
    EF --> HG
    SE --> HG
    HG --> PO --> EP --> DL --> RP --> AO --> TO
    TO --> OP
    DL --> OP --> TR
    TR -. versioned artifacts .-> CM
    TR -. versioned artifacts .-> LS
    TR -. versioned artifacts .-> PSO
    TR -. versioned artifacts .-> MT
    TR -. versioned artifacts .-> EF
    TR -. champion policy .-> EP
~~~

### 2.1 Two loops, not one

The system has a fast evidence loop and a slower learning loop.

~~~mermaid
sequenceDiagram
    participant Collector as Deterministic collectors
    participant Sourcing as NestJS Sourcing
    participant ML as Python ML plane
    participant Agent as Agent OS
    participant Ops as Operator
    participant Outcome as Outcome projector

    Collector->>Sourcing: persisted observations
    Sourcing->>ML: point-in-time concept/evidence features
    ML-->>Sourcing: versioned model outputs
    Sourcing->>Sourcing: hard gates and portfolio optimization
    Sourcing->>Agent: evidence-backed packet
    Agent-->>Ops: explanation and approval request
    Ops-->>Sourcing: approve, hold, reject, or override
    Sourcing->>Outcome: immutable decision and propensity
    Outcome->>Outcome: 7/14/28/56-day outcomes mature
    Outcome->>ML: versioned training dataset
    ML-->>Sourcing: evaluated challenger artifact
~~~

No training or model promotion occurs inside an online recommendation request.

## 3. Evidence plane: point-in-time truth first

The existing daily snapshot tables remain useful projections. V2 adds an
append-only observation contract so same-day corrections, late arrivals, and
historical model reconstruction are possible.

Every evidence observation needs:

- organizationId;
- source and sourceEntityId;
- evidenceFamily;
- eventAt: when the source event happened;
- observedAt: when KidItem captured it;
- availableAt: when the value became usable by a decision;
- businessDate in KST;
- ingestionRunId and collectorVersion;
- rawPayloadHash and normalizedPayload;
- qualityFlags, parserConfidence, and source URL;
- decisionImpact: enabled, shadow, or disabled.

Training row eligibility is strict:

~~~text
observation.availableAt <= decision.decisionAt
~~~

Rows that arrived later may correct reporting but cannot become features for a
historical decision. This prevents future leakage.

### 3.1 Canonical evidence families

The initial production evidence contract uses six families over the most recent
30 KST business days:

1. Naver keyword demand;
2. Naver popular-keyword rank;
3. 1688 trend and supply evidence;
4. Shorts/SNS evidence;
5. Coupang recommendation, SERP, rank, price, and review evidence;
6. 1688 supplier evidence.

Demand and supply evidence are separate. Many 1688 offers do not prove Korean
demand, and Coupang demand does not prove sourceability.

Peer-wholesaler assortment is introduced as a seventh **shadow
supply-behavior family**, not as canonical demand evidence. It remains
decisionImpact=disabled for at least 30 KST business days and must demonstrate
incremental predictive value before promotion. Even after promotion:

- several wholesalers derived from one upstream feed count as one independent
  lineage cluster, not several platforms;
- all peer-wholesaler sources collectively remain one supply-behavior evidence
  family for canonical coverage, even when several actors are independent;
- wholesaler adoption cannot replace persisted Coupang demand evidence;
- absence from a wholesaler is unknown, not negative demand;
- missing peer data cannot by itself produce reject;
- peer evidence may strengthen supply diffusion, timing, or saturation risk,
  but test_order still requires every canonical Coupang × 1688 gate.

Chinese wholesale/cluster and Korea-inflow evidence is introduced as two more
independently governed shadow families:

- **China supply breadth** measures availability, novelty, independent factory
  or booth adoption, price/MOQ compression, and export readiness. It does not
  measure Korean consumer demand.
- **Korea inflow** is either KidItem-owned exact import truth or an aggregate
  or inferred market proxy. Public HSK statistics, KC certificates, and
  logistics observations never become product-level competitor orders.

All such observations store evidenceType as exact, aggregate, or inferred;
granularity as own_sku, concept, certified_model, hsk10, hsk6, category, or
route; and a source-specific decisionImpact. Evidence of different granularity
is not averaged into one confidence. The recommendation packet must say which
level is actually known.

### 3.2 Evidence quality score is not decision confidence

For each observation, compute:

- freshness decay by evidence family;
- completeness of required fields;
- parser confidence;
- source availability and collection gaps;
- duplicate/spam likelihood;
- revision status;
- historical source reliability.

This produces evidenceQuality for weighting and monitoring only. It must not be
presented as market-demand or decision confidence.

### 3.3 Collection cadence

Daily business-date projections remain the canonical comparison surface, but
the raw observation cadence should reflect source speed:

| Source family | Initial cadence |
|---|---|
| SNS, live commerce, fast 1688/Coupang surfaces | Configurable 4–6 hour micro-batch where collection policy permits |
| Peer wholesaler catalog, stock, and price | Daily; faster only through an authorized API/feed and measured need |
| Chinese wholesale/cluster catalog and supplier-store delta | Daily or provider-feed cadence; initial imports are baseline inventory, not “new” |
| KCS country × HSK trade aggregate | Monthly revision-aware projection; never polled as if real-time SKU demand |
| Safety Korea certificate/recall evidence | Daily approved API or documented batch refresh; certificate is readiness/risk evidence only |
| KidItem PO, B/L, customs, inbound cost, and lot trace | Event-driven from owner-domain records and authorized accounts |
| Naver keyword and popular rank | Daily |
| Supplier quote, compliance, and landed-cost terms | Event-driven plus pre-decision refresh |
| KidItem commercial outcomes | Daily close plus fixed maturity horizons |

The architecture does not require streaming infrastructure. Multiple
append-only observations may roll up to one KST daily projection while
preserving intraday acceleration and the exact availability cutoff.

## 4. Product Concept Graph

The graph is the central abstraction. A product concept is a platform-neutral
commercial idea such as “magnetic reusable dress-up sticker book,” not a URL,
1688 offer, Coupang listing, or keyword.

### 4.1 Node types

| Node | Meaning |
|---|---|
| ProductConcept | Stable base product idea |
| ProductVariant | Size, color, pack, material, licensed design, or bundle variant |
| SourceEntity | 1688/Alibaba/Yiwu/cluster catalog item, Coupang listing, SNS creative, live-commerce product, or fair exhibit |
| KeywordEntity | Korean/Chinese query or normalized intent |
| SupplierEntity | 1688 factory or merchant identity |
| MarketActor | Marketplace seller, importer, wholesaler, physical-market booth, trading company, export agent, B2B marketplace, supplier, or factory with an explicit actorRole |
| TradeClassificationEntity | Versioned HSK code and effective-date metadata |
| CertificationEntity | KC/safety certificate, model, holder, manufacturer, and status evidence |
| EvidenceObservation | Time-bound persisted fact |

### 4.2 Edge types

| Edge | Transfer rule |
|---|---|
| exact_variant | Strong identity; evidence can aggregate after pack/price normalization |
| base_variant | Same base product, meaningful variant difference; aggregate only concept-level signals |
| substitute | Same job-to-be-done but different item; useful for competition, never exact-sales transfer |
| complement | Bought/used together; useful for portfolio and bundling |
| mentioned_by | Creative or keyword refers to the concept |
| supplied_by | Offer or variant belongs to supplier |
| manufactured_by / traded_by | Separates a factory from a trading company, booth, or export agent |
| catalogued_by | A peer actor exposed the concept in its assortment |
| likely_syndicated_from | Two listings likely share one supplier/feed and are not independent adoption |
| classified_as_candidate | Probabilistic concept/variant-to-HSK relation for analytics/pre-check, with verification status |
| certified_as_candidate | Probabilistic product/model-to-certificate relation, never proof of import or sales |
| imported_as | KidItem-owned exact declaration/lot relation only, backed by authorized operational evidence |

Every learned edge stores probability, evidence references, model version,
validFrom/validTo, reviewer status, and superseded edge. Ambiguous relations are
first-class data rather than silently forced matches.

### 4.3 Multistage identity resolution

1. **Exact normalization**: canonical URL/ID, image perceptual hash, normalized
   brand, model number, barcode, and pack count.
2. **Hard compatibility filter**: taxonomy, intended age, material, dimensions,
   licensing/IP, and incompatible product form.
3. **High-recall retrieval**: multilingual title and attribute embedding plus
   product-image embedding retrieves top-K possible concepts/listings.
4. **Pairwise reranking**: a supervised pair classifier or cross-encoder uses
   translated title, image similarity, attributes, category path, pack count,
   and price ratio.
5. **Graph consistency**: reject impossible transitive links and incompatible
   variant relations.
6. **Calibration and review**: attach only above a calibrated risk threshold;
   route the ambiguous band to operator confirmation when it affects a
   test_order decision.

A two-stage bi-encoder retrieval and cross-encoder rerank pattern keeps recall
high without pairwise scoring the entire catalog. A local Faiss index is enough
for the first deployment; a separate vector database is not required.

### 4.4 Matching supervision and evaluation

Operator labels use four values:

- exact_variant;
- base_variant;
- substitute;
- unrelated.

The benchmark must include hard negatives from the same category and visually
similar licensed/unlicensed goods. Split by product concept and time, never by
random row, so variants of one concept cannot leak across train and test.

Required metrics:

- candidate Recall@50;
- MRR and Precision@1;
- per-relation precision/recall;
- expected calibration error and reliability plot;
- false exact-match rate for decision-impacting candidates;
- human-review rate.

## 5. Lead-Signal Detector

This model answers whether 1688, SNS, or keywords are early enough to create an
advantage. It does not answer whether KidItem should order.

### 5.1 Source-specific features

**1688**

- first-seen age and new-offer density;
- sales/rank velocity and acceleration;
- supplier-count growth;
- price dispersion and MOQ movement;
- repurchase/trade signals when persisted;
- image-cluster novelty versus prior 90 days.

**SNS and live commerce**

- view, like, comment, and post velocity;
- velocity normalized by account/channel baseline;
- creator diversity and cross-post spread;
- number of independent creatives mentioning the concept;
- engagement quality and suspected spam duplication;
- creative age, product-screen time, and product-link evidence.

**Search**

- search-level acceleration, not only absolute volume;
- popular-rank climb and persistence;
- cross-keyword breadth;
- seasonality-adjusted surprise;
- demand/competition divergence.

### 5.2 Trend state output

For each ProductConcept × businessDate:

~~~text
phase = emerging | growing | mature | fading
leadProbability7d
leadProbability14d
expectedLeadDays
sourceReliability
changePointAt
uncertainty
~~~

The first version uses robust rolling features and a calibrated gradient-boosted
model. A temporal transformer or graph neural network is justified only after
enough concept-day histories exist and beats the simpler model in walk-forward
evaluation.

### 5.3 Lead-label definition

A positive label means evidence available at t0 preceded a defined future
Coupang proxy-demand validation event within 7, 14, or 28 days. It does not mean
the competitor sold a known number of units.

Evaluate with:

- Precision@K under the daily review budget;
- PR-AUC for rare emerging products;
- median and P75 lead days among true positives;
- false-discovery rate;
- performance by source, category, and season;
- probability calibration.

### 5.4 Peer Sourcing Observatory

The Peer Sourcing Observatory infers the statistical sourcing behavior of
major and category-specialist wholesalers from public or authorized catalog
changes. It does not claim access to a competitor's private purchase orders,
internal selection rules, inventory turns, or sales.

Its purpose is to locate a concept in the diffusion sequence:

~~~mermaid
flowchart LR
    A["1688 or manufacturer first-seen"] --> B["First independent wholesaler adoption"]
    B --> C["Cross-wholesaler adoption"]
    C --> D["Restock and catalog persistence"]
    D --> E["Coupang seller/listing propagation"]
    E --> F["Price compression and saturation"]
    F --> G["Durable, crowded, or decaying market"]
~~~

The useful opportunity window is often an independently confirmed wholesale
adoption with persistence, while Coupang retail propagation and price
compression remain low. A large number of wholesale listings may instead mean
that KidItem is already late.

#### 5.4.1 Observed event contract

Store changes, not only the latest catalog page:

| Event/feature | Interpretation guard |
|---|---|
| lastAbsentAt and firstPresentAt | An interval-censored first observation; not an exact launch date unless the provider supplies registration time |
| registrationAt | Provider-returned registration date with source provenance |
| assortment rank/badge | New, best, MD pick, sales rank, or home exposure; source-specific semantics remain separate |
| stock state | In stock, out of stock, preorder, discontinued, or unknown |
| restock transition | Indirect persistence evidence, never a sold-unit count |
| price/MOQ/pack change | Normalize pack, VAT, and delivery before comparing |
| supplier/actor change | Separates new independent adoption from a mirrored feed |
| catalog persistence | Still observed after 30/60/90 days with coverage known |
| retail propagation | New independent Coupang listings/sellers after peer first-seen |

Collector downtime and site redesign must create coverage gaps, not false
delist/stockout events.

#### 5.4.2 Starting source panel

The first panel is selected for breadth, category relevance, and observable
fields. It is not a verified market-share ranking. Platform self-descriptions
and category counts are discovery evidence; their predictive reliability is
learned from KidItem's own historical episodes.

| Panel role | Candidate source | Observable value |
|---|---|---|
| Broad scale | [Domeggook/Domeme](https://marketplace.coupang.com/information-center/domegguk-intro?rf=MARKETPLACE) | Coupang describes 3.2M Domeggook members and 70K Domeme professional sellers; an official [Open API](https://docs.channel.io/domeggook_api/ko) exposes product lookup |
| Broad scale | [OwnerClan](https://www.ownerclan.com/V2/service/api-center-main.php) | Authorized seller/partner APIs, supplier grades, large child/toy catalog, product and operating quality evidence |
| Broad scale and downstream connection | [OnChannel](https://www.onch3.co.kr/dbcenter_renewal/excel_download_center.html) | Today's products, sales rankings, previous-day winners, supplier scores, KC filters, registration filters, and marketplace transfer workflow |
| Import/development scout | [Dometopia](https://m.dometopia.com/b2b/index) | States roughly 30 new products per day, has a stationery/toy development team, new-product pages, sales/click ranking, price and pack data |
| Stationery/character specialist | [Cheonyu](https://www.cheonyu.com/m/) | Recent products, Coming Soon, category/brand best, stock/restock/discontinued states; use only its approved export/partnership route because its FAQ disallows crawling |
| Stationery/toy specialist | [NewThing](https://www.nthing.kr/shop) | New/popular/sold-out collections, restock alerts, barcodes, pack prices, category-specialist reviews and field curation |
| Stationery/toy specialist | [Perzoom](https://www.perzoom.co.kr/) | Month-separated new and restocked products, sales TOP400, real-time BEST100, pack prices, and detailed stationery/toy taxonomy |

Use two strata:

1. broad B2B marketplaces measure catalog diffusion and downstream seller
   accessibility;
2. specialist wholesalers measure early category curation and physical-retail
   persistence.

A specialist with high historical lead precision may be more valuable than a
larger general catalog for one category.

#### 5.4.3 Collection policy

Collection priority is:

1. provider Open API or approved partner feed;
2. authorized business-account CSV/Excel export whose license permits internal
   analysis;
3. public new/best/restock pages under reviewed terms, robots policy, rate
   limit, and source-specific collection approval;
4. manual evidence capture for sources without an approved automated route.

Do not automate logged-in pages, bypass access controls, reuse product images
outside their license, or infer private order/customer data. Each source
registry row stores collectionPolicy, credentialScope, allowedFields,
retentionPolicy, rateLimit, termsReviewedAt, and kill switch. A source failure
must be isolated from the rest of discovery.

Initial onboarding defaults:

- Domeggook/Domeme: official Open API only for automation;
- OwnerClan: approved seller/partner API or contracted product DB;
- OnChannel: approved business-account export/integration;
- Cheonyu: provider-approved Excel/export or partnership; no crawler;
- Dometopia, NewThing, and Perzoom: manual low-frequency shadow evidence until
  written permission, feed, or approved API exists.

The source registry records collectionEligibility as api_authorized,
feed_authorized, manual_only, or blocked. A source with manual_only or blocked
status cannot be scheduled by Automation.

#### 5.4.4 Source-lineage independence

Catalogs frequently syndicate the same upstream supplier feed. ProductConcept
matching alone would overcount them as independent votes.

Build an actor/source-lineage graph from:

- identical provider product IDs, barcodes, images, titles, option order, and
  detail-page hashes;
- identical supplier names, MOQ tiers, prices, stock changes, and timestamps;
- corporate ownership or explicit partner/feed relationships;
- repeated same-minute cross-site listing/update patterns.

Each adoption feature uses independenceClusterId. Five mirrored storefronts
inside one feed cluster count as one adoption. Store the inferred lineage
confidence and allow operator correction.

#### 5.4.5 Reverse-inferred sourcing profile

For peer actor w and concept x, train:

~~~text
P(actor w adopts concept x within 7/14/28d)
  = f(
      1688 novelty and supplier breadth,
      SNS velocity and creator diversity,
      keyword acceleration,
      category and season,
      normalized price and MOQ,
      compliance/IP attributes,
      current Coupang saturation,
      actor w historical category/price/timing behavior
    )
~~~

The resulting SourcePolicyProfile contains descriptive response curves:

- category and season preference;
- normal 1688-to-catalog lead range;
- price, pack, and MOQ band;
- novelty versus proven-demand preference;
- licensed/character-product exposure;
- tendency to enter before or after Coupang reaction;
- persistence/restock precision after initial adoption.

This is a behavioral estimate, not proof of the actor's causal reasoning or
internal policy. Feature attribution explains the prediction; it must not be
presented as a competitor's secret rule.

Unadopted concepts are positive-unlabeled data because KidItem does not know
which candidates the peer actually considered. Use risk-set sampling from
concepts that were observable in the same period/category and evaluate against
future adoption; do not mark the entire unlisted universe as negative.

#### 5.4.6 Specialist peer models

| Model | Output |
|---|---|
| Peer Adoption Hazard | Probability each independent actor/cluster adopts within 7/14/28 days |
| Persistence/Restock | Probability the concept persists or restocks within 30/60 days |
| Retail Propagation | Probability and lag until new independent Coupang listings/sellers appear |
| Saturation/Price Compression | Future seller-density and normalized-price downside |
| Source Reliability | Category/horizon-specific posterior based on prior lead precision and coverage |

Store outputs as a vector:

~~~json
{
  "independentAdopterCount7d": 0,
  "peerAdoptionProbability14d": 0.0,
  "restockPersistenceProbability60d": 0.0,
  "retailPropagationProbability14d": 0.0,
  "estimatedPeerLeadDays": null,
  "saturationRisk28d": 0.0,
  "priceCompressionRisk28d": 0.0,
  "peerEvidenceConfidence": 0.0,
  "peerMarketState": "isolated_test"
}
~~~

The values above define shape only; production values are model results and
must never be fabricated or defaulted.

Useful peerMarketState values are:

- isolated_test: one actor, no persistence yet;
- early_adoption: a small number of independent actors adopt quickly;
- early_validating: adoption plus restock/persistence, low retail diffusion;
- retail_propagating: new Coupang sellers/listings begin to spread;
- crowded: seller growth and price compression are both elevated;
- decaying: persistence/restock and downstream reaction fade.

These states are explanatory. They are not additional canonical decisions.

#### 5.4.7 Decision integration

**High-value early window**

~~~text
independent peer adoption increasing
+ persisted restock/persistence
+ Coupang retail propagation still early
+ price compression low
+ canonical 1688 × Coupang evidence complete
+ economics and hard risks passed
~~~

**Crowding warning**

~~~text
many independent wholesale adopters
+ rapid Coupang seller/listing growth
+ falling normalized wholesale/retail price
+ worsening contribution-margin downside
~~~

Rules:

- peer evidence alone can never produce test_order;
- an early peer signal without Coupang validation is hold with
  nextEvidenceAction=observe_until;
- high crowding can reduce utility or contribute to reject only together with
  adverse demand/economics/risk evidence;
- missing peer evidence is a data gap, not negative evidence;
- model influence remains zero during shadow and is promoted only through an
  explicit reviewed deployment;
- any post-promotion influence cap is selected from walk-forward ablation and
  downside constraints, not a hand-written universal weight.

#### 5.4.8 Learning and evaluation

Labels and metrics:

| Target | Label | Metrics |
|---|---|---|
| Peer adoption | First independent appearance within 7/14/28 days | PR-AUC, Brier, Precision@K |
| Persistence | Observed retention/restock at 30/60 days | C-index, Brier, calibration |
| Retail propagation | New independent Coupang listing/seller within 7/14/28 days | PR-AUC, lag MAE |
| Price compression | Future normalized unit-price distribution | pinball loss, direction accuracy, interval coverage |
| Incremental sourcing value | Future Coupang validation and KidItem mature outcome | lift/NDCG/profit versus V2 without peer features |

Use time-ordered rolling evaluation, concept holdout, and actor holdout.
Promotion requires incremental lift over the existing 1688/SNS/keyword/Coupang
model, acceptable calibration, known lineage duplication rate, and no
downside-risk regression. Correlation between peer adoption and demand is not
claimed as causation.

Critical failure modes:

- mirrored supplier feeds inflate adoption velocity;
- initial crawler coverage makes every existing item appear new;
- site redesign or outage appears as delisting/stockout;
- preorder/test listings appear as committed inventory;
- pack/option mismatch appears as price compression;
- clearance creates a false demand signal;
- the peer and Coupang merely react to the same SNS signal;
- copying peers creates category and supplier concentration.

### 5.5 China Supply and Korea Inflow Observatory

M2C answers two different questions and never collapses them:

1. **China supply state**: where is a concept being introduced, repeated by
   independent factories or booths, prepared for export, or commoditized?
2. **Korea inflow state**: what exact, aggregate, or inferred evidence shows
   that the related product or product family is entering Korea?

It does not claim that a public Chinese listing is an export to Korea or that
an HSK import increase is an individual 1688 SKU order.

#### 5.5.1 Chinese source-market panel

“Top tier” is operationally defined by source role, coverage, data quality, and
historical lead precision—not by an unsupported universal market-share list.
Start with a stratified panel:

| Source role | Candidate panel | Legitimate observation and interpretation |
|---|---|---|
| Domestic wholesale anchor | [1688](https://www.alibabagroup.com/en-US/about-alibaba-businesses-1941299332078632960) | Alibaba describes it as China's leading integrated domestic wholesale marketplace; observe authorized offer/store deltas, supplier breadth, price tiers, MOQ, and shipment fields. It remains a supply signal, not evidence of Korea-bound orders. |
| Global export B2B | [Alibaba.com](https://www.alibabagroup.com/en-US/about-alibaba-businesses-1747711844698554368) | Export-oriented product, supplier, fulfillment, and trade-service evidence. Provider badges, rank, query interest, or supplier-reported metrics retain their exact provider semantics and are not converted into Korean sales. Use approved Open Platform permissions or contracted exports. |
| Yiwu physical-market bridge | [Chinagoods](https://tz.chinagoods.com/about_us) | Official online platform connected to Yiwu's physical market; booth/store identity, new arrivals, price/MOQ, RFQ or buyer-intent fields, and cross-border intelligence can reveal supply novelty. Derived cross-border rankings are provider intelligence, not raw marketplace sales. |
| Yiwu physical-market bridge | [Yiwugo](https://img1.yiwugo.com/webpage/2018/enaboutus/index.html) | Official China Yiwu Commodity Markets website; booth, catalog, price/MOQ, and permitted rank evidence. Its official page describes partnership/API data output, so use a written data agreement rather than assuming unrestricted collection. |
| Yiwu cluster regime | [Yiwu Index](https://www.ywindex.com/) | Weekly/monthly category price and prosperity regimes for toys and cultural/office goods. This is category-level context, never SKU demand. |
| Toy manufacturing cluster | [Chenghai toy cluster](https://www.shantou.gov.cn/stsgxj/gkmlpt/content/2/2415/post_2415452.html) and [CITF](https://www.citf.com.cn/) | Factory/region, exhibitor, launch, certification, and export-intent evidence. Government cluster scale is a reason to monitor the cluster, not proof that every portal or exhibitor is top tier or that a displayed item traded. |
| Stationery manufacturing cluster | [Ningbo stationery cluster](https://cacs.mofcom.gov.cn/article/flfwpt/jyjdy/cgal/202201/171843.html), [Ningbo Stationery Fair/Antway](https://www.exponingbo.com/), and [CSF](https://www.chinastationeryfair.com/) | Manufacturer, exhibitor, latest-release, innovation, RFQ, and category evidence for stationery, DIY, educational, and adjacent toy products. Exhibition is launch/export intent, not an order. |
| Broad export-intent panel | [Canton Fair](https://www.cantonfair.org.cn/en-US?id=2552) | Exhibitor, product, new collection, and sourcing-request evidence. It can strengthen export readiness and novelty, not transaction volume unless a provider-returned authorized field explicitly says so. |

Private toy portals, editorial trade media, and additional B2B marketplaces may
be evaluated later, but their self-reported supplier data, editorial rankings,
and restrictive terms require separate provenance. No source is automated
without an approved API, feed, account export, or written permission. A public
web page is not itself authorization for bulk collection.

The source registry classifies panels as global_export_marketplace,
domestic_wholesale_marketplace, yiwu_physical_market, cluster_macro,
toy_cluster_or_fair, stationery_cluster_or_fair, or export_fair. Events retain
one of new_listing, catalog_update, supplier_capability, buyer_intent,
transaction_proxy, export_readiness, or cluster_regime. These semantics prevent
a “most popular,” RFQ, exhibition, or supplier-choice badge from becoming a
fabricated sold-unit count.

#### 5.5.2 Cross-panel independence and supplier quality

The same factory, trading company, image, mold, or syndication feed may appear
on 1688, Alibaba.com, Yiwu platforms, and a trade fair. Reuse the source-lineage
graph and count one upstream independence cluster using:

- unified social credit code, registered company and verified factory address;
- brand, model, barcode, certification holder, patent, and manufacturer;
- image/detail-page hashes, option order, carton data, MOQ, and synchronized
  updates;
- declared marketplace, booth, subsidiary, or agency relationships;
- operator-reviewed factory versus trading-company identity.

Supplier quality is also a vector, not one badge:

~~~text
factoryIdentityConfidence
exportReadiness
productDocumentationCompleteness
quoteResponsiveness
samplePassRate
historicalLeadTime P50 / P90
historicalDefectRate posterior
claimResolutionRate
minimumOrderFlexibility
evidenceCoverage
~~~

Provider badges and supplier self-claims are features with provenance. KidItem
sample inspection, actual arrival, defect, lead-time, and claim outcomes are
stronger organization-owned labels.

Do not hardcode one permanent “top wholesaler” list. Build a category-relative
ChinaActorProfile for manufacturer, factory-direct seller, physical-market
booth, trading company, export agent, and marketplace. Rank actors by:

- verified legal/factory/booth identity and independent source corroboration;
- new-concept lead precision before Korean/Coupang validation;
- stationery/toy category depth and genuinely new assortment rate;
- documentation, certification, export, sample, MOQ, and response capability;
- KidItem's realized lead time, landed-cost error, defect, shortage, and claim
  history;
- price competitiveness after pack, quality, freight, duty, and defect
  normalization;
- IP/counterfeit, safety, ownership, and concentration risk.

Actor tiers such as strategic_anchor, category_specialist, emerging_factory,
trading_intermediary, and unverified are versioned descriptive outputs. A
large catalog or platform badge cannot alone create a top tier, and tier never
bypasses product-level economics or compliance gates.

#### 5.5.3 What can be known about China-to-Korea orders

There is no reliable public feed of every competitor's China-to-Korea order at
buyer × 1688 SKU × quantity resolution. The architecture makes the visibility
boundary explicit:

| Evidence | Resolution | What it proves | What it cannot prove |
|---|---|---|---|
| KidItem PO, invoice, payment, B/L/AWB, import declaration, and inbound lot | own supplier SKU/variant/lot | KidItem's exact ordered, shipped, declared, received, and realized-cost facts | competitor orders |
| Authorized KidItem UNI-PASS or broker/forwarder data | own declaration/cargo | own customs state and declaration fields | market-wide discovery of unknown competitor cargo |
| [KCS item × country trade API](https://www.data.go.kr/data/15100475/openapi.do) | month × origin country × HSK up to 10 digits | aggregate China-origin import weight and USD value for a product class | buyer, supplier, platform SKU, individual order, or sold units |
| [Safety Korea Open API](https://www.safetykorea.kr/release/openapi2) | certificate/model/manufacturer/holder where returned | product entry preparation, certification state, and safety/recall evidence | that stock was imported or sold, and how much |
| Korean wholesaler and Coupang propagation | matched concept/listing/actor | downstream catalog adoption and observable retail reaction | upstream purchase quantity or competitor unit sales |
| Licensed shipment/B/L vendor | vendor-dependent shipment/company/product text | only fields within audited country/mode coverage and legal license | complete Korea coverage or exact product identity by default |

The public KCS response exposes period, country, HSK, import weight, and import
USD amount. Use it as an aggregate inflow-pressure feature with revisions and
seasonality. Do not compute an order count that the API does not return. The
related KCS item-statistics documentation states that monthly data are revised
for corrected or withdrawn declarations and that imports use CIF value.

UNI-PASS exposes cargo progress by a known cargo-management number or M/H B/L
and account-authorized services through a logged-in Open API management flow.
Therefore it is a verification path for KidItem's own or otherwise authorized
cargo, not a search engine for competitors' unknown shipments.

Likewise, a normal buyer view of 1688 or another source platform does not
expose a complete Korea-destination order ledger. Destination/order fields may
be used only when returned for KidItem's own authorized transaction or through
a supplier account/data agreement with an explicit legal basis.

#### 5.5.4 Product concept to HSK is a probability distribution

One concept may map to several HSK codes depending on material, intended use,
age claim, set composition, and import condition; one HSK code also contains
many unrelated SKUs. Persist a versioned classification candidate set:

~~~json
{
  "conceptId": "concept-id",
  "asOf": "decision-time",
  "candidates": [
    {
      "hsk10": "candidate-code",
      "probability": 0.0,
      "basis": ["material", "intended_use", "set_composition"]
    }
  ],
  "status": "model_suggested",
  "verifiedEvidenceRef": null
}
~~~

The zero above defines the payload shape, not a production prediction. The
model suggestion may join aggregate statistics and pre-check requirements, but
it never becomes an import declaration automatically. A qualified person,
broker, or official classification decision supplies verifiedHsk10 and its
effective version before order approval when required.

For aggregate feature attribution, marginalize instead of choosing the most
convenient code:

~~~text
E[China-to-Korea inflow feature]
  = sum over hsk candidates(
      P(hsk | concept evidence) * standardized HSK inflow feature
    )
~~~

High classification entropy reduces inflow confidence. It cannot be hidden by
a strong aggregate trend in one candidate code.

#### 5.5.5 Inflow feature and output contract

Model source-market and Korea-inflow state separately:

~~~text
P(Korea product-family inflow rises within h |
  independent Chinese supply novelty,
  factory/booth breadth,
  price and MOQ movement,
  export-readiness evidence,
  HSK candidate distribution,
  seasonally adjusted China-origin HSK value/weight,
  new matched KC evidence,
  Korean peer-wholesale propagation,
  route and logistics regime)
~~~

Outputs are a vector:

~~~json
{
  "chinaSupplyNovelty": 0.0,
  "independentChinaSourceClusters": 0,
  "supplierDepth": 0.0,
  "exportReadiness": 0.0,
  "priceCompressionRisk28d": 0.0,
  "koreaInflowProbability28d": 0.0,
  "koreaImportMomentumHsk": 0.0,
  "koreaEntryPreparation": 0.0,
  "regulatoryFriction": "unknown",
  "expectedLeadDaysToKorea": null,
  "importEvidenceGranularity": "hsk10_aggregate",
  "importEvidenceType": "aggregate",
  "classificationConfidence": 0.0,
  "inflowEvidenceConfidence": 0.0
}
~~~

Again, zeros define shape only. importEvidenceGranularity uses own_exact,
certified_model, hsk10_aggregate, hsk6_aggregate, category_aggregate, or
unavailable. No output named exactOrderCount or competitorOrderQuantity exists
without legally obtained exact evidence.

Labels also preserve truth level:

- own_exact_inflow: KidItem shipment/declaration/receipt reached the defined
  milestone;
- market_inflow_aggregate: a future China-origin HSK period exceeded its
  seasonally adjusted baseline after revision;
- korea_entry_proxy: matched KC and independent Korean wholesale/retail
  propagation met a documented composite threshold;
- coupang_proxy_demand and kiditem_commercial_outcome: remain the separate M3
  and M4 targets.

Do not pool these into one positive label. A 28-day proxy forecast can use
daily KC/wholesale/Coupang events; monthly HSK outcomes are evaluated on their
own monthly or 56-day horizon and availability schedule.

#### 5.5.6 Decision integration and shadow promotion

The intended diffusion chain is:

~~~mermaid
flowchart LR
    C["Chinese factory/market first-seen"] --> X["Independent supply confirmation"]
    X --> K["Korea inflow proxy or own exact import"]
    K --> W["Korean wholesaler adoption"]
    W --> P["Coupang propagation and demand validation"]
    P --> I["KidItem fit and test order"]
    I --> O["Own mature revenue, profit, returns, and inventory"]
    O --> L["KidItem-specific learning"]
~~~

Rules:

- a China supply or Korea-inflow signal alone can only create or maintain hold;
- exact KidItem procurement/import evidence improves supplier and landed-cost
  truth but is not consumer demand;
- public HSK movement and a KC certificate never satisfy the canonical Coupang
  demand requirement;
- high import momentum may mean opportunity or approaching crowding, so its
  effect is learned jointly with retail propagation and price compression;
- missing inflow evidence is unknown, not proof of no Korean entry;
- every new panel stays decisionImpact=disabled for at least 30 KST business
  days, then needs walk-forward incremental lift, calibration, coverage,
  lineage-duplication, legal/permission, and downside review;
- a paid shipment source also needs sourceCoverage, legalBasis,
  missingnessAudit, permittedFields, retentionPolicy, and a kill switch before
  even shadow collection.

## 6. Coupang Market Twin

The Market Twin represents what KidItem can legitimately observe about Coupang.
It must keep external proxy demand and internal actual sales in separate
targets.

### 6.1 Concept-day feature cube

Build a point-in-time feature row for every matched concept:

- organic SERP presence and rank trajectory by keyword;
- sponsored density and rank;
- review count, review velocity, rating, and low-review momentum;
- provider-returned Wing 28-day PV/sales/revenue/conversion for explicitly
  tracked products when persisted, with its coverage flag;
- price median, dispersion, discount churn, and pack-normalized price;
- seller/listing count and new-listing velocity;
- Rocket/fulfillment signal when observable;
- top-listing review moat and price compression;
- Naver/SNS/1688 lead features known at the cutoff;
- identity-match probability and evidence quality;
- collection coverage and missingness masks.

Missing data remains missing with an explicit mask. It is not converted to zero.

### 6.2 Two different predictions

**External market-demand prediction**

~~~text
P(proxy demand validates within 7d | evidence at t0)
P(proxy demand validates within 14d | evidence at t0)
P(proxy demand validates within 28d | evidence at t0)
reactionIndex P10 / P50 / P90
competitionGap
~~~

The validation label is a documented composite of future rank persistence,
review velocity, low-review strength, listing breadth, and other persisted
signals. It must always be named proxy demand. Provider-returned Wing metrics
are observed facts for the specifically tracked product and period, but their
selective coverage does not make exact competitor sales available for the rest
of the marketplace; missing Wing coverage must never be imputed as observed
sales.

**KidItem entrant-fit prediction**

~~~text
P(KidItem 28d success | concept, proposed launch strategy)
P(KidItem 56d success | concept, proposed launch strategy)
expected units P10 / P50 / P90
expected contribution profit P10 / P50 / P90
~~~

Launch-strategy features include price, delivery promise, initial quantity,
thumbnail/content quality, ad budget, review disadvantage, and catalog fit.
Only actual KidItem orders, cancellations, returns, ad spend, inventory, and
contribution profit train this second target.

Because new-product sales are sparse and often zero, the first entrant model
should use two heads: probability of any sale, then conditional unit/profit
quantiles when a sale occurs. Launch delay, out-of-stock time, price, ads, and
content quality remain explicit execution covariates so operational failure is
not mislabeled as weak product demand. A distribution-shift score marks
categories or launch strategies outside training support.

This split prevents a common error: a hot market can be unattractive to a weak
new entrant, while a moderate market with a clear competition gap can be an
excellent test.

#### 6.2.1 KidItem personalization strategy

“Personalized” means conditional on KidItem's historical execution and current
constraints; it does not mean fitting a high-variance model on too few own
orders. Use a hierarchical architecture:

~~~text
shared concept/category/season market representation
+ category and launch-strategy prior
+ KidItem calibration/residual head
+ current organization state and portfolio constraints
= KidItem-specific outcome distribution
~~~

The organization head learns only from matured KidItem outcomes and receives
shrinkage toward the shared/category prior when sample support is weak. Its
feature contract includes:

- past category, price-band, supplier, and launch-strategy performance;
- current inventory exposure, cash budget, storage and launch capacity;
- supplier lead-time/defect performance specifically experienced by KidItem;
- price, coupon, fulfillment, thumbnail/content readiness, ad budget, and
  review disadvantage proposed for this launch;
- in-stock eligible days, launch delay, and stockout periods;
- evidence support and distance from historical KidItem launches.

Cold-start concepts retrieve historically similar ProductConcepts using only
features available at decisionAt. Their uncertainty remains wide. No separate
organization-only model is deployed until a minimum sample and calibration
gate is met; missing deployment is an explicit error rather than a silent
generic fallback.

The prediction is a hurdle distribution:

~~~text
P(any paid unit by horizon)
× conditional units/revenue/profit quantiles when a sale occurs
× inventory-availability and launch-execution exposure
~~~

This separates a true zero-demand outcome from no opportunity to sell because
the product arrived late, was never listed, was suppressed, or was out of
stock. Recommendation explanations identify market evidence, KidItem-fit
adjustments, controllable launch assumptions, and remaining uncertainty
separately.

### 6.3 Validation episode

Create one immutable episode when a concept first becomes decision-eligible:

~~~text
t0: evidence cutoff and prediction
t+3: early reaction check
t+7: first validation target
t+14: primary market validation target
t+28: delayed validation target
t+56: KidItem commercial target when listed
~~~

Do not create a new “first” episode every day. Later daily scores belong to the
same episode or to an explicitly versioned re-entry episode after a cooldown.

### 6.4 Forecast evaluation

- log loss and Brier score;
- PR-AUC;
- calibration by probability bucket;
- pinball loss and interval coverage for P10/P50/P90;
- Precision@K under actual operator capacity;
- performance by horizon and category;
- feature and label availability lag;
- false-positive capital at risk.

Use expanding-window or rolling walk-forward validation. All observations,
features, and labels must respect their historical availability time.

## 7. Supply, economics, and risk engine

Market demand becomes actionable only after an exact source offer and economic
range are known.

### 7.1 Versioned supplier offer

Persist terms by offer variant and capture time:

- supplier identity and verification status;
- variant/SKU, dimensions, weight, material, and pack count;
- price tiers and MOQ;
- sample availability;
- production and dispatch lead time;
- domestic China freight;
- exchange rate source and timestamp;
- international freight assumption;
- duty, VAT, inspection, packaging, labeling, and platform fees;
- defect/claim evidence;
- KC/safety evidence and expiry;
- IP/licensing review status.

Supply owns the operational SupplierOffer/SupplierOfferSku, procurement intent,
PO, shipment, receipt, and cost-allocation truth. Sourcing stores the evidence
reference and immutable decision-time snapshot; it does not duplicate or
mutate Supply's canonical records.

For a genuinely new product, a Sellpia inventory SKU does not exist yet.
Therefore the test-order flow must anchor the pre-order line to a versioned
SupplierOfferSku or a Supply-owned ProcurementTestIntent, provision or attach
the inventory identity later, and then materialize the PO. Requiring an
existing active Sellpia SKU before a test procurement would structurally
exclude the very new products this system is designed to test.

### 7.2 Probabilistic unit economics

Replace one rough landed-cost number with:

~~~text
landedCostKrw P10 / P50 / P90
contributionMarginRate P10 / P50 / P90
breakEvenUnits
cashConversionDays
capitalAtRisk
markdownLoss P90
returnLoss P90
~~~

The first version may use deterministic scenario bands with explicit
assumptions. Monte Carlo simulation is useful only after the inputs have
empirical distributions. Unknown required costs block test_order; they do not
become optimistic defaults.

After arrival, reconcile estimates with a realized inbound cost layer:

~~~text
supplier offer variant
-> procurement test intent
-> PO line
-> shipment / B/L or AWB
-> customs declaration line
-> inbound receipt and defect quantity
-> landed-cost allocation
-> inventory lot
-> Coupang listing option
-> order line / cancellation / return / settlement
~~~

Realized landed unit cost allocates timestamped FX, China domestic freight,
international freight, insurance, duty, non-recoverable tax, brokerage,
inspection/KC, labeling/repack, shortage, and defect loss using a versioned
allocation method. Recoverable VAT remains visible but is not silently treated
as permanent unit cost. Historical outcome labels bind to the cost layer known
for that lot/order cohort and are revised explicitly; they never use today's
mutable purchase price as if it were the historical cost.

### 7.3 Hard gates

No model or optimizer can override:

- blocked IP/licensing or counterfeit risk;
- missing required KC/safety evidence;
- prohibited category or age/material combination;
- supplier identity failure;
- negative downside contribution margin;
- budget, MOQ, or storage infeasibility;
- missing cross-market identity above the approved threshold.

## 8. Decision confidence is a vector

The current system should stop using one “confidence” derived from the number
of present evidence groups.

Store these values separately:

| Value | Meaning |
|---|---|
| matchConfidence | Probability that market and supplier entities have the stated graph relation |
| evidenceCoverage | Required evidence fields and families present |
| dataFreshness | Age/collection-health assessment |
| demandProbability | Calibrated future market-validation probability |
| entrantFitProbability | Calibrated KidItem outcome probability |
| economicsConfidence | Completeness and uncertainty of cost/margin inputs |
| riskStatus | passed, blocked, or unknown by risk family |
| distributionShift | Distance from categories, concepts, and launch strategies represented in training |
| policyConfidence | Stability of the selected action under input uncertainty |

The public decisionConfidence is a policy-derived summary for the decision
packet, not an arithmetic average. A recommended initial rule is:

~~~text
decisionConfidence =
  calibrated policy probability
  capped by the weakest mandatory gate confidence
~~~

This keeps a strong demand forecast from hiding an uncertain product match or
unknown landed cost.

## 9. Portfolio optimizer

The optimizer selects a slate, not isolated winners.

For candidate i and quantity q:

~~~text
expectedUtility(i, q)
  = expectedContributionProfit
  - downsideRiskPenalty
  - capitalCost
  - inventoryCongestionCost
  + boundedLearningValue
~~~

The portfolio objective is:

~~~text
maximize sum(expectedUtility)
subject to:
  total cash budget
  MOQ and integer pack quantities
  maximum category exposure
  maximum supplier exposure
  maximum correlated-concept exposure
  storage and handling capacity
  compliance eligibility
  downside-loss budget
  operator test capacity
~~~

Use a deterministic integer optimization or knapsack formulation first. The
solver receives already gated candidates and returns selected candidates,
quantities, constraint reasons, and near-miss hold candidates. It never changes
evidence or model probabilities.

Output per candidate:

- decision: test_order, hold, or reject;
- quantity and cash commitment when selected;
- exploitation or exploration;
- binding constraints;
- expected value and downside range;
- counterfactual reason, such as “hold because supplier concentration is full”;
- complete model and evidence provenance.

For hold, also return a structured nextEvidenceAction without adding another
decision value:

- observe_until with date and required Coupang/SNS signal;
- verify_match with the conflicting attributes;
- request_quote with missing cost/MOQ fields;
- supplier_check with the unresolved supplier evidence.

The policy may estimate bounded value of information: expected decision
improvement from obtaining that evidence minus collection/review cost. This
turns hold into an executable follow-up rather than a middle score.

### 9.1 Operator recommendation packet

The user receives an evidence-backed business packet, not only a score:

| Block | Required content |
|---|---|
| Product | normalized concept/variant, images, source offer, exact-match evidence, supplier/factory role |
| Why now | Chinese supply novelty, SNS/search lead, Korean peer diffusion, and current trend phase with timestamps |
| Korea entry truth | exact/aggregate/inferred badge, HSK candidate and confidence, import momentum/KC evidence, and explicit unavailable fields |
| Coupang proof | matched listings/keywords, 3/7/14/28-day proxy state, competition gap, price/review/seller trajectory |
| Why KidItem | personalized adjustment versus market prior, similar own launches, category/supplier fit, current inventory/cash/capacity |
| Forecast | probability of any sale plus 28/56-day units, matured net revenue, contribution profit, sell-through, and residual-stock P10/P50/P90 |
| Economics/risk | MOQ, quantity, P10/P50/P90 landed cost and margin, maximum loss, cash days, KC/IP/supplier blockers |
| Backtest stamp | champion/model/policy version, as-of cutoff, comparable episode count, support/shift, calibration, Precision@K/NDCG, profit per capital, downside, censoring |
| Action plan | test_order/hold/reject, quantity, price/content/ad/fulfillment assumptions, evidence follow-up, stop/reorder criteria |

The packet separates observed fact, model inference, policy decision, and
operator assumption visually and in the API contract. It never says “will
sell.” It says, for example, that under a recorded launch plan the calibrated
56-day outcome lies in a stated range, shows how the model performed on
historically comparable point-in-time cohorts, and identifies what could make
the forecast fail.

## 10. Learning and reinforcement architecture

### 10.1 The learning unit

One decision event includes:

- organization and decisionAt;
- full eligible candidate slate;
- point-in-time feature references;
- hard-gate results;
- every candidate score and uncertainty;
- champion/challenger model versions;
- selected action and quantity;
- action propensity;
- exploration budget and reason;
- operator approval/override and reason;
- later outcomes at fixed horizons.

Logging only the chosen product makes counterfactual evaluation impossible.

### 10.2 Reward vector

Do not collapse business outcomes too early. Store:

- operatorAccepted and override reason;
- testOrderPlaced and lead time;
- listedWithinTarget;
- gross units and revenue at 7/14/28/56 days;
- cancellation and return rates;
- ad spend and contribution profit;
- sell-through and days of inventory;
- stockout loss estimate;
- markdown or disposal loss;
- compliance, IP, quality, or supplier incident;
- capital days;
- outcome maturity and censoring reason.

A versioned policy may derive scalar utility from this vector. Historical raw
outcomes remain unchanged when reward weights change.

The primary business north star is **56-day risk-adjusted realized contribution
profit per KRW of test capital**. Acceptance rate and recommendation clicks are
diagnostics, not the final reward.

Report **56-day matured sourced net revenue** as the top-line growth metric:
paid revenue minus cancellations, refunds, and matured returns for cohorts
originated by this sourcing policy. The optimizer must not maximize revenue
alone because that would favor low-margin, high-return, or inventory-heavy
products; revenue growth is pursued subject to contribution-margin, downside,
return, cash-conversion, and compliance constraints.

### 10.3 Staged learning path

**Stage 0 — deterministic policy**

Use hard gates and current scoring while collecting complete slates and
outcomes.

**Stage 1 — supervised learning-to-rank**

Train a LambdaMART-style ranker by organization intent/day group. Optimize
NDCG@K and verify realized value on time-held-out episodes. Add a separately
calibrated outcome model; ranking scores are not probabilities.

**Stage 2 — shadow challenger and offline policy evaluation**

Run challengers with zero decision impact. Compare direct-method, clipped IPS,
and doubly robust estimates only when logged propensities are valid.

**Stage 3 — constrained contextual bandit**

Explore only among hard-gate-passing candidates and only within an explicit
daily/weekly exploration budget. Log exact propensities. Never update the
production model directly from one online outcome.

**Stage 4 — quantity and reorder policies**

Optimize initial order quantity and reorder after enough own-sales histories
exist. Keep candidate selection, initial quantity, and reorder as separate
policies with separate rewards and safety constraints.

End-to-end PPO over browsing, recommendation, order quantity, and reorder is
out of scope. The sparse, delayed, confounded reward does not justify it.

### 10.4 Point-in-time backtesting contract

Backtest one organizationId × ProductConcept × decisionAt episode with the
exact evidence, model deployment, feasible actions, budget, inventory, and
operating capacity available at that time. Use rolling-origin evaluation with:

- eventAt/observedAt/availableAt/revisionAt semantics;
- training cutoff before every evaluation episode;
- concept-group split so variants cannot cross train and test;
- a time embargo around related launches and repeated concepts;
- actor/supplier holdout for robustness to new Chinese factories and peers;
- actual historical portfolio constraints, not unlimited top-K selection;
- label maturity and explicit right censoring.

Backtesting has three truth levels:

| Level | What it can answer | Required limitation |
|---|---|---|
| Historical replay | What the candidate model would have ranked using facts available then | Predictive comparison only; no claim that changing the choice caused more KidItem revenue |
| Chosen-product outcome backtest | How well it predicted matured KidItem revenue, profit, returns, and sell-through for products KidItem actually launched | Historical winner-selection bias remains because unchosen products lack KidItem outcomes |
| Policy evaluation | Expected value of a changed decision policy using logged action propensities | Valid only after exact propensities, overlap, and effective-sample-size gates exist |

Continue observing unselected concepts on Coupang to evaluate the market-demand
model, but never relabel that external proxy as counterfactual KidItem sales.
A hold/reject candidate that was never stocked and listed has an unobserved own
outcome, not a zero-sale label. Historical deterministic decisions with no
recorded propensity may train supervised outcome/ranking baselines; invented
post-hoc propensities cannot justify IPS or reinforcement learning.

The backtest report includes:

~~~text
market Precision@K and NDCG@K
entrant-fit Brier/log loss and calibration slope/intercept
revenue/profit quantile interval coverage and pinball loss
56d matured sourced net revenue
56d risk-adjusted contribution profit per test capital
sell-through, inventory days, return/defect rate, cash-conversion days
P10 downside / CVaR and false-positive capital
coverage, censoring, overlap, and effective sample size
performance by category, season, China source panel, supplier, and evidence granularity
~~~

Every report compares the champion, deterministic heuristic-v1, ablations
without China/inflow/peer signals, and the challenger on identical episodes.
This proves whether the added Chinese panels improve future Korean/Coupang and
KidItem outcomes rather than merely adding more data.

### 10.5 Prospective test-order experiment

Because past unlaunched products have no KidItem counterfactual, revenue lift
ultimately needs prospective exploration. Exploration happens only inside the
safe eligible set after identity, canonical Coupang × 1688 evidence,
economics, KC/IP/safety, supplier, MOQ, and maximum-loss gates pass.

Within that set:

1. stratify by category, price band, trend phase, supplier risk, and predicted
   value;
2. randomize or probabilistically select a small champion/challenger subset
   within a capped exploration budget;
3. log the complete candidate slate, feasible actions, exact propensity,
   expected loss, assigned quantity, and operator override before execution;
4. freeze or record launch price, coupon, content/thumbnail treatment, ad
   budget, fulfillment, initial stock, and concurrent concept launches;
5. start commercial exposure at the first sellable, visible, in-stock time—not
   recommendation or PO time;
6. mature 7/14/28/56-day outcomes and optionally 90-day residual inventory;
7. distinguish demand zero, late arrival, never listed, suppressed listing,
   and stockout censoring.

Safety-blocked reject candidates are never randomized. The system may randomize
test_order versus hold only when both are ethically and operationally feasible;
operator approval remains authoritative and is recorded as an executed action
different from the proposed action.

### 10.6 Promotion and stop rules

A challenger is promoted only when all applicable conditions hold:

- time-held-out calibration and interval coverage meet segment gates;
- incremental 56-day matured net revenue is positive under the approved
  margin/risk constraints;
- the lower confidence bound of risk-adjusted contribution profit per test
  capital beats the champion;
- return, defect, compliance, cash-conversion, and inventory-tail risk do not
  regress beyond approved tolerances;
- China/inflow features add walk-forward value after source-lineage dedupe;
- for OPE, action overlap and effective sample size are adequate and clipped
  IPS, direct method, and doubly robust estimates are not materially
  contradictory;
- a bounded prospective experiment confirms the result before broad rollout.

Automatic stops disable challenger decision impact on calibration drift,
source permission expiry, stale critical evidence, propensity logging failure,
loss-budget breach, safety/compliance incident, or realized downside breach.
Promotion and rollback change explicit immutable deployment pointers; an
online outcome never edits champion weights directly.

## 11. Durable data spine

These are proposed Sourcing-owned logical records. Exact Prisma migrations are
a later implementation plan. String fields plus DTO/Zod/domain validation must
be used instead of PostgreSQL native enums.

| Record | Purpose | Important identity |
|---|---|---|
| SourcingEvidenceObservation | Append-only point-in-time source fact | organizationId + source + sourceEntityId + observedAt + payload hash |
| SourcingProductConcept | Platform-neutral concept | organizationId + conceptId |
| SourcingProductEntity | Source listing/creative/keyword/offer node | organizationId + platform + externalId |
| SourcingConceptRelation | Versioned graph edge and review | organizationId + from + to + relation + validFrom |
| SourcingMatchCandidate | Top-K relation candidates and component scores used for review/training | organizationId + resolverRunId + source entity + candidate concept |
| SourcingMarketActor | Marketplace seller, wholesaler/importer, supplier, or factory identity with actorRole | organizationId + platform + externalActorId |
| SourcingCatalogTarget | Organization-scoped actor URL/feed, mode, cadence, watermark, and collection eligibility | organizationId + actorId + targetId |
| SourcingEvidenceIngestionRun | Collector version, cutoff, coverage, accepted/rejected counts, error, and idempotency | organizationId + targetId + runId |
| SourcingPeerCatalogObservation | Append-only peer listing, rank, badge, stock, price, MOQ, and coverage | organizationId + actorId + external listing + observedAt |
| SourcingPeerAdoptionEpisode | Interval-censored first appearance, persistence, and restock horizons | organizationId + actorId + conceptId + episodeId |
| SourcingPeerSourceLineage | Versioned same-feed/ownership/mirroring relation | organizationId + actor pair + validFrom |
| SourcingPeerSignalSnapshot | Point-in-time adoption, propagation, saturation, and confidence vector | organizationId + conceptId + asOf + modelVersion |
| SourcingChinaSupplyObservation | Permitted Chinese catalog, booth, factory, fair, RFQ, rank, or cluster-regime fact with provider semantics | organizationId + source + actor/entity + observedAt |
| SourcingTradeClassificationCandidate | Versioned ProductConcept-to-HSK candidate distribution and verification reference | organizationId + conceptId + classificationVersion + hsk10 |
| SourcingKoreaImportAggregateObservation | Revision-aware China-origin HSK import weight/value aggregate | organizationId + hsk + country + period + revision |
| SourcingProductCertificationEvidence | Matched certificate/model/manufacturer/holder/status evidence and concept-match confidence | organizationId + certificate source + certificate/model + observedAt |
| SourcingInflowSignalSnapshot | Point-in-time China supply and Korea inflow vector with evidence type/granularity | organizationId + conceptId + asOf + modelVersion |
| SourcingConceptDailyFeature | Point-in-time concept feature snapshot | organizationId + conceptId + businessDate + featureSetVersion |
| SourcingValidationEpisode | One t0 and fixed future horizons | organizationId + conceptId + episodeId |
| SourcingSupplierOfferSnapshot | Immutable decision-time projection/reference to Supply-owned variant/MOQ/price/economics evidence | organizationId + offerId + variantKey + capturedAt |
| SourcingModelVersion | Artifact, schema, training cutoff, evaluation | model family + semantic version |
| SourcingModelDeployment | Explicit champion/challenger assignment | organization/segment + model family + effective time |
| SourcingPolicyDecision | Request context, slate, budget, policy | organizationId + decisionId |
| SourcingPolicyDecisionItem | Candidate score, action, propensity, reason | decisionId + conceptId |
| SourcingOperatorFeedback | Append-only match correction, approval, override, and reason | organizationId + decision/episode + feedback event |
| SourcingTestOrderExperiment | Approval, quantity, procurement/listing links | organizationId + experimentId |
| SourcingTraceLink | ProductConcept and decision to supplier offer, procurement, shipment/lot, listing/option, and order-cohort references | organizationId + experimentId + trace version |
| SourcingOutcomeSnapshot | Horizon-specific matured revenue/profit/inventory outcome with censoring and data versions | organizationId + experimentId + horizon + asOf |

Do not overload SourcingCandidate.status. It remains the sourcing inbox
lifecycle. Validation, policy, experiment, and outcome state belong to their
own records.

Canonical execution truth remains in its owner domain and is exposed to
Sourcing through organization-scoped read ports:

| Owner | Required operational record/capability | Reason |
|---|---|---|
| Supply | SupplierOffer/SupplierOfferSku and versioned quote | exact pre-inventory product and commercial identity |
| Supply | ProcurementTestIntent, PO item, InboundShipment, receipt/defect event | allow a real new-product test before a Sellpia SKU exists and trace what arrived |
| Supply/Finance boundary | InboundCostAllocation with method/version | reconcile predicted and realized landed cost by lot |
| Compliance-owning boundary | ComplianceAssessment with HSK/KC/IP requirement, evidence, status, and expiry | one auditable hard-gate result rather than title-token inference |
| Channels/Orders/Advertising/Finance | CommerceOutcome read projection | listing exposure, units, paid revenue, cancellation/refund/return, ads, settlement, and contribution facts |

Sourcing does not join these domains' Prisma tables directly and Python does
not write them. The owner modules export purpose-built read ports; Sourcing
persists only immutable references and derived outcome snapshots.

### 11.1 State machine

~~~mermaid
stateDiagram-v2
    [*] --> Detected
    Detected --> ConceptResolved
    ConceptResolved --> MatchAmbiguous
    MatchAmbiguous --> ConceptResolved: operator confirmation
    ConceptResolved --> ChinaSupplyObserved
    ChinaSupplyObserved --> TradeClassified
    TradeClassified --> CompliancePrechecked
    CompliancePrechecked --> KoreaInflowObserved: exact or proxy evidence available
    CompliancePrechecked --> CoupangMatched: inflow unknown
    KoreaInflowObserved --> CoupangMatched
    CoupangMatched --> Observing3d
    Observing3d --> Validated7d
    Observing3d --> DemandRejected
    Validated7d --> Validated14d
    Validated7d --> DemandRejected
    Validated14d --> SupplyVerified
    SupplyVerified --> PortfolioSelected
    PortfolioSelected --> TestOrderApproved
    PortfolioSelected --> Held
    TestOrderApproved --> ProcurementIntentCreated
    ProcurementIntentCreated --> POPlaced
    POPlaced --> InTransit
    InTransit --> CustomsCleared
    CustomsCleared --> WarehouseReceived
    WarehouseReceived --> Listed
    Listed --> OutcomeMatured28d
    OutcomeMatured28d --> OutcomeMatured56d
    DemandRejected --> [*]
    Held --> [*]
    OutcomeMatured56d --> [*]
~~~

These are episode states, not values in SourcingCandidate.status and not extra
decision values.

## 12. Runtime and ownership

### 12.1 NestJS Sourcing plane

NestJS remains the authoritative orchestrator and writer. It:

- loads organization-scoped evidence through repositories/ports;
- builds point-in-time input contracts;
- calls deterministic Python inference;
- applies hard gates;
- invokes the portfolio solver;
- persists decision and outcome ledgers;
- creates the recommendation packet;
- exposes capabilities to Agent OS.

Suggested deterministic capabilities:

- sourcing.resolve_product_concepts;
- sourcing.detect_lead_signals;
- coupang.read_competitor_catalog_deltas;
- wholesale.collect_catalog_delta;
- china_wholesale.collect_authorized_catalog_delta;
- sourcing.project_china_supply_observations;
- trade.project_korea_import_aggregates;
- compliance.project_product_certification_evidence;
- sourcing.classify_trade_candidates;
- sourcing.evaluate_korea_inflow_state;
- sourcing.project_catalog_observations;
- sourcing.project_peer_adoption_events;
- sourcing.evaluate_peer_market_state;
- coupang.evaluate_concept_market;
- supplier1688.evaluate_offer_economics;
- supply.resolve_supplier_offer;
- supply.create_test_procurement_intent;
- supply.record_inbound_costs;
- sourcing.optimize_test_order_portfolio;
- sourcing.capture_decision_episode;
- sourcing.project_experiment_outcomes;
- sourcing.run_walk_forward_backtest;
- sourcing.build_training_dataset;
- sourcing.evaluate_model_candidate;
- sourcing.deploy_model_version.

Existing coupang.match_products and supplier1688.match_products remain useful
evidence-acquisition boundaries. V2 concept resolution composes their outputs
instead of replacing provider-specific collection.

Advertising owns the current Coupang competitor-catalog raw truth and exposes
it through the first read capability. Sourcing must not read Advertising
Prisma tables directly. Peer collection capabilities are source adapters with
explicit collection policy and effects. A replay/evaluation capability is
read-only; a fresh API, feed, browser, or database collection declares external
I/O and canonical write effects and is never disguised as replay.

Supply exports an organization-scoped procurement/import outcome read port.
Channels, Orders, Advertising, Inventory, and Finance compose a commerce
outcome read projection at their ownership boundaries. Sourcing receives DTOs
with as-of and revision versions, never direct cross-domain Prisma access.

### 12.2 Python ML plane

The existing agents/ service owns optional ML-heavy compute:

- image and multilingual text embedding;
- Faiss index build/query;
- pairwise reranking;
- gradient-boosted training and inference;
- calibration;
- offline evaluation;
- model artifact loading.

NestJS sends an explicit, versioned request and receives a validated result.
Python does not write canonical Sourcing, Channel, Order, Finance, Inventory, or
Supply records directly. Training jobs may read an exported point-in-time
dataset rather than joining production tables independently.

### 12.3 Automation and Agent OS

- Automation schedules deterministic collection, projection, dataset build,
  training, evaluation, and monitoring. These jobs do not create Agent OS runs.
- Agent OS is entered only when LLM judgment, tool orchestration, explanation,
  operator approval, or exception handling is needed.
- Agent OS owns LLM model identity, tool policy, approvals, cost, and run audit.
- Sourcing owns ranking models, reward semantics, policy deployment, decisions,
  trace links, and derived horizon outcome snapshots; Channels, Orders,
  Finance, Supply, and Inventory retain canonical operating facts.

### 12.4 Pragmatic physical deployment

Start with:

- current Postgres for observations, graph metadata, decisions, and outcomes;
- object storage only for raw media and immutable model artifacts when needed;
- one batch/worker path in NestJS;
- one Python ML process/package;
- an on-disk or artifact-backed Faiss index;
- explicit model manifests and deployment rows.

Do not introduce Kafka, a separate online feature-store cluster, a graph
database, or a vector-database service before throughput and latency evidence
requires them. The logical contracts allow those implementations later.

### 12.5 Current-system bridge

V2 is an insertion into the existing sourcing flow, not a rewrite of every
collector and operator surface.

| Existing anchor | Keep and reuse | Required V2 seam |
|---|---|---|
| prisma/models/sourcing.prisma daily Naver, 1688, Shorts, live-commerce, and TikTok snapshots | Persisted source-specific evidence | Project append-only observations and concept-day features without deleting daily snapshots |
| SourcingCandidate and CandidateImage | Operator inbox and selected source-product media | Link to ProductConcept; do not add policy/experiment states to status |
| prisma/models/channels.prisma CoupangKeywordSerpDailySnapshot | Full SERP order, ads, price, rating, and review evidence | Organization-scoped Market Twin read port |
| Advertising competitor_seller_catalog ingestion and competitor-tracking.ts | Newest-first Coupang seller catalogs, coverage/truncation, firstSeenAt, and isNew already exist | Advertising-owned read port that exposes seller catalog deltas to Sourcing without direct Prisma access |
| competitor-seller-watchlist.ts | Seed examples for downstream retail actors | Replace the process-wide hardcoded list with organization-scoped SourcingCatalogTarget records |
| 1688 keyword/image search and supplier detail extractors | Offer, supplier/store URL, price, MOQ, shipment, attribute, SKU, and pack primitives | New supplier-store catalog delta adapter; bulk market observations must not create SourcingCandidate inbox rows |
| CoupangWingTrackedProductDailySnapshot | Selectively tracked provider-returned 28-day PV/sales/revenue/conversion | Coverage-aware read port; never infer missing tracked coverage |
| sourcing-market-model.ts, sourcing-rising-product-model.ts, and sourcing-1688-new-product-model.ts | Reproducible heuristic-v1 baseline and initial safety comparison | Register as explicit baseline versions; learned outputs do not silently replace them |
| sourcing-discovery-capability.adapter.ts | Agent OS capability surface and audit integration | Each stage consumes an immutable prior artifact/decision ID instead of rerunning the complete discovery calculation |
| ChannelListing.sourceCandidateId through order lines | Attribution bridge from sourced candidate to real KidItem sales | Outcome projection through domain-owned read ports |
| Supplier, SupplierProduct, PurchaseOrder, and PurchaseOrderItem | Existing supplier/order identity, CNY unit price, quantity, external 1688 order reference, tracking, and receipt fields | Supply-owned SupplierOfferSku and ProcurementTestIntent before inventory SKU; shipment, declaration, cost-allocation, lot, and defect event trace |
| ProductVariantComponent/SellpiaInventorySku linkage to listing options and PO items | A common inventory SKU can bridge procurement and channel sales | Add lot/cohort allocation and historical realized landed cost; do not use current mutable purchasePrice as historical COGS |
| Orders, returns, channel daily facts, ads, and Sellpia monthly product facts | Actual KidItem commercial labels where attribution and maturity are known | Owner-exported as-of commerce outcome read projection with cancellations/refunds, in-stock exposure, censoring, and data versions |
| Agent OS runs, tool invocations, artifacts, and approvals | Execution, tool, cost, and approval audit | Keep business decision/reward truth in Sourcing |

Several current values and paths must not be treated as complete training or
execution truth:

1. SourcingWorkspaceSnapshot is an organization/scope/business-date cache whose
   payload can be upserted. It is not an immutable evidence or decision ledger.
2. Current salesLast3d can be estimated from a 28-day value. Current
   threeDayValidation is therefore a heuristic feature, not a matured
   observation cohort. V2 creates a real t0 episode and waits for D+3.
3. The current competitor seller catalog is nested inside the latest
   keyword/day SERP JSON and same-day merges do not preserve every intraday
   delta. It is a compatibility projection, not the append-only V2 peer ledger.
4. The current 1688 hot-product snapshot is keyword search ranked by observed
   sales, not a supplier-store newest-first catalog. The workspace scope named
   1688_new_products is not sufficient proof of an official 1688 new-product
   feed.
5. PurchaseOrderItem currently requires an active SellpiaInventorySku. A real
   new product has no such SKU, so recommendation-to-test-order needs the
   SupplierOfferSku/ProcurementTestIntent seam described above.
6. The current recommendation artifact and PO handoff do not share a complete
   executable contract: the artifact exposes priceCny but omits the required
   MOQ and pre-inventory identity, while the draft path expects unitPriceCny,
   MOQ, and Sellpia inventory identity. Do not claim end-to-end test ordering
   until one validated DTO and integration test cover this handoff.
7. The inspected landed-cost heuristic uses a fixed KRW/CNY assumption plus a
   fixed buffer and has no international freight, customs, duty/VAT,
   inspection, broker, actual KC, or realized allocation record. It is a
   baseline scenario, not a profit label.
8. Current live P&L can use today's recipe and Sellpia purchase price. Without
   lot-level historical cost and partial-refund maturity, it may revise the
   apparent margin after the decision and must not become immutable
   backtesting truth.
9. Historical AgentArtifact-to-request/tool/PO audit may bootstrap selected
   examples, but it lacks the full unselected slate, exact propensity, and
   frozen feature snapshot. Use it for supervised baseline reconstruction,
   never counterfactual policy evaluation.

Marketplace seller, wholesale supplier, and factory are distinct actorRole
values. Do not merge them merely because names or images overlap. Market-wide
catalog observations also do not belong in SupplierProduct, MasterProduct, or
SourcingCandidate: those records represent confirmed operating relationships,
owned catalog identity, and the operator inbox respectively.

The existing agents/src/agents/sourcing/matcher_1688.py performs autonomous
database polling and updates without the required organization predicate in
the inspected queries. It must not become the canonical V2 matcher. Reuse only
isolated embedding/parsing ideas after moving execution behind an explicit
organization-scoped NestJS contract; Python must not mutate canonical rows.

### 12.6 Migration sequence at the capability boundary

1. Freeze current deterministic results as versioned heuristic-v1 artifacts.
2. Add immutable observation, concept, decision, and full-slate IDs without
   changing the current operator result.
3. Add Supply's SupplierOfferSku/ProcurementTestIntent seam so a real new item
   can become a test PO before a Sellpia inventory SKU exists.
4. Add shipment, declaration, receipt/defect, cost-allocation, inventory-lot,
   listing, and order-cohort trace references; reconcile one historical test
   order end to end.
5. Make collection capabilities emit evidence artifact IDs.
6. Expose Advertising catalog deltas and owner-domain procurement/commerce
   outcomes through organization-scoped read ports.
7. Onboard KCS HSK aggregates and Safety Korea evidence as revision-aware
   shadow sources; add HSK candidate distribution and verified-classification
   flow.
8. Onboard one authorized Chinese broad-market source and one toy or stationery
   cluster/fair source with source semantics and lineage dedupe. Access
   challenges stop collection rather than being bypassed.
9. Add authorized Korean wholesale targets and ingestion runs.
10. Make concept resolution consume evidence IDs and emit a resolver run ID.
11. Make market, inflow, entrant-fit, and economics models consume an immutable
    resolver run and decisionAt context.
12. Make portfolio optimization persist the full eligible slate and exact
    propensity before Agent OS explanation or approval.
13. Materialize 7/14/28/56-day outcomes, run all new sources for at least 30
    KST business days in shadow, compare with heuristic-v1 and feature
    ablations, then promote each capability explicitly.

## 13. Model registry, promotion, and failure behavior

Every model artifact manifest contains:

- modelFamily and modelVersion;
- source commit;
- training dataset ID and cutoff;
- feature schema hash;
- label/reward version;
- training code and dependency digest;
- offline metrics by segment;
- calibration artifact;
- index/embedding version where relevant;
- artifact checksum and URI;
- approval status and approver;
- createdAt and effectiveAt.

Production selection is explicit. If the requested model deployment or feature
schema is missing or incompatible, the capability fails with an explicit
error. There is no model-or-default fallback.

Promotion sequence:

~~~text
trained -> offline_qualified -> shadow -> canary -> champion
                                      \-> rejected
~~~

Rollback changes the deployment pointer to an already qualified immutable
artifact and records the reason.

## 14. Monitoring and failure modes

### 14.1 Data and identity monitoring

- source collection success and stale-source age;
- field missingness and parser confidence;
- same-day revision rate;
- concept creation/merge/split rate;
- ambiguous-match review queue age;
- embedding/index coverage;
- match calibration drift;
- peer-source permission/terms review expiry and kill-switch status;
- catalog coverage/truncation and collector watermark age;
- false-new, false-stockout/restock, and lineage-duplicate rate;
- peer-source lead precision and reliability drift by category;
- Chinese panel permission, export/API entitlement, baseline completion, and
  cross-platform factory-lineage duplicate rate;
- KCS HSK revision lag, missing periods, classification entropy, and
  certificate-to-concept false-match review rate;
- evidence type/granularity distribution so aggregate signals cannot silently
  appear exact;
- PO-to-shipment-to-lot-to-listing trace completeness and cost-allocation
  reconciliation error.

### 14.2 Prediction and policy monitoring

- probability calibration by horizon;
- Precision@K and false discovery;
- interval coverage;
- category/source performance skew;
- feature drift and prediction drift;
- champion/challenger disagreement;
- test_order, hold, and reject rate;
- exploration spend and propensity validity;
- constraint-binding frequency;
- realized contribution profit and downside loss;
- matured sourced net revenue and capital-normalized lift;
- OPE overlap, weight distribution, and effective sample size;
- outcome censoring, in-stock exposure, and maturity backlog;
- compliance/supplier incident rate.

### 14.3 Critical failure modes

| Failure | Control |
|---|---|
| Visually similar but different products merged | relation classifier, hard attributes, calibrated review band |
| One viral creator creates a false trend | creator diversity, duplication detection, cross-platform gate |
| 1688 popularity mistaken for Korean demand | separate lead and Coupang validation models |
| Chinese listing, fair badge, RFQ, or popularity rank called an order | provider-semantic event types and supply-only shadow family |
| HSK aggregate reconstructed into competitor SKU orders | evidence granularity contract and prohibition on buyer/SKU/order claims |
| KC certificate treated as import or sales | entry-readiness/risk label only; require separate import and Coupang evidence |
| One factory syndicated across several Chinese panels looks independent | supplier/source-lineage clusters across company, address, image, model, and feed |
| Wrong HSK creates a false inflow spike | candidate distribution, entropy penalty, effective-version and human verification |
| External proxy called real sales | target naming and packet-level provenance |
| Old evidence leaks into a current score | freshness policy and cutoff-aware features |
| Future data leaks into training | availableAt cutoff and walk-forward split |
| Missing cost becomes optimistic zero | unknown economics blocks test_order |
| Current purchase price rewrites historical margin | immutable lot/cohort landed-cost allocation and explicit revisions |
| Unlaunched hold/reject becomes a zero-sale label | censoring/unobserved outcome semantics; use Coupang proxy only for market target |
| Historical chosen products make the policy look better | full-slate logs, prospective safe-set exploration, valid propensities and OPE gates |
| Ranker favors one supplier/category | portfolio concentration constraints |
| Exploration causes excessive loss | hard gates, bounded budget, downside cap |
| Operator overrides disappear | immutable override/reason and outcome linkage |
| Model silently changes | immutable artifact, deployment row, explicit model error |

## 15. Evaluation gates by capability

No single aggregate score approves the system.

| Capability | Offline gate | Online/shadow gate |
|---|---|---|
| Concept resolver | Recall@50, Precision@1, per-relation recall, calibration | false exact matches and review burden |
| Lead detector | Precision@K, PR-AUC, lead days, calibration | confirmed lead rate by source/category |
| Peer observatory | adoption/propagation PR-AUC, lead-lag error, lineage duplicate rate, ablation lift | source coverage, false-new/restock events, incremental Coupang/KidItem value |
| China supply/Korea inflow | supply-to-Korea/Coupang lead-lag, inflow Brier/calibration, HSK mapping review precision, source-lineage duplicate rate, ablation lift | permission/coverage, false-new events, aggregate-vs-exact integrity, incremental Coupang/KidItem value after 30 business days |
| Market Twin | Brier/log loss, PR-AUC, interval coverage | validation rate and false-positive capital |
| Entrant fit | time/concept-split calibration, hurdle-model log loss, revenue/profit/unit interval loss | 28/56-day own outcome calibration by KidItem support and launch strategy |
| Economics | reconciliation to realized landed cost | P50 error and P90 miss rate |
| Ranker | NDCG@K and realized utility replay | accepted recommendation and mature utility |
| Portfolio | backtested utility and matured net-revenue replay under actual constraints | sourced net revenue, contribution profit per capital, downside, concentration |
| Bandit | doubly robust lower confidence bound plus overlap/effective sample size | bounded prospective incremental value with valid propensities |

All metrics are segmented by category, evidence source, season, and data
coverage. A global average cannot hide an unsafe segment.

## 16. Delivery roadmap

### Phase A — truth and identity foundation

Deliver:

- evidence event-time/availability contract;
- append-only observation ledger and daily projection rules;
- Product Concept Graph records;
- annotation guide and hard-negative matching set;
- baseline identity benchmark.

Exit:

- historical decisions can be reconstructed without future data;
- exact/base/substitute relations are reviewable and versioned.

### Phase A2 — KidItem exact outcome and import trace

Deliver:

- SupplierOfferSku and ProcurementTestIntent for a pre-inventory new item;
- offer → PO → shipment → customs → receipt/defect → cost allocation → lot →
  listing → order/return/settlement references;
- organization-scoped Supply and commerce outcome read ports;
- historical as-of cost/revenue outcome semantics and maturity/censoring rules;
- one end-to-end reconciled historical and one new test-order trace.

Exit:

- a new item can reach a draft test PO without an existing Sellpia SKU;
- predicted landed cost reconciles to a versioned realized allocation;
- a mature outcome never uses today's mutable purchase price as historical
  cost;
- a recommendation can be traced to matured KidItem revenue and profit.

### Phase B — multimodal concept resolver

Deliver:

- image and multilingual text embeddings;
- top-K Faiss retrieval;
- supervised pair reranker and probability calibration;
- ambiguity review workflow;
- graph merge/split audit.

Exit:

- candidate recall and false exact-match rate meet the operator-approved
  benchmark on time/concept-held-out data.

### Phase B2 — peer sourcing observatory shadow

Deliver:

- organization-scoped CatalogTarget and EvidenceIngestionRun;
- read port for existing Advertising competitor-seller catalog deltas;
- one approved broad wholesale API/feed adapter and one permitted
  category-specialist input;
- actor roles and source-lineage independence clusters;
- first-seen, stockout/restock, rank, price, MOQ, and coverage events;
- peer signal vector with decisionImpact=disabled.

Exit:

- unauthorized/manual-only sources cannot be scheduled;
- initial inventory is not mislabeled as newly launched;
- mirrored feeds are measured rather than counted as independent adopters;
- at least 30 KST business days are available before promotion review.

### Phase B3 — China supply and Korea inflow shadow

Deliver:

- one approved Chinese broad-market source and one stationery/toy
  cluster/fair panel;
- cross-panel factory/trading-company/source-lineage identity;
- KCS China-origin HSK aggregate and Safety Korea evidence projections;
- ProductConcept-to-HSK candidate distribution and verified-classification
  workflow;
- exact/aggregate/inferred evidence type and granularity contract;
- China supply and Korea inflow vector with decisionImpact=disabled.

Exit:

- collection uses an approved API/feed/export/partnership and kill switch;
- initial catalog inventory is not labeled as a new launch;
- public aggregate/KC evidence cannot be rendered as competitor SKU orders;
- at least 30 KST business days support coverage, lead-lag, ablation, and
  permission review before any influence proposal.

### Phase C — lead-lag and Coupang Market Twin

Deliver:

- concept-day feature cube;
- 3/7/14/28-day validation episodes;
- source-specific lead features;
- calibrated demand predictions and uncertainty;
- walk-forward evaluation and shadow output.

Exit:

- at least 30 KST business days of persisted canonical evidence exist;
- predictions beat current deterministic baselines without calibration
  regression.

### Phase D — supplier economics and test portfolio

Deliver:

- exact offer/variant terms;
- pre-inventory test procurement identity and executable recommendation-to-PO
  DTO;
- P10/P50/P90 landed-cost and margin scenarios;
- realized inbound cost allocation and reconciliation;
- compliance/IP/supplier gates;
- budget/MOQ/concentration optimizer;
- decision packet with binding constraints.

Exit:

- no test_order is possible with unknown mandatory economics or risk;
- optimizer results reconcile to a deterministic replay.

### Phase E — decision and outcome learning ledger

Deliver:

- full-slate decision logging;
- operator override reasons;
- test order/listing attribution;
- 7/14/28/56-day outcome projection;
- point-in-time rolling backtest with heuristic and feature ablations;
- KidItem hierarchical/calibrated entrant-fit head;
- model/deployment registry;
- first learning-to-rank challenger.

Exit:

- every recommendation can be joined to its point-in-time inputs and mature
  outcome;
- the challenger runs in shadow with no silent fallback.

### Phase F — bounded reinforcement learning

Deliver:

- valid action propensities;
- offline policy evaluation;
- explicit exploration budget;
- contextual-bandit challenger;
- automatic stop and rollback controls.

Exit:

- sufficient mature and uncensored outcomes exist;
- the lower-confidence policy-value estimate beats champion and risk limits;
- exploration remains inside approved capital and category boundaries.

## 17. First implementation slice

The highest-leverage first slice is not online RL. Build these seven vertical
contracts together:

1. **Own truth spine**: SupplierOfferSku/ProcurementTestIntent plus PO,
   shipment, customs, lot, listing, order, return, settlement, and historical
   landed-cost trace.
2. **Concept spine**: ProductConcept, source entity, relation, and operator
   correction.
3. **Matcher benchmark**: image/text retrieval, top-K candidates, pair labels,
   and calibrated relation output.
4. **Validation episode**: immutable t0 plus 3/7/14/28-day Coupang proxy
   outcomes.
5. **Decision ledger**: full candidate slate, exact policy/model versions,
   decision, quantity, propensity, and override.
6. **China/inflow shadow bridge**: one authorized Chinese panel, KCS HSK
   aggregates, KC evidence, HSK candidate mapping, and zero decision impact.
7. **Peer shadow bridge**: existing Coupang competitor-catalog deltas plus one
   authorized wholesale API/feed projected into actor/entity/adoption
   observations with zero decision impact.

No production test_order is enabled until exact supplier economics and hard
risks are complete. This order creates the labels required by every more
advanced model and prevents an expensive RL system from learning from
ambiguous products, aggregate import proxies, and unverifiable outcomes.

## 18. Architecture acceptance criteria

The V2 architecture is implemented only when:

1. one product concept can link multiple 1688, SNS, keyword, and Coupang
   entities without treating substitutes as identical;
2. every feature is reproducible as of decisionAt;
3. market proxy demand and actual KidItem sales are named and trained
   separately;
4. every probability is calibrated and every forecast interval is evaluated;
5. unknown mandatory economics or risk cannot produce test_order;
6. the optimizer explains selected quantity and every binding constraint;
7. exactly one of test_order, hold, or reject is persisted per decision item;
8. the full eligible slate and action propensity are retained;
9. every model selection is explicit and reproducible;
10. Google Trends and LinkFox have zero decision impact until promoted;
11. peer-wholesaler evidence has zero decision impact until separately
    promoted and never replaces Coupang demand evidence;
12. mirrored wholesale feeds count as one independence cluster;
13. every scheduled peer source has an approved API/feed permission and kill
    switch;
14. Python ML compute cannot directly mutate canonical business records;
15. an operator can trace a recommendation from raw evidence to model outputs,
    policy gates, approval, supplier offer, PO, shipment/customs, lot, listing,
    order/return/settlement, and mature revenue/profit outcome;
16. a real new-product test procurement can be created without an existing
    Sellpia inventory SKU;
17. every Chinese/wholesale/trade source records provider semantics,
    permission, coverage, lineage, and a kill switch;
18. China-supply, public HSK, KC, and licensed-shipment signals have zero
    decision impact until separately promoted after at least 30 KST business
    days;
19. no public aggregate, certificate, rank, RFQ, listing, fair exhibit, or
    unknown B/L is presented as a competitor's SKU-level order;
20. an HSK model suggestion is versioned, probabilistic, and never submitted
    as the verified import classification automatically;
21. unlaunched candidates are not labeled as zero KidItem sales and historical
    missing propensities are not fabricated;
22. the challenger backtest is point-in-time, concept-grouped, constrained by
    the historical portfolio, and reported with calibration, downside,
    censoring, overlap, and source ablations;
23. model promotion requires a bounded prospective test and a positive lower
    confidence bound on business value without safety, return, inventory, or
    margin regression.

## 19. Deliberate non-goals

- claiming unavailable competitor unit sales as fact;
- claiming market-wide competitor China-to-Korea buyer/SKU/order quantity from
  public trade, KC, listing, or cargo-status data;
- guaranteeing that an untested recommendation will sell instead of returning
  a calibrated probability, range, downside, and test plan;
- treating Chinese source popularity, RFQ, fair exposure, or supplier badges as
  Korean consumer demand;
- choosing one model-suggested HSK and calling an aggregate change SKU inflow;
- labeling unselected/unlaunched candidates as KidItem failures;
- maximizing top-line revenue without margin, return, inventory, cash, and
  compliance constraints;
- training one end-to-end multimodal LLM to make all numeric decisions;
- using SourcingCandidate.status as the validation/experiment state machine;
- adding a graph database merely because the logical model is a graph;
- adding Kafka or a feature-store cluster before measured need;
- online self-updating production weights;
- allowing an LLM or optimizer to bypass compliance and economics gates;
- using Google Trends or LinkFox as positive decision evidence before review;
- starting PPO before full slates, propensities, and mature outcomes exist.

## 20. Reference implementation patterns

- [Sentence Transformers Retrieve and Re-rank](https://www.sbert.net/examples/sentence_transformer/applications/retrieve_rerank/README.html)
  for high-recall bi-encoder retrieval followed by a stronger pair reranker.
- [OpenCLIP](https://github.com/mlfoundations/open_clip) for an open
  image-text embedding implementation to benchmark, not a mandated production
  dependency.
- [Faiss](https://faiss.ai/) for efficient local dense-vector similarity
  search.
- [XGBoost Learning to Rank](https://xgboost.readthedocs.io/en/stable/tutorials/learning_to_rank.html)
  for grouped LambdaMART ranking and NDCG-oriented evaluation.
- [Vowpal Wabbit Contextual Bandits](https://vowpalwabbit.org/docs/vowpal_wabbit/python/latest/tutorials/python_Contextual_bandits_and_Vowpal_Wabbit.html)
  for action-dependent contextual-bandit logging and evaluation patterns.
- [Google OR-Tools CP-SAT](https://developers.google.com/optimization/cp/cp_solver)
  and [knapsack](https://developers.google.com/optimization/pack/knapsack) for
  constrained integer test-order portfolio selection.

These references inform model and solver patterns only. KidItem's evidence
contract, organization boundary, hard gates, and outcome semantics remain the
authoritative architecture.
