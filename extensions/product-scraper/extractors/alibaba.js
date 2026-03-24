var ProductScraper = ProductScraper || {};

ProductScraper.alibaba = (() => {
  "use strict";

  const C = ProductScraper.common;

  // ── Search results selectors (FY26, 2025+) ──

  const SEARCH_CARD = [
    ".fy26-product-card-wrapper",
    "[class*='fy26-product-card']",
    "[class*='searchx-offer-item']",
    ".J-search-card-wrapper",
    ".m-gallery-product-item-v2",
    "[class*='organic-gallery-offer']",
  ];

  const SEARCH_TITLE = [
    "h2[class*='searchx-product-e-title']",
    "[class*='searchx-title-area'] h2",
    "h2[class*='search-card-e-title']",
    "[class*='elements-title-normal']",
    "h2",
  ];

  const SEARCH_PRICE = [
    "[class*='searchx-price']",
    "[class*='price-area']",
    "[class*='search-card-e-price']",
    "[class*='elements-offer-price']",
    "[class*='price']",
  ];

  const SEARCH_MOQ = [
    "[class*='searchx-moq']",
    "[class*='min-order']",
    "[class*='search-card-e-min-order']",
  ];

  const SEARCH_ENGAGEMENT = [
    "[class*='searchx-reorder']",
    "[class*='searchx-review']",
    "[class*='search-card-e-review']",
    "[class*='reorder']",
    "[class*='review']",
  ];

  const SEARCH_SUPPLIER = [
    "[class*='searchx-supplier']",
    "[class*='supplier-content']",
    "[class*='search-card-e-company']",
    "[class*='supplier-name']",
    "[class*='company-name']",
  ];

  // ── Detail page DOM selectors (FY26 module_* redesign fallback) ──

  const DETAIL = {
    title: [
      ".module_title h1",
      "[data-module-name='module_title'] h1",
      "h1",
    ],
    price: [
      ".module_price .price-item",
      ".module_price",
      "[class*='price-item']",
    ],
    moq: [
      ".module_price [class*='quantity']",
      "[class*='min-order']",
      "[class*='moq']",
    ],
    supplierName: [
      ".module_company .company-name",
      ".company-name",
      "[class*='supplier-name']",
    ],
    supplierYears: [
      ".module_company .company-life",
      ".company-life",
    ],
    verifiedBadges: [
      "[class*='verified']",
      "[class*='trade-assurance']",
    ],
    images: [
      "img.product-img",
      ".product-wrapper img",
      ".module_productImage img",
    ],
    specRows: [
      ".module_attribute [class*='attr']",
      ".module_product_specification [class*='attr']",
      ".do-entry-item",
    ],
    description: [
      ".module_description",
      ".description-layout",
      "[class*='product-description']",
    ],
    leadTime: [
      ".module_lead",
      "[class*='lead-time']",
    ],
    shipping: [
      ".module_shipping",
      "[class*='shipping']",
      "[class*='logistics']",
    ],
  };

  // ── Search results extraction ──

  function extractSearch() {
    const cards = C.qAll(SEARCH_CARD);
    if (cards.length === 0) return null;

    const items = [];
    for (const card of cards) {
      const titleEl = card.querySelector(SEARCH_TITLE.join(","));
      const title = titleEl ? titleEl.textContent.trim() : "";
      if (!title) continue;

      const linkEl =
        card.querySelector("a[href*='product-detail']") ||
        card.querySelector("a.searchx-product-link-wrapper") ||
        card.querySelector("a[href]");
      let url = "";
      if (linkEl) {
        const href = linkEl.getAttribute("href") || "";
        url = href.startsWith("http") ? href : `https:${href}`;
      }

      const priceText = (() => {
        const el = card.querySelector(SEARCH_PRICE.join(","));
        return el ? el.textContent.trim() : "";
      })();
      const price = C.parsePrice(priceText);

      let moqText = (() => {
        const el = card.querySelector(SEARCH_MOQ.join(","));
        return el ? el.textContent.trim() : "";
      })();
      if (!moqText) {
        const match = card.textContent.match(
          /Min[.]?\s*order[:\s]*(\d[\d,]*\s*\w*)/i
        );
        if (match) moqText = match[0];
      }

      const engagementText = (() => {
        const el = card.querySelector(SEARCH_ENGAGEMENT.join(","));
        return el ? el.textContent.trim() : "";
      })();

      const supplierText = (() => {
        const el = card.querySelector(SEARCH_SUPPLIER.join(","));
        return el ? el.textContent.trim() : "";
      })();

      const thumbEl = card.querySelector("img[src], img[data-src]");
      const thumbnail = thumbEl
        ? thumbEl.src || thumbEl.dataset.src || ""
        : "";

      items.push({
        title: title.slice(0, 500),
        url,
        price_min: price.min,
        price_max: price.max,
        currency: price.currency,
        moq: C.parseMoq(moqText),
        supplier_name: supplierText,
        engagement: C.parseNumber(engagementText),
        thumbnail,
      });
    }

    return {
      source_url: location.href,
      source_platform: "ALIBABA",
      page_type: "search",
      items,
      total_found: items.length,
      extracted_at: new Date().toISOString(),
    };
  }

  // ══════════════════════════════════════════════════════════════
  //  Detail extraction — PRIMARY: window.detailData JSON
  // ══════════════════════════════════════════════════════════════

  function extractDetailFromData(dd) {
    const result = C.baseResult("ALIBABA");

    const gd = dd.globalData || {};
    const product = gd.product || {};
    const seller = gd.seller || {};
    const trade = gd.trade || {};

    // Title
    result.title = product.subject || "";

    // Price — always extract USD (dollarPrice) for cross-locale consistency
    const priceData = product.price || {};
    const tiers = priceData.productLadderPrices || [];
    if (tiers.length > 0) {
      const usdPrices = tiers
        .map((t) => t.dollarPrice)
        .filter((p) => typeof p === "number" && p > 0);
      result.price_min = usdPrices.length ? Math.min(...usdPrices) : null;
      result.price_max =
        usdPrices.length > 1 ? Math.max(...usdPrices) : null;
      result.currency = "USD";
      result.price_tiers = tiers.map((t) => ({
        min_qty: t.min,
        max_qty: t.max === -1 ? null : t.max,
        price_usd: t.dollarPrice,
        price_local: t.price,
        format_price: t.formatPrice || "",
      }));
    }

    // Local currency info
    const rule = priceData.currencyRule || {};
    if (rule.rate && rule.rate !== 1) {
      result.local_currency_rate = rule.rate;
      result.format_ladder_price = priceData.formatLadderPrice || "";
    }

    // MOQ
    result.moq =
      parseInt(product.moq, 10) ||
      parseInt(product.customsMoq, 10) ||
      null;

    // Supplier
    result.supplier_name = seller.companyName || "";
    result.supplier_years = seller.companyJoinYears || "";
    result.supplier_business_type = seller.companyBusinessType || "";
    result.supplier_response_time = seller.responseTimeText || "";
    result.supplier_delivery_rate =
      seller.supplierOnTimeDeliveryRate || "";
    result.supplier_country = seller.companyRegisterCountry || "";

    // Images
    const media = product.mediaItems || [];
    result.images = media
      .filter((m) => m.type === "image" && m.imageUrl)
      .map((m) => {
        const u = m.imageUrl;
        if (typeof u === "object") return u.big || u.normal || "";
        return String(u);
      })
      .filter(Boolean);

    // Video
    const video = media.find((m) => m.type === "video");
    if (video) {
      result.video_id = video.videoId || "";
      result.video_duration = video.duration || "";
    }

    // Specs
    const props = product.productBasicProperties || [];
    result.specs = props
      .map((p) => ({ key: p.attrName || "", value: p.attrValue || "" }))
      .filter((s) => s.key && s.value);

    // Description
    const metaDesc = document.querySelector("meta[name='description']");
    result.description = metaDesc
      ? (metaDesc.getAttribute("content") || "").slice(0, 2000)
      : "";

    // Trade / logistics
    const leadInfo = trade.leadTimeInfo || {};
    result.lead_time =
      typeof leadInfo === "object"
        ? leadInfo.text || leadInfo.desc || ""
        : "";

    const logi = trade.logisticInfo || {};
    result.shipping =
      typeof logi === "object"
        ? logi.freightText || logi.text || ""
        : "";

    result.sales_volume = trade.salesVolume || "";

    // Sample
    const sample = product.sample || {};
    if (sample.enable) {
      result.sample_available = true;
      result.sample_qty = sample.productSamplingOrderQuantity || 1;
    }

    // SKU / variants
    const sku = product.sku || {};
    result.sku_attrs = (sku.skuAttrs || []).map((attr) => ({
      name: attr.attrName || "",
      values: (attr.skuAttrValues || []).map(
        (v) => v.name || v.attrValue || ""
      ),
    }));

    // IDs
    result.product_id = product.productId || "";
    result.category_id = product.productCategoryId || "";

    // Verified badges (values can be boolean true or string "True")
    const isTrue = (v) => v === true || v === "True" || v === "true";
    result.verified_badges = [];
    if (isTrue(seller.baoAccountIsService))
      result.verified_badges.push("Trade Assurance");
    if (isTrue(seller.accountIsCgsMember))
      result.verified_badges.push("Verified Supplier");
    if (isTrue(seller.isCompanyBusinessTypeAuth))
      result.verified_badges.push("Business Type Verified");

    result._extraction_method = "detailData";
    return result;
  }

  // ══════════════════════════════════════════════════════════════
  //  Detail extraction — FALLBACK: DOM selectors
  // ══════════════════════════════════════════════════════════════

  function extractDetailFromDOM() {
    const result = C.baseResult("ALIBABA");
    const jsonLd = C.tryJsonLd();

    result.title = C.txt(DETAIL.title);

    // Price — parse from DOM text
    const priceText = C.txt(DETAIL.price);
    const price = C.parsePrice(priceText);
    result.price_min = price.min;
    result.price_max = price.max;
    result.currency = price.currency;

    result.moq = C.parseMoq(C.txt(DETAIL.moq));
    result.supplier_name = C.txt(DETAIL.supplierName);
    result.supplier_years = C.txt(DETAIL.supplierYears);
    result.verified_badges = C.qAll(DETAIL.verifiedBadges)
      .map((el) => el.textContent.trim())
      .filter(Boolean);
    result.images = C.uniqueImages(C.qAll(DETAIL.images));

    // Description
    let desc = C.txt(DETAIL.description);
    if (!desc && jsonLd) desc = jsonLd.description || "";
    if (!desc) {
      const meta = document.querySelector("meta[name='description']");
      if (meta) desc = meta.getAttribute("content") || "";
    }
    result.description = desc.slice(0, 2000);

    result.lead_time = C.txt(DETAIL.leadTime);
    result.shipping = C.txt(DETAIL.shipping);

    // Specs
    const rows = C.qAll(DETAIL.specRows);
    result.specs = [];
    for (const row of rows) {
      const cells = row.querySelectorAll(
        "span, td, dt, dd, .attr-name, .attr-value"
      );
      if (cells.length >= 2) {
        const key = cells[0].textContent.trim().replace(/:$/, "");
        const value = cells[1].textContent.trim();
        if (key && value) result.specs.push({ key, value });
      }
    }

    // JSON-LD fallback
    if (jsonLd) {
      result.title = result.title || jsonLd.title;
      result.price_min = result.price_min ?? jsonLd.price_min;
      result.price_max = result.price_max ?? jsonLd.price_max;
      result.currency = result.currency || jsonLd.currency;
      if (!result.images.length && jsonLd.images.length) {
        result.images = jsonLd.images;
      }
    }

    result._extraction_method = "dom";
    return result;
  }

  // ══════════════════════════════════════════════════════════════
  //  Description tab — lazy loaded, requires DOM interaction
  // ══════════════════════════════════════════════════════════════

  const DESC_SELECTORS = [
    ".module_description",
    "[data-module-name='module_description']",
  ];

  const MIN_IMG_SIZE = 100;

  function scrollToDescription() {
    for (const sel of DESC_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        return el;
      }
    }
    return null;
  }

  function collectDescriptionContent(root) {
    if (!root) return null;

    const images = [...root.querySelectorAll("img[src]")]
      .filter((img) => {
        const src = img.src || "";
        if (src.startsWith("data:")) return false;
        if (src.includes("icon") && img.width < 50) return false;
        if (img.naturalWidth > 0 && img.naturalWidth < MIN_IMG_SIZE) return false;
        if (img.width > 0 && img.width < MIN_IMG_SIZE) return false;
        return true;
      })
      .map((img) => img.src);

    const uniqueImages = [...new Set(images)];

    const iframes = [...root.querySelectorAll("iframe[src]")];
    let iframeImages = [];
    for (const iframe of iframes) {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) continue;
        const imgs = [...doc.querySelectorAll("img[src]")]
          .map((img) => img.src)
          .filter((src) => !src.startsWith("data:"));
        iframeImages.push(...imgs);
      } catch (e) {}
    }

    const allImages = [...new Set([...uniqueImages, ...iframeImages])];

    const textEls = root.querySelectorAll(
      "p, h1, h2, h3, h4, h5, li, td, th, span, div"
    );
    const textSet = new Set();
    const textBlocks = [];
    for (const el of textEls) {
      if (el.children.length > 3) continue;
      const t = el.textContent.trim();
      if (t.length < 5 || t.length > 2000) continue;
      if (textSet.has(t)) continue;
      textSet.add(t);
      textBlocks.push(t);
    }

    return {
      description_images: allImages,
      description_text: textBlocks.join("\n").slice(0, 10000),
      description_image_count: allImages.length,
    };
  }

  function waitForDescriptionContent(root, timeoutMs) {
    return new Promise((resolve) => {
      const check = () => {
        const imgs = root.querySelectorAll("img[src]");
        const rich =
          root.querySelector(
            ".detail-decorate-root, [class*='rich-text'], iframe"
          ) !== null;
        const loaded = imgs.length > 2 || rich;
        return loaded;
      };

      if (check()) {
        resolve(true);
        return;
      }

      const observer = new MutationObserver(() => {
        if (check()) {
          observer.disconnect();
          resolve(true);
        }
      });
      observer.observe(root, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        resolve(check());
      }, timeoutMs);
    });
  }

  // ── Public API ──

  function extract(detailData) {
    const pageType = C.detectPageType();
    if (pageType === "search") return extractSearch();
    if (pageType === "detail") {
      if (detailData && detailData.globalData) {
        return extractDetailFromData(detailData);
      }
      return extractDetailFromDOM();
    }
    return null;
  }

  return {
    extract,
    extractSearch,
    extractDetailFromData,
    extractDetailFromDOM,
    scrollToDescription,
    waitForDescriptionContent,
    collectDescriptionContent,
  };
})();
