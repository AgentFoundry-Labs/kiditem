(function (global) {
  "use strict";

  const MAX_PRODUCTS = 100;

  function detectSource(urlValue) {
    try {
      const host = new URL(urlValue).hostname.toLowerCase();
      if (host === "1688.com" || host.endsWith(".1688.com")) return "1688";
      if (host === "douyin.com" || host.endsWith(".douyin.com")) return "douyin";
    } catch (e) {}
    return null;
  }

  function isVerificationPage(doc, urlValue) {
    const text = cleanText(doc?.body?.innerText || "").slice(0, 8000);
    try {
      const url = new URL(urlValue);
      if (url.pathname.includes("/punish") || url.searchParams.get("action") === "captcha") return true;
    } catch (e) {}
    return /(?:滑块|验证码|安全验证|访问异常|请完成验证|unusual\s+traffic|captcha)/i.test(text);
  }

  function extract(doc, urlValue) {
    const source = detectSource(urlValue);
    if (!source) return { ok: false, error: "unsupported_live_source" };
    if (isVerificationPage(doc, urlValue)) {
      return { ok: false, status: "verification_required", verificationUrl: urlValue };
    }

    const hydrated = readHydratedRecords(doc);
    const products = dedupeProducts([
      ...extractProductsFromAnchors(doc, source),
      ...extractProductsFromRecords(hydrated, source),
    ]).slice(0, MAX_PRODUCTS).map((item, index) => ({ ...item, rank: item.rank || index + 1 }));
    const pageText = cleanText(doc?.body?.innerText || "");
    const broadcastId = roomIdFromUrl(urlValue)
      || firstRecordValue(hydrated, ["room_id", "roomId", "live_id", "liveId", "web_rid", "webRid"])
      || stablePageId(urlValue);
    const broadcasterName = firstText(doc, broadcasterSelectors(source))
      || firstRecordValue(hydrated, ["nickname", "anchor_name", "anchorName", "broadcasterName", "user_nick"]);
    const broadcasterId = firstRecordValue(hydrated, ["anchor_id", "anchorId", "author_id", "authorId", "account_id"]);
    const coverImageUrl = metaContent(doc, "meta[property='og:image']")
      || firstRecordValue(hydrated, ["cover_url", "coverUrl", "cover_img", "coverImageUrl"]);
    const title = metaContent(doc, "meta[property='og:title']")
      || firstText(doc, ["h1", "[class*='title']"])
      || cleanText(doc?.title || "")
      || null;

    return {
      ok: true,
      source,
      pageUrl: urlValue,
      broadcast: compactObject({
        broadcastId,
        title,
        broadcasterId,
        broadcasterName,
        status: detectLiveStatus(pageText),
        viewerCount: findMetric(pageText, source === "douyin" ? ["在线", "观看", "观众"] : ["观看", "在线", "人气"]),
        likeCount: findMetric(pageText, ["点赞", "赞"]),
        coverImageUrl,
      }),
      products,
    };
  }

  function extractProductsFromAnchors(doc, source) {
    const anchors = safeQueryAll(doc, "a[href]");
    const products = [];
    for (const anchor of anchors) {
      const href = absoluteUrl(anchor.href || attribute(anchor, "href"), doc?.baseURI);
      if (!href || !isProductUrl(source, href)) continue;
      const productId = productIdFromUrl(href);
      if (!productId) continue;
      const card = closestCard(anchor);
      const image = safeQuery(card, "img");
      const text = cleanText(card?.innerText || anchor.textContent || "");
      products.push(compactObject({
        productId,
        title: attribute(anchor, "title") || attribute(image, "alt") || firstUsefulLine(text),
        priceCny: findPrice(text),
        salesCount: findMetric(text, ["已售", "销量", "成交", "售出"]),
        imageUrl: normalizedImageUrl(image, doc?.baseURI),
        sourceUrl: href,
      }));
    }
    return products;
  }

  function extractProductsFromRecords(records, source) {
    const products = [];
    for (const record of records) {
      const productId = valueFrom(record, ["item_id", "itemId", "product_id", "productId", "offer_id", "offerId"]);
      const sourceUrl = valueFrom(record, ["item_url", "itemUrl", "product_url", "productUrl", "detail_url", "detailUrl", "url"]);
      if (!productId && !(sourceUrl && isProductUrl(source, sourceUrl))) continue;
      const resolvedId = productId || productIdFromUrl(sourceUrl);
      if (!resolvedId) continue;
      products.push(compactObject({
        productId: String(resolvedId),
        title: valueFrom(record, ["item_title", "itemTitle", "product_name", "productName", "title", "name"]),
        priceCny: numericValue(valueFrom(record, ["price", "item_price", "itemPrice", "promotion_price"])),
        salesCount: integerValue(valueFrom(record, ["sales_count", "salesCount", "sold_count", "soldCount", "volume"])),
        imageUrl: valueFrom(record, ["image_url", "imageUrl", "item_pic", "itemPic", "cover", "pic_url"]),
        sourceUrl: sourceUrl || null,
      }));
    }
    return products;
  }

  function readHydratedRecords(doc) {
    const scripts = safeQueryAll(doc, "script[type='application/json'], script#__NEXT_DATA__, script[id*='RENDER_DATA']");
    const records = [];
    for (const script of scripts) {
      const text = script.textContent || "";
      if (!text || text.length > 2_000_000) continue;
      try {
        walkJson(JSON.parse(text), records, 0);
      } catch (e) {}
      if (records.length >= 1000) break;
    }
    return records;
  }

  function walkJson(value, records, depth) {
    if (depth > 12 || records.length >= 1000 || value == null) return;
    if (Array.isArray(value)) {
      for (const item of value) walkJson(item, records, depth + 1);
      return;
    }
    if (typeof value !== "object") return;
    records.push(value);
    for (const nested of Object.values(value)) walkJson(nested, records, depth + 1);
  }

  function roomIdFromUrl(urlValue) {
    try {
      const url = new URL(urlValue);
      for (const key of ["room_id", "roomId", "live_id", "liveId", "web_rid", "webRid"]) {
        const value = url.searchParams.get(key);
        if (value) return value;
      }
      const parts = url.pathname.split("/").filter(Boolean);
      const liveIndex = parts.findIndex((part) => /^(?:live|room|broadcast)$/i.test(part));
      if (liveIndex >= 0 && parts[liveIndex + 1]) return parts[liveIndex + 1].slice(0, 128);
      const numeric = parts.find((part) => /^\d{5,}$/.test(part));
      return numeric || null;
    } catch (e) {
      return null;
    }
  }

  function stablePageId(urlValue) {
    let hash = 2166136261;
    for (let index = 0; index < urlValue.length; index++) {
      hash ^= urlValue.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `page-${(hash >>> 0).toString(16)}`;
  }

  function productIdFromUrl(urlValue) {
    if (!urlValue) return null;
    try {
      const url = new URL(urlValue);
      for (const key of ["id", "itemId", "item_id", "product_id", "productId", "offerId", "offer_id"]) {
        const value = url.searchParams.get(key);
        if (value) return value.slice(0, 128);
      }
      const match = url.pathname.match(/(?:offer|item|product|goods)[\/_-]?(\d{5,})/i)
        || url.pathname.match(/\/(\d{5,})(?:\.html)?(?:\/|$)/);
      return match?.[1] || null;
    } catch (e) {
      return null;
    }
  }

  function isProductUrl(source, urlValue) {
    try {
      const url = new URL(urlValue);
      const host = url.hostname.toLowerCase();
      if (source === "1688") {
        return (host === "1688.com" || host.endsWith(".1688.com"))
          && /(?:offer|item|product|detail)/i.test(`${url.pathname}${url.search}`);
      }
      return (host === "douyin.com" || host.endsWith(".douyin.com") || host.endsWith(".jinritemai.com"))
        && /(?:item|product|goods|haohuo)/i.test(`${url.pathname}${url.search}`);
    } catch (e) {
      return false;
    }
  }

  function findMetric(text, labels) {
    for (const label of labels) {
      const patterns = [
        new RegExp(`${label}[^0-9零一二三四五六七八九十百千万亿]{0,8}([0-9]+(?:\\.[0-9]+)?(?:万|亿|w|k)?)`, "i"),
        new RegExp(`([0-9]+(?:\\.[0-9]+)?(?:万|亿|w|k)?)\\s*(?:${label})`, "i"),
      ];
      for (const pattern of patterns) {
        const match = text.match(pattern);
        const parsed = parseCompactNumber(match?.[1]);
        if (parsed !== null) return parsed;
      }
    }
    return null;
  }

  function parseCompactNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
    if (typeof value !== "string") return null;
    const normalized = value.trim().toLowerCase().replace(/,/g, "");
    const match = normalized.match(/([0-9]+(?:\.[0-9]+)?)\s*(万|亿|w|k)?/i);
    if (!match) return null;
    const base = Number(match[1]);
    if (!Number.isFinite(base)) return null;
    const multiplier = match[2] === "亿" ? 100_000_000 : match[2] === "万" || match[2] === "w" ? 10_000 : match[2] === "k" ? 1_000 : 1;
    return Math.max(0, Math.min(2_147_483_647, Math.round(base * multiplier)));
  }

  function findPrice(text) {
    const match = text.match(/(?:¥|￥|RMB\s*)\s*([0-9]+(?:\.[0-9]+)?)/i)
      || text.match(/([0-9]+(?:\.[0-9]+)?)\s*元/);
    return match ? numericValue(match[1]) : null;
  }

  function detectLiveStatus(text) {
    if (/(?:直播中|正在直播|LIVE)/i.test(text)) return "live";
    if (/(?:回放|直播已结束|已结束)/i.test(text)) return "replay";
    if (/(?:预告|即将开播|预约)/i.test(text)) return "scheduled";
    return null;
  }

  function broadcasterSelectors(source) {
    return source === "douyin"
      ? ["[class*='anchor'] [class*='name']", "[class*='author'] [class*='name']", "[data-e2e*='author']"]
      : ["[class*='anchor'] [class*='name']", "[class*='shop'] [class*='name']", "[class*='seller']"];
  }

  function closestCard(node) {
    let current = node;
    for (let depth = 0; depth < 5 && current; depth++) {
      const text = cleanText(current.innerText || "");
      if (text.length >= 8 && text.length <= 1500 && safeQuery(current, "img")) return current;
      current = current.parentElement;
    }
    return node;
  }

  function dedupeProducts(items) {
    const seen = new Set();
    return items.filter((item) => {
      if (!item?.productId || seen.has(item.productId)) return false;
      seen.add(item.productId);
      return true;
    });
  }

  function firstRecordValue(records, keys) {
    for (const record of records) {
      const value = valueFrom(record, keys);
      if (value !== null && value !== undefined && String(value).trim()) return String(value).trim();
    }
    return null;
  }

  function valueFrom(record, keys) {
    for (const key of keys) {
      const value = record?.[key];
      if (typeof value === "string" && value.trim()) return value.trim();
      if (typeof value === "number" && Number.isFinite(value)) return value;
    }
    return null;
  }

  function firstText(doc, selectors) {
    for (const selector of selectors) {
      const value = cleanText(safeQuery(doc, selector)?.textContent || "");
      if (value) return value.slice(0, 500);
    }
    return null;
  }

  function firstUsefulLine(text) {
    return text.split(/\n+/).map(cleanText).find((line) => line.length >= 4 && !/^[¥￥\d.,万亿w\s]+$/i.test(line))?.slice(0, 500) || null;
  }

  function normalizedImageUrl(image, baseUrl) {
    if (!image) return null;
    const raw = image.currentSrc || attribute(image, "src") || attribute(image, "data-src") || attribute(image, "data-lazy-src");
    return absoluteUrl(raw, baseUrl);
  }

  function metaContent(doc, selector) {
    return attribute(safeQuery(doc, selector), "content") || null;
  }

  function safeQuery(root, selector) {
    try { return root?.querySelector?.(selector) || null; } catch (e) { return null; }
  }

  function safeQueryAll(root, selector) {
    try { return Array.from(root?.querySelectorAll?.(selector) || []); } catch (e) { return []; }
  }

  function attribute(node, name) {
    try { return node?.getAttribute?.(name) || null; } catch (e) { return null; }
  }

  function absoluteUrl(value, baseUrl) {
    if (!value || /^data:/i.test(value)) return null;
    try {
      const url = new URL(value, baseUrl || undefined);
      return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
    } catch (e) {
      return null;
    }
  }

  function numericValue(value) {
    const parsed = typeof value === "number" ? value : Number(String(value || "").replace(/,/g, ""));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  function integerValue(value) {
    const parsed = parseCompactNumber(value);
    return parsed === null ? null : Math.round(parsed);
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function compactObject(value) {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null && item !== undefined && item !== ""));
  }

  global.ProductScraperLiveCommerceExtractor = {
    detectSource,
    extract,
    isVerificationPage,
    parseCompactNumber,
    productIdFromUrl,
  };
})(globalThis);
