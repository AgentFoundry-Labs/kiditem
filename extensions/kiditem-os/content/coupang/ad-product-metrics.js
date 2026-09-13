// KIDITEM OS — Coupang manual product_sales metrics capture.
//
// This module owns the verified product-grain request.  It deliberately does
// not know about source-owner transport or DOM navigation: ads-report.js
// supplies a frozen campaign/group/ad scope and a bounded metadata observation
// and receives an exact-day receipt-shaped result in return.

(function () {
  "use strict";

  const TABLE_TYPE = "product_sales";
  const REQUIRED_METRICS = [
    "deliveredAdCost",
    "adAttributedSales",
    "impressions",
    "clicks",
    "adAttributedUnits",
    "adAttributedOrders",
  ];
  function normalizeText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function parseBusinessDate(value) {
    const text = normalizeText(value);
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const date = new Date(Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
    ));
    return date.toISOString().slice(0, 10) === text ? text : null;
  }

  function kstMidnightEpoch(value) {
    const date = parseBusinessDate(value);
    if (!date) return null;
    const epoch = Date.parse(`${date}T00:00:00+09:00`);
    return Number.isFinite(epoch) ? epoch : null;
  }

  function fail(message, code = "AD_PRODUCT_METRICS_INVALID") {
    throw Object.assign(new Error(message), { code });
  }

  // Coupang's campaign, group, ad, and vendor-item identifiers are positive
  // decimal IDs.  Keep this boundary deliberately narrower than String(...):
  // coercing an object, boolean, exponent, hex literal, or a decimal with
  // leading zeroes can make a bad provider response look like a real target.
  function providerId(value, label) {
    if (typeof value === "number") {
      if (Number.isSafeInteger(value) && value > 0) return String(value);
      fail(`${label} must be a positive safe integer`, "AD_PRODUCT_METRICS_INVALID_ID");
    }
    if (typeof value === "string" && /^[1-9]\d*$/.test(value)) {
      const parsed = Number(value);
      if (Number.isSafeInteger(parsed) && String(parsed) === value) return value;
    }
    fail(`${label} must be a canonical decimal id`, "AD_PRODUCT_METRICS_INVALID_ID");
  }

  function providerCount(value, label) {
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
      return value;
    }
    fail(`${label} must be a non-negative safe integer`, "AD_PRODUCT_METRICS_INVALID_COUNT");
  }

  function finiteMetric(value, label) {
    if (typeof value === "number") {
      if (Number.isFinite(value) && value >= 0) return value;
      fail(`product_sales metric ${label} is not finite and non-negative`, "AD_PRODUCT_METRICS_INVALID_METRIC");
    }
    // The live response is numeric JSON, but accepting a canonical numeric
    // string keeps the boundary tolerant of provider serialization while
    // still rejecting null, empty, NaN, and arbitrary labels.
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value.trim());
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
    fail(`product_sales metric ${label} is missing or invalid`, "AD_PRODUCT_METRICS_INVALID_METRIC");
  }

  function ensureRequestJson(requestJson) {
    if (typeof requestJson !== "function") {
      fail("KidItemAdProductMetrics requires requestJson", "AD_PRODUCT_METRICS_REQUESTER_REQUIRED");
    }
    return requestJson;
  }

  function normalizeAd(ad, index) {
    if (!ad || typeof ad !== "object") fail(`manual ad ${index} is not an object`);
    const adId = providerId(ad.adId ?? ad.id, `manual ad ${index} adId`);
    const vendorItemId = providerId(ad.vendorItemId ?? ad.itemId, `manual ad ${index} vendorItemId`);
    return {
      ...ad,
      adId,
      vendorItemId,
      itemName: normalizeText(ad.itemName ?? ad.productName),
    };
  }

  function normalizedMetadata(metadata, campaignId, adGroupId) {
    if (!metadata || typeof metadata !== "object") fail("manual product metadata is required");
    const selection = normalizeText(metadata.adSelectionType).toUpperCase();
    if (selection !== "MANUAL_SELECTION") {
      fail("product_sales requires a proven MANUAL_SELECTION ad group", "AD_PRODUCT_METRICS_MANUAL_GROUP_REQUIRED");
    }
    const adsValue = Array.isArray(metadata.ads) ? metadata.ads : [];
    if (adsValue.length === 0) {
      fail("manual product group has no explicit ads", "AD_PRODUCT_METRICS_EXPECTED_ADS_REQUIRED");
    }
    const ads = adsValue.map(normalizeAd);
    const ids = new Set();
    const vendorIds = new Set();
    for (const ad of ads) {
      if (ids.has(ad.adId)) fail(`duplicate manual ad id ${ad.adId}`, "AD_PRODUCT_METRICS_DUPLICATE_AD");
      if (vendorIds.has(ad.vendorItemId)) fail(`duplicate manual vendor item ${ad.vendorItemId}`, "AD_PRODUCT_METRICS_DUPLICATE_AD");
      ids.add(ad.adId);
      vendorIds.add(ad.vendorItemId);
    }
    const normalizedCampaignId = providerId(
      campaignId ?? metadata.campaignId,
      "campaignId",
    );
    const normalizedAdGroupId = providerId(
      adGroupId ?? metadata.adGroupId,
      "adGroupId",
    );
    const expectedGroupIds = Array.isArray(metadata.expectedGroupIds)
      ? metadata.expectedGroupIds.map((value, index) => providerId(value, `expectedGroupIds[${index}]`))
      : [];
    const totalAdCount = providerCount(metadata.totalAdCount, "totalAdCount");
    if (
      expectedGroupIds.length !== 1 ||
      expectedGroupIds[0] !== normalizedAdGroupId ||
      !Number.isInteger(totalAdCount) ||
      totalAdCount !== ads.length
    ) {
      fail("manual product group roster is not complete", "AD_PRODUCT_METRICS_GROUP_ROSTER_UNAVAILABLE");
    }
    return {
      ...metadata,
      campaignId: normalizedCampaignId,
      adGroupId: normalizedAdGroupId,
      adSelectionType: selection,
      ads,
      expectedGroupIds,
      totalAdCount,
    };
  }

  function requestBody(scope, businessDate) {
    const epoch = kstMidnightEpoch(businessDate);
    if (epoch === null) fail(`invalid business date ${businessDate}`, "AD_PRODUCT_METRICS_DATE_INVALID");
    return {
      campaignIds: [scope.campaignId],
      adGroupId: scope.adGroupId,
      creativeId: null,
      start: epoch,
      end: epoch,
      tableType: TABLE_TYPE,
      targetList: scope.ads.map((ad) => ad.adId),
      isMatchTypeEnabled: false,
    };
  }

  function responseObject(response) {
    if (!response || typeof response !== "object") fail("product_sales response is not an object", "AD_PRODUCT_METRICS_RESPONSE_INVALID");
    if (response.ok === false) fail(`product_sales request failed (${response.status || 0})`, "AD_PRODUCT_METRICS_REQUEST_FAILED");
    const data = Object.prototype.hasOwnProperty.call(response, "data") ? response.data : response;
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      fail("product_sales response payload is not an object", "AD_PRODUCT_METRICS_RESPONSE_INVALID");
    }
    return data;
  }

  function metadataForAd(scope, ad) {
    const metadataByAd = scope.metadataByAdId instanceof Map
      ? scope.metadataByAdId.get(ad.adId)
      : null;
    const metadataByVendor = scope.metadataByVendorItemId instanceof Map
      ? scope.metadataByVendorItemId.get(ad.vendorItemId)
      : null;
    const metadata = metadataByAd || metadataByVendor || {};
    return {
      productName: normalizeText(metadata.productName ?? metadata.itemName ?? ad.itemName) || null,
      imageUrl: normalizeText(metadata.imageUrl) || null,
      productUrl: normalizeText(metadata.productUrl) || null,
      itemId: ad.vendorItemId,
      vendorItemId: ad.vendorItemId,
      status: metadata.status == null ? null : normalizeText(metadata.status) || null,
      onOff: metadata.onOff == null
        ? (ad.isActive === true ? "ON" : ad.isActive === false ? "OFF" : null)
        : normalizeText(metadata.onOff) || null,
      adGroup: normalizeText(scope.adGroupName ?? scope.adGroup) || null,
      // The displayed grid is a different period and its unknown columns may
      // contain additive metrics.  The API receipt already preserves the
      // authoritative raw metrics below; do not carry arbitrary DOM columns
      // into the product fact.
      rawColumns: {},
    };
  }

  function ratios(raw) {
    const out = {};
    const optional = [
      ["ctr", ["ctr", "clickThroughRate"]],
      ["roas", ["roas", "adRoas"]],
      ["conversionRate", ["clickToOrder", "conversionRate"]],
    ];
    for (const [name, keys] of optional) {
      for (const key of keys) {
        if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
        const candidate = raw[key];
        const value = typeof candidate === "number"
          ? candidate
          : typeof candidate === "string" && candidate.trim() !== ""
            ? Number(candidate.trim())
            : NaN;
        if (Number.isFinite(value) && value >= 0) out[name] = value;
        break;
      }
    }
    return out;
  }

  function normalizedRow(scope, ad, rawMetrics) {
    const metadata = metadataForAd(scope, ad);
    const deliveredAdCost = finiteMetric(rawMetrics.deliveredAdCost, "deliveredAdCost");
    const adAttributedSales = finiteMetric(rawMetrics.adAttributedSales, "adAttributedSales");
    const impressions = finiteMetric(rawMetrics.impressions, "impressions");
    const clicks = finiteMetric(rawMetrics.clicks, "clicks");
    const adAttributedUnits = finiteMetric(rawMetrics.adAttributedUnits, "adAttributedUnits");
    const adAttributedOrders = finiteMetric(rawMetrics.adAttributedOrders, "adAttributedOrders");
    const campaignId = scope.campaignId;
    const campaignIdentity = normalizeText(scope.campaignIdentity) || `campaign:${campaignId}`;
    const row = {
      pageType: "product",
      campaignId,
      campaignIdentity,
      campaignName: normalizeText(scope.campaignName) || "",
      adGroup: metadata.adGroup,
      adGroupId: scope.adGroupId,
      adSelectionType: "MANUAL_SELECTION",
      adId: ad.adId,
      creativeId: ad.adId,
      vendorItemId: ad.vendorItemId,
      itemId: ad.vendorItemId,
      productName: metadata.productName,
      status: metadata.status,
      onOff: metadata.onOff,
      imageUrl: metadata.imageUrl,
      productUrl: metadata.productUrl,
      runningAdSpend: Math.round(deliveredAdCost),
      adSpend: Math.round(deliveredAdCost),
      spend: Math.round(deliveredAdCost),
      adRevenue: Math.round(adAttributedSales),
      revenue: Math.round(adAttributedSales),
      impressions: Math.round(impressions),
      clicks: Math.round(clicks),
      conversions: Math.round(adAttributedUnits),
      orders: Math.round(adAttributedOrders),
      _observedMetrics: {
        adSpend: true,
        adRevenue: true,
        impressions: true,
        clicks: true,
        conversions: true,
        orders: true,
      },
      rawColumns: metadata.rawColumns,
      ...ratios(rawMetrics),
    };
    return row;
  }

  function rawRow(scope, ad, rawMetrics, body, metadata) {
    return {
      source: "coupang",
      sourceApi: "/marketing/cmg-api/tableMetric",
      tableType: TABLE_TYPE,
      campaignId: scope.campaignId,
      adGroupId: scope.adGroupId,
      adId: ad.adId,
      creativeId: null,
      vendorItemId: ad.vendorItemId,
      responseKey: ad.adId,
      request: { ...body, targetList: [...body.targetList] },
      metadata: {
        campaignName: normalizeText(scope.campaignName) || null,
        campaignIdentity: normalizeText(scope.campaignIdentity) || `campaign:${scope.campaignId}`,
        adGroup: normalizeText(scope.adGroupName ?? scope.adGroup) || null,
        productName: metadata.productName,
        imageUrl: metadata.imageUrl,
        productUrl: metadata.productUrl,
        status: metadata.status,
        onOff: metadata.onOff,
        rawColumns: metadata.rawColumns,
      },
      metrics: { ...rawMetrics },
    };
  }

  function create(options = {}) {
    const requestJson = ensureRequestJson(options.requestJson);

    async function collectDay({ campaignId, adGroupId, businessDate, metadata }) {
      const scope = normalizedMetadata(metadata, campaignId, adGroupId);
      const body = requestBody(scope, businessDate);
      const response = await requestJson("/marketing/cmg-api/tableMetric", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const data = responseObject(response);
      const expectedIds = body.targetList;
      const responseIds = Object.keys(data);
      if (responseIds.some((id) => !expectedIds.includes(String(id)))) {
        fail("product_sales response contains an unexpected ad key", "AD_PRODUCT_METRICS_RESPONSE_KEY_MISMATCH");
      }
      if (responseIds.length !== expectedIds.length || expectedIds.some((id) => !Object.prototype.hasOwnProperty.call(data, id))) {
        fail("product_sales response is missing a requested ad key", "AD_PRODUCT_METRICS_RESPONSE_KEY_MISMATCH");
      }

      const rows = [];
      const rawRows = [];
      for (const ad of scope.ads) {
        const key = ad.adId;
        const rawMetrics = data[key];
        if (!rawMetrics || typeof rawMetrics !== "object" || Array.isArray(rawMetrics)) {
          fail(`product_sales response key ${key} has no metric object`, "AD_PRODUCT_METRICS_INVALID_METRIC");
        }
        for (const name of REQUIRED_METRICS) {
          if (!Object.prototype.hasOwnProperty.call(rawMetrics, name)) {
            fail(`product_sales response key ${key} is missing ${name}`, "AD_PRODUCT_METRICS_INVALID_METRIC");
          }
          finiteMetric(rawMetrics[name], name);
        }
        const metadataForRow = metadataForAd(scope, ad);
        rows.push(normalizedRow(scope, ad, rawMetrics));
        rawRows.push(rawRow(scope, ad, { ...rawMetrics }, body, metadataForRow));
      }
      const observedAdIds = rows.map((row) => row.adId);
      return {
        ok: true,
        rows,
        rawRows,
        proof: {
          kind: "product_sales_api",
          campaignId: scope.campaignId,
          adGroupId: scope.adGroupId,
          businessDate: parseBusinessDate(businessDate),
          start: body.start,
          end: body.end,
          tableType: TABLE_TYPE,
          creativeId: null,
          isMatchTypeEnabled: false,
          expectedAds: scope.ads.map((ad) => ({ adId: ad.adId, vendorItemId: ad.vendorItemId })),
          expectedGroupIds: [...scope.expectedGroupIds],
          totalAdCount: scope.totalAdCount,
          observedAdIds,
          complete: true,
          explicitEmpty: false,
        },
        request: body,
        response: data,
      };
    }

    return Object.freeze({ collectDay });
  }

  globalThis.KidItemAdProductMetrics = Object.freeze({
    create,
    kstMidnightEpoch,
    parseBusinessDate,
    REQUIRED_METRICS: Object.freeze([...REQUIRED_METRICS]),
  });
})();
