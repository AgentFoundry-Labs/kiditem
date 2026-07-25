// TikTok Creative Center trend extractor (normalization core).
//
// ⚠️ UNVERIFIED against the live, bot/region-gated TikTok Creative Center.
// The `creative_radar_api` response shapes below are best-effort guesses drawn
// from public Creative Center behavior; field names, list containers, and the
// country/industry structures were NOT confirmed against real captured traffic.
// An operator MUST load the extension, open the Trends pages, capture real
// `https://ads.tiktok.com/creative_radar_api/v1/...` responses, and confirm or
// repair the field mapping in `normalizeRow`/`findRows` before trusting output.
//
// See the market-research tool landscape note [[reference_market_trend_research_tools]]
// for how TikTok/Douyin discovery fits the broader sourcing trend pipeline.
//
// This file is pure (no chrome/DOM state at load time) so it can run both as an
// ISOLATED-world content-script helper and be unit-tested via node:vm.
(function (global) {
  "use strict";

  const API_MARKER = "/creative_radar_api/v1/";
  const MAX_ITEMS = 500;
  const MAX_KEY_LENGTH = 200;
  const MAX_POST_COUNT = 2_147_483_647;
  const MAX_VIEW_COUNT = 9_000_000_000_000;

  const TREND_TYPES = new Set(["hashtag", "keyword", "product", "song"]);

  // endpoint path -> trendType. Order matters (most specific first).
  const ENDPOINT_TREND_TYPES = [
    { pattern: /popular_trend\/hashtag\/list/i, trendType: "hashtag" },
    { pattern: /hashtag\/list/i, trendType: "hashtag" },
    { pattern: /insight_word\/list/i, trendType: "keyword" },
    { pattern: /keyword\/list/i, trendType: "keyword" },
    { pattern: /(?:popular_song|song|music|sound)\/list/i, trendType: "song" },
    { pattern: /popular_trend\/list/i, trendType: "product" },
    { pattern: /(?:product|item|ad)\/list/i, trendType: "product" },
  ];

  const NAME_KEYS = [
    "hashtag_name", "hashtagName", "hash_tag_name", "keyword", "word",
    "product_name", "productName", "song_title", "songTitle", "music_title",
    "title", "name", "tag_name", "tagName", "display_name", "displayName",
  ];
  const ID_KEYS = [
    "hashtag_id", "hashtagId", "product_id", "productId", "song_id", "songId",
    "music_id", "musicId", "word_id", "wordId", "id",
  ];
  const RANK_KEYS = ["rank", "ranking", "rank_no", "rankNo", "position", "order"];
  const POST_KEYS = [
    "publish_cnt", "publishCnt", "post_cnt", "postCnt", "post_count", "postCount",
    "video_cnt", "videoCnt", "video_count", "videoCount", "posts", "publish_count",
  ];
  const VIEW_KEYS = [
    "video_views", "videoViews", "view_cnt", "viewCnt", "view_count", "viewCount",
    "play_cnt", "playCnt", "play_count", "playCount", "views", "impression",
  ];
  const GROWTH_KEYS = [
    "trend_pct", "trendPct", "growth", "growth_pct", "growthPct", "increase",
    "rank_diff_pct", "rankDiffPct", "change_pct", "changePct",
  ];
  const THUMB_KEYS = [
    "cover_url", "coverUrl", "thumbnail", "thumbnail_url", "thumbnailUrl",
    "image_url", "imageUrl", "cover", "pic_url", "picUrl",
  ];
  const SOURCE_URL_KEYS = [
    "share_url", "shareUrl", "detail_url", "detailUrl", "url", "link",
    "landing_url", "landingUrl",
  ];

  function sanitizeTrendType(value) {
    return typeof value === "string" && TREND_TYPES.has(value) ? value : null;
  }

  function trendTypeFromEndpoint(url) {
    const str = String(url || "");
    for (const entry of ENDPOINT_TREND_TYPES) {
      if (entry.pattern.test(str)) return entry.trendType;
    }
    return null;
  }

  function sanitizeRegion(value) {
    if (typeof value !== "string") return null;
    const cleaned = value.replace(/[^A-Za-z]/g, "").toUpperCase();
    return cleaned.length >= 2 && cleaned.length <= 8 ? cleaned : null;
  }

  function firstString(row, keys) {
    if (!row || typeof row !== "object") return null;
    for (const key of keys) {
      const value = row[key];
      if (typeof value === "string" && value.trim()) return value.trim();
      if (typeof value === "number" && Number.isFinite(value)) return String(value);
    }
    return null;
  }

  function firstNumber(row, keys) {
    if (!row || typeof row !== "object") return null;
    for (const key of keys) {
      const parsed = toNumber(row[key]);
      if (parsed !== null) return parsed;
    }
    return null;
  }

  function toNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "string") {
      const parsed = Number(value.replace(/,/g, "").trim());
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  function clampRank(value) {
    if (value === null) return null;
    const rounded = Math.round(value);
    return rounded >= 1 && rounded <= 1000 ? rounded : null;
  }

  function clampCount(value, max) {
    if (value === null) return null;
    const rounded = Math.round(value);
    if (!Number.isFinite(rounded)) return null;
    return Math.max(0, Math.min(max, rounded));
  }

  function round2(value) {
    return Math.round(value * 100) / 100;
  }

  function truncate(value, max) {
    const str = String(value == null ? "" : value).trim();
    return str.length > max ? str.slice(0, max) : str;
  }

  function nestedString(row, parentKeys, childKeys) {
    if (!row || typeof row !== "object") return null;
    for (const parentKey of parentKeys) {
      const parent = row[parentKey];
      if (parent && typeof parent === "object") {
        const value = firstString(parent, childKeys);
        if (value) return value;
      }
    }
    return null;
  }

  function resolveIndustry(row) {
    return nestedString(row, ["industry_info", "industryInfo"], ["value", "name", "label"])
      || firstString(row, ["industry", "category", "category_name", "categoryName"]);
  }

  function regionFromRow(row) {
    const nested = nestedString(row, ["country_info", "countryInfo"], ["id", "code", "value"]);
    const flat = firstString(row, ["country_code", "countryCode", "region", "country"]);
    return sanitizeRegion(nested) || sanitizeRegion(flat);
  }

  function resolveGrowth(row) {
    const explicit = firstNumber(row, GROWTH_KEYS);
    if (explicit !== null) return round2(explicit);
    const trend = Array.isArray(row.trend)
      ? row.trend
      : Array.isArray(row.trends) ? row.trends : null;
    if (trend && trend.length >= 2) {
      const first = toNumber(trend[0] && typeof trend[0] === "object" ? trend[0].value : trend[0]);
      const last = toNumber(
        trend[trend.length - 1] && typeof trend[trend.length - 1] === "object"
          ? trend[trend.length - 1].value
          : trend[trend.length - 1],
      );
      if (first !== null && last !== null && first > 0) {
        return round2(((last - first) / first) * 100);
      }
    }
    return null;
  }

  function httpsOrNull(value) {
    if (typeof value !== "string" || !value.trim()) return null;
    try {
      const url = new URL(value.trim());
      return url.protocol === "https:" ? url.toString() : null;
    } catch (e) {
      return null;
    }
  }

  function normalizeRow(row, trendType, options) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return null;
    const name = firstString(row, NAME_KEYS);
    const idKey = firstString(row, ID_KEYS);
    const entityKey = truncate(name || idKey || "", MAX_KEY_LENGTH);
    if (!entityKey) return null;

    const item = { trendType, entityKey };
    if (name) item.label = truncate(name, MAX_KEY_LENGTH);

    const industry = resolveIndustry(row);
    if (industry) item.industry = truncate(industry, MAX_KEY_LENGTH);

    if (options && options.sourceKeyword) {
      item.sourceKeyword = truncate(options.sourceKeyword, MAX_KEY_LENGTH);
    }

    const rank = clampRank(firstNumber(row, RANK_KEYS));
    if (rank !== null) item.rank = rank;

    const postCount = clampCount(firstNumber(row, POST_KEYS), MAX_POST_COUNT);
    if (postCount !== null) item.postCount = postCount;

    const viewCount = clampCount(firstNumber(row, VIEW_KEYS), MAX_VIEW_COUNT);
    if (viewCount !== null) item.viewCount = viewCount;

    const growthPct = resolveGrowth(row);
    if (growthPct !== null) item.growthPct = growthPct;

    const thumbnailUrl = httpsOrNull(firstString(row, THUMB_KEYS));
    if (thumbnailUrl) item.thumbnailUrl = thumbnailUrl;

    const sourceUrl = httpsOrNull(firstString(row, SOURCE_URL_KEYS));
    if (sourceUrl) item.sourceUrl = sourceUrl;

    return item;
  }

  function findRows(payload) {
    if (!payload || typeof payload !== "object") return [];
    const data = payload.data && typeof payload.data === "object" ? payload.data : payload;
    const direct = [
      data.list, data.hashtag_list, data.hashtagList, data.records, data.items,
      data.word_list, data.wordList, data.keyword_list, data.keywordList,
      data.trend_list, data.trendList, data.rank_list, data.rankList,
      payload.list, payload.records, payload.items,
    ];
    for (const candidate of direct) {
      if (Array.isArray(candidate) && candidate.length && typeof candidate[0] === "object") {
        return candidate;
      }
    }
    return deepFindObjectArray(data, 0) || [];
  }

  function deepFindObjectArray(value, depth) {
    if (depth > 4 || !value || typeof value !== "object") return null;
    for (const nested of Object.values(value)) {
      if (
        Array.isArray(nested) &&
        nested.length &&
        typeof nested[0] === "object" &&
        !Array.isArray(nested[0])
      ) {
        return nested;
      }
    }
    for (const nested of Object.values(value)) {
      const found = deepFindObjectArray(nested, depth + 1);
      if (found) return found;
    }
    return null;
  }

  // captures: Array<{ url: string, payload: object }>
  // options: { trendTypeHint?, sourceKeyword?, defaultRegion? }
  // returns: { region: string, items: TiktokCcItem[] }
  function normalizeCaptures(captures, options) {
    const opts = options || {};
    const list = Array.isArray(captures) ? captures : [];
    const hint = sanitizeTrendType(opts.trendTypeHint);
    const items = [];
    const seen = new Set();
    let captureRegion = null;

    for (const capture of list) {
      if (!capture) continue;
      const url = capture.url ? String(capture.url) : "";
      const payload = capture.payload != null
        ? capture.payload
        : capture.json != null ? capture.json : capture.body;
      const trendType = trendTypeFromEndpoint(url) || hint;
      if (!trendType) continue;

      const rows = findRows(payload);
      for (const row of rows) {
        if (!captureRegion) {
          const rowRegion = regionFromRow(row);
          if (rowRegion) captureRegion = rowRegion;
        }
        const item = normalizeRow(row, trendType, opts);
        if (!item) continue;
        const key = `${item.trendType}::${item.entityKey}`;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push(item);
        if (items.length >= MAX_ITEMS) {
          return { region: resolveRegion(captureRegion, opts), items };
        }
      }
    }
    return { region: resolveRegion(captureRegion, opts), items };
  }

  function resolveRegion(captureRegion, opts) {
    return captureRegion || sanitizeRegion(opts.defaultRegion) || "US";
  }

  // Best-effort DOM fallback for when the API hook captured nothing. Very
  // brittle — Creative Center markup is obfuscated and UNVERIFIED. Only pulls
  // hashtag/keyword anchors with a stable visible token.
  function extractFromDom(document, options) {
    const opts = options || {};
    const trendType = sanitizeTrendType(opts.trendTypeHint) || "hashtag";
    const anchors = safeQueryAll(document, "a[href]");
    const items = [];
    const seen = new Set();
    let rank = 0;

    for (const anchor of anchors) {
      const href = attribute(anchor, "href") || anchor.href || "";
      if (!/\/(?:hashtag|keyword|inspiration|trends?)\//i.test(String(href))) continue;
      const text = cleanText(anchor.innerText || anchor.textContent || "");
      const match = text.match(/#?([\p{L}0-9_]{2,100})/u);
      const entityKey = truncate(match ? match[1] : "", MAX_KEY_LENGTH);
      if (!entityKey) continue;
      const key = `${trendType}::${entityKey}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rank += 1;

      const item = { trendType, entityKey };
      if (text) item.label = truncate(text, MAX_KEY_LENGTH);
      if (rank <= 1000) item.rank = rank;
      if (opts.sourceKeyword) item.sourceKeyword = truncate(opts.sourceKeyword, MAX_KEY_LENGTH);
      const sourceUrl = httpsOrNull(String(href));
      if (sourceUrl) item.sourceUrl = sourceUrl;
      items.push(item);
      if (items.length >= MAX_ITEMS) break;
    }
    return items;
  }

  function safeQueryAll(root, selector) {
    try { return Array.from(root && root.querySelectorAll ? root.querySelectorAll(selector) : []); } catch (e) { return []; }
  }

  function attribute(node, name) {
    try { return node && node.getAttribute ? node.getAttribute(name) : null; } catch (e) { return null; }
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  global.ProductScraperTiktokCcExtractor = {
    API_MARKER,
    normalizeCaptures,
    extractFromDom,
    trendTypeFromEndpoint,
    sanitizeRegion,
    sanitizeTrendType,
    round2,
  };
})(globalThis);
