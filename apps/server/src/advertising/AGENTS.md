Consult this document first instead of relying on memorized knowledge.

# advertising — Ad Operations

`src/advertising/` owns Coupang ad operations, scrape ingest, daily fact
projection, strategy/action generation, and ad-action execution. It works over
Sellpia `MasterProduct` cost evidence and the marketplace
`ChannelListing`/`ChannelListingOption` model, and is organization-scoped
throughout.

## Folder Map

```text
advertising/
├── adapter/in/http/          # /api/ads/* controllers and HTTP DTOs
├── adapter/out/
│   ├── automation/           # operation-alert adapter
│   └── repository/           # Prisma/raw-fact repository adapters
├── application/
│   ├── port/out/             # repository, transaction, operation-alert ports
│   └── service/              # Prisma-free orchestration + ingest handlers
├── domain/                   # pure rules, normalizers, metrics, policies
│   └── util/                 # ratio/date/key helpers
├── mapper/                   # row/DTO/domain mapping
└── services/                 # legacy facade only
```

## Owned Surfaces

- Coupang ad scrape ingest: `POST /api/ads/extension/sync`
- Ad dashboards and strategy/action APIs under `/api/ads/*`
- Ad action execution lifecycle for approved queued actions

## Main Data Models

- `ChannelScrapeRun` and `ChannelScrapeSnapshot` are raw audit/replay evidence.
- `ChannelListingDailySnapshot` and `ChannelListingOptionDailySnapshot` are
  listing/option daily facts.
- `ChannelAdTargetDailySnapshot` is the campaign/keyword/product target daily
  fact.
- `ChannelAccountDailyKpiSnapshot` is the account/store KPI fact.
- `AdAction` is the executable action record and is target-daily based.

## Ingest Flow

```text
Extension/Wing payload
  -> POST /api/ads/extension/sync
  -> AdSyncService.sync
  -> append ChannelScrapeRun/Snapshot
  -> upsert listing/option daily facts
  -> upsert ad-target daily facts
  -> upsert account KPI facts
  -> strategy/action services read fact projections
```

Listing match priority is `vendorItemId` to `ChannelListingOption`, then
`externalId` to `ChannelListing(platform='coupang')`, then unmatched raw
snapshot preservation.

## Cross-Domain Ports

- Operation-alert lifecycle writes go through advertising's local
  `operation-alert.port`, bound to automation's `OPERATION_ALERT_PORT`.
- Sellable-stock reads go through Channels' exported read-only
  `CHANNEL_SKU_AVAILABILITY_PORT`; Advertising never computes a second stock
  balance or reads stock fields from marketplace SKU metadata.
- Advertising intentionally reads/writes channel daily fact models because the
  scrape ingest path owns raw/fact projection traceability.
- Advertising must not inject concrete Channels services.

## Boundary Rules

- Application services are Prisma-free and depend on ports, not concrete
  adapters.
- `PrismaService` belongs under `adapter/out/repository/**`.
- `domain/` is free of NestJS, Prisma, HTTP DTOs, and incoming adapters.
- KST business date conversion goes through `toBusinessDate()`.
- Period views derive from daily facts; ratios recompute from summed raw
  values and do not trust provider ratios.
- `buildAdTargetKey()` is the only target-key builder and must fail if no
  stable identifier exists.
- Every service method receives and scopes by `organizationId`; no default
  organization lookup.

## Transitional Exceptions

- `services/channel-scrape-persistence.service.ts` is a grandfathered
  compatibility facade and must not receive new business logic.
- The channel fact ownership exception remains local to advertising ingest; do
  not expand it to direct channel service injection.
