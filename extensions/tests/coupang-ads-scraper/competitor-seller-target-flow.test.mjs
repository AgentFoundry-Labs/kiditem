import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL(
    "../../coupang-ads-scraper/background/service-worker.js",
    import.meta.url,
  ),
  "utf8",
);

test("collects seller catalogs only after the server selects own-product overlaps", () => {
  const keywordSyncIndex = source.indexOf("postKeywordRankSync(capture)");
  const productTargetFetchIndex = source.indexOf(
    "fetchCoupangCompetitorProductTargets(",
    keywordSyncIndex,
  );
  const identitySyncIndex = source.indexOf(
    "postCompetitorSellerIdentitySync(sellerIdentities)",
    productTargetFetchIndex,
  );
  const targetFetchIndex = source.indexOf(
    "fetchCoupangCompetitorSellerTargets(",
    identitySyncIndex,
  );
  const catalogCollectIndex = source.indexOf(
    "collectCoupangSellerCatalogs(",
    targetFetchIndex,
  );

  assert.ok(keywordSyncIndex >= 0, "keyword SERP must be synced first");
  assert.ok(
    productTargetFetchIndex > keywordSyncIndex,
    "overlapping products must be selected before opening product details",
  );
  assert.ok(
    identitySyncIndex > productTargetFetchIndex,
    "only selected product details may resolve seller identities",
  );
  assert.ok(
    targetFetchIndex > identitySyncIndex,
    "seller targets must be fetched after selected identities are saved",
  );
  assert.ok(
    catalogCollectIndex > targetFetchIndex,
    "seller shops must be collected from the selected target list",
  );
  assert.match(
    source,
    /\/api\/ads\/competitors\/seller-targets\?days=30&limit=/,
  );
  assert.match(
    source,
    /\/api\/ads\/competitors\/product-detail-targets\?days=30&limit=/,
  );
  assert.match(source, /type:\s*"competitor_seller_identity"/);
  assert.match(source, /type:\s*"competitor_seller_catalog"/);
  assert.match(
    source,
    /resolveCoupangCompetitorSellerIdentities\(\s*tabId,\s*productTargets/,
    "seller identity collection must reuse the bounded Coupang tab",
  );
  assert.match(
    source,
    /updateTabAndWait\(tabId, target\.link/,
    "selected product detail pages must be rendered before seller extraction",
  );
  assert.match(source, /executeCoupangSellerDetailExtraction\(tabId\)/);
});
