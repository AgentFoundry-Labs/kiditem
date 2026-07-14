(function attachCoupangSellerDetail(globalScope) {
  "use strict";

  function decodeHtmlEntities(value) {
    return String(value || "")
      .replace(/&#(\d+);/g, (_match, code) =>
        String.fromCharCode(Number.parseInt(code, 10)),
      )
      .replace(/&#x([0-9a-f]+);/gi, (_match, code) =>
        String.fromCharCode(Number.parseInt(code, 16)),
      )
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">");
  }

  function decodeJsonString(value) {
    try {
      return JSON.parse(`"${value}"`);
    } catch {
      return String(value || "")
        .replace(/\\u([0-9a-f]{4})/gi, (_match, code) =>
          String.fromCharCode(Number.parseInt(code, 16)),
        )
        .replace(/\\"/g, '"')
        .replace(/\\\//g, "/")
        .replace(/\\n|\\r|\\t/g, " ");
    }
  }

  function cleanSellerName(value) {
    if (value == null) return null;
    const cleaned = decodeHtmlEntities(decodeJsonString(value))
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
    if (!cleaned || /^(판매자|쿠팡|로켓배송)$/i.test(cleaned)) return null;
    return cleaned;
  }

  function firstCapture(html, patterns) {
    for (const pattern of patterns) {
      const match = pattern.exec(html);
      if (match?.[1]) return match[1];
    }
    return null;
  }

  function extractCoupangSellerShopLink(value) {
    const href = typeof value?.href === "string" ? value.href.trim() : "";
    if (!href) return null;

    let parsed;
    try {
      parsed = new URL(href);
    } catch {
      return null;
    }
    if (
      parsed.protocol !== "https:" ||
      parsed.hostname !== "shop.coupang.com"
    ) {
      return null;
    }

    const pathParts = parsed.pathname.split("/").filter(Boolean);
    const sellerId = pathParts[0] === "vid" ? pathParts[1] : pathParts[0];
    if (!sellerId || !/^[A-Za-z0-9_-]{1,80}$/.test(sellerId)) return null;

    const rawName = String(value?.text || "").replace(
      /\s*판매자\s*상품\s*보러가기\s*$/i,
      "",
    );
    const sellerName = cleanSellerName(rawName);
    const storePath = pathParts[0] === "vid" ? `/vid/${sellerId}` : `/${sellerId}`;
    return {
      sellerName,
      sellerId,
      sellerStoreUrl: `https://shop.coupang.com${storePath}`,
    };
  }

  function extractCoupangSellerDetail(html) {
    const source = typeof html === "string" ? html : "";
    if (!source) return null;

    const rawName = firstCapture(source, [
      /class=["'][^"']*(?:prod-sale-vendor-name|vendor-name|seller-name)[^"']*["'][^>]*>([\s\S]{1,300}?)<\//i,
      /판매자\s*:\s*([^<]{1,160})<\//i,
      /\\+"vendorName\\+"\s*:\s*\\+"((?:\\\\.|[^"\\]){1,160})\\+"/i,
      /\\+"sellerName\\+"\s*:\s*\\+"((?:\\\\.|[^"\\]){1,160})\\+"/i,
      /"vendorName"\s*:\s*"((?:\\.|[^"\\]){1,160})"/i,
      /"sellerName"\s*:\s*"((?:\\.|[^"\\]){1,160})"/i,
      /"seller"\s*:\s*\{[\s\S]{0,600}?"name"\s*:\s*"((?:\\.|[^"\\]){1,160})"/i,
    ]);
    const sellerName = cleanSellerName(rawName);
    const sellerId = firstCapture(source, [
      /\\+"vendorId\\+"\s*:\s*\\+"?([A-Za-z0-9_-]{1,80})/i,
      /\\+"sellerId\\+"\s*:\s*\\+"?([A-Za-z0-9_-]{1,80})/i,
      /"vendorId"\s*:\s*"?([A-Za-z0-9_-]{1,80})"?/i,
      /"sellerId"\s*:\s*"?([A-Za-z0-9_-]{1,80})"?/i,
      /[?&]vendorId=([A-Za-z0-9_-]{1,80})/i,
    ]);
    const rawStorePath = firstCapture(source, [
      /https:\/\/shop\.coupang\.com\/(?:vid\/)?([A-Za-z0-9_-]{1,80})/i,
      /https:\\\/\\\/shop\.coupang\.com\\\/(?:vid\\\/)?([A-Za-z0-9_-]{1,80})/i,
      /href=["']\/\/(?:shop\.)?coupang\.com\/(?:vid\/)?([A-Za-z0-9_-]{1,80})/i,
    ]);
    const storeSellerId = rawStorePath || sellerId || null;

    if (!sellerName && !storeSellerId) return null;
    return {
      sellerName,
      sellerId: storeSellerId,
      sellerStoreUrl: storeSellerId
        ? `https://shop.coupang.com/${storeSellerId}`
        : null,
    };
  }

  globalScope.KidItemCoupangSellerDetail = Object.freeze({
    extractCoupangSellerShopLink,
    extractCoupangSellerDetail,
  });
})(globalThis);
