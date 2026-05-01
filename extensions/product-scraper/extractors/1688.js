var ProductScraper = ProductScraper || {};

ProductScraper.alibaba1688 = (() => {
  "use strict";

  const C = ProductScraper.common;

  const SEARCH_CARD = [
    "div.wp-offerlist-windows ul.offer-list-row > li",
    "[class*='offer-list'] > li",
    "[class*='sm-offer-item']",
  ];

  const SEARCH_TITLE = [
    "a.title-link",
    "[class*='title-link']",
    "a[href*='/offer/']",
  ];

  const SEARCH_PRICE = [
    "div.price em",
    "[class*='price'] em",
    "[class*='price']",
  ];

  const SEARCH_SUPPLIER = [
    "div.company-name",
    "a.company-name",
    "[class*='company-name']",
  ];

  const DETAIL = {
    title: [
      "[data-spm='title'] h2",
      "div.od-pc-offer-title h2",
      "[class*='offer-title'] h2",
      "[class*='title-text']",
      "[data-module='od_pc_offer_title'] h2",
      "h2",
    ],
    price: [
      "div.discountPrice-price",
      "[class*='discountPrice']",
      "[class*='price-text']",
      "[class*='rox-price']",
    ],
    supplierName: [
      ".od-shop-navigation h1",
      ".shop-company-name h1",
      "a.shop-company-name h1",
      "[class*='company-name'] h1",
    ],
    images: [
      "img.ant-image-img.preview-img",
      "img.od-gallery-img",
      "ul.od-gallery-list img",
      ".module-od-picture-gallery img",
    ],
    specRows: [
      "div.od-pc-attribute div.offer-attr-item",
      "[class*='offer-attr-item']",
      "div.module-od-product-attributes tr.ant-descriptions-row",
    ],
    skuRows: [
      "div.sku-item-wrapper",
      "[class*='sku-item-wrapper']",
    ],
    skuButtons: [
      "button.sku-filter-button",
      "[class*='sku-filter-button']",
    ],
    packRows: [
      ".module-od-product-pack-info table tr",
      ".module-od-product-pack-info tr",
      "[class*='product-pack-info'] table tr",
      "[class*='product-pack-info'] tr",
    ],
  };

  function extractSearch() {
    const cards = C.qAll(SEARCH_CARD);
    if (cards.length === 0) return null;

    const items = [];
    for (const card of cards) {
      const titleEl = card.querySelector(SEARCH_TITLE.join(","));
      const title = titleEl
        ? (titleEl.getAttribute("title") || titleEl.textContent || "").trim()
        : "";
      if (!title) continue;

      let url = "";
      const linkEl = titleEl && titleEl.tagName === "A"
        ? titleEl
        : card.querySelector("a[href*='/offer/']") || card.querySelector("a[href]");
      if (linkEl) {
        const href = linkEl.getAttribute("href") || "";
        url = href.startsWith("http") ? href : `https:${href}`;
      }

      const priceText = (() => {
        const el = card.querySelector(SEARCH_PRICE.join(","));
        return el ? el.textContent.trim() : "";
      })();
      const price = C.parsePrice(priceText);

      const supplierText = (() => {
        const el = card.querySelector(SEARCH_SUPPLIER.join(","));
        return el
          ? (el.getAttribute("title") || el.textContent || "").trim()
          : "";
      })();

      const thumbEl = card.querySelector(
        "img[data-sf-original-src], img[data-src], img[src]"
      );
      const thumbnail = thumbEl
        ? thumbEl.dataset.sfOriginalSrc || thumbEl.dataset.src || thumbEl.src || ""
        : "";

      items.push({
        title: title.slice(0, 500),
        url,
        price_min: price.min,
        price_max: price.max,
        currency: price.currency || "CNY",
        supplier_name: supplierText,
        thumbnail,
      });
    }

    return {
      source_url: location.href,
      source_platform: "1688",
      page_type: "search",
      items,
      total_found: items.length,
      extracted_at: new Date().toISOString(),
    };
  }

  function extractDetailFromData(bridgeData) {
    var result = C.baseResult("1688");

    if (bridgeData.globalData) {
      var gd = bridgeData.globalData;
      var tm = gd.tempModel || {};
      result.title = tm.offerTitle || "";
      result.supplier_name = tm.companyName || "";
      result.moq = parseInt(tm.beginAmount, 10) || null;

      var imgs = gd.images || [];
      result.images = imgs
        .map(function (i) { return i.fullPathImageURI || ""; })
        .filter(Boolean);

      var skuModel = gd.skuModel || {};
      var skuProps = skuModel.skuProps || [];
      result.sku_attrs = skuProps.map(function (prop) {
        return {
          name: prop.prop || "",
          values: (prop.value || []).map(function (v) {
            return v.name || v.imageUrl || "";
          }),
        };
      });

      var skuInfoMap = skuModel.skuInfoMap || {};
      var prices = [];
      for (var key in skuInfoMap) {
        var sku = skuInfoMap[key];
        var p = parseFloat(sku.price);
        if (!isNaN(p) && p > 0) prices.push(p);
      }
      if (prices.length > 0) {
        result.price_min = Math.min.apply(null, prices);
        result.price_max = prices.length > 1 ? Math.max.apply(null, prices) : null;
        result.currency = "CNY";
      }

      var opm = gd.orderParamModel || {};
      var op = opm.orderParam || {};
      if (!result.moq && op.beginAmount) {
        result.moq = parseInt(op.beginAmount, 10) || null;
      }
      result.unit = tm.offerUnit || op.unit || "";
    }

    if (bridgeData.contextData) {
      var ctx = bridgeData.contextData;

      if (!result.title && ctx.title) {
        result.title = ctx.title;
      }

      var pm = ctx.priceModel || {};
      if (!result.price_min && pm.currentPrices && pm.currentPrices.length > 0) {
        var cprices = pm.currentPrices
          .map(function (p) { return parseFloat(p.price); })
          .filter(function (p) { return !isNaN(p) && p > 0; });
        if (cprices.length > 0) {
          result.price_min = Math.min.apply(null, cprices);
          result.price_max = cprices.length > 1 ? Math.max.apply(null, cprices) : null;
          result.currency = "CNY";
        }
      }

      if (!result.images.length && ctx.mainImage && ctx.mainImage.length > 0) {
        result.images = ctx.mainImage;
      }
      if (!result.images.length && ctx.offerImgList && ctx.offerImgList.length > 0) {
        result.images = ctx.offerImgList;
      }

      if (ctx.offerId) {
        result.product_id = String(ctx.offerId);
      }

      result.sales_volume = ctx.saleNum || "";
      result.unit = result.unit || ctx.unit || "";
      result._detail_url = ctx.detailUrl || "";

      result.pack_info = extractPackInfoFromBridge(ctx.packInfo);
      if (result.pack_info.length === 0) {
        result.pack_info = extractPackInfoFromDOM();
      }

      if (ctx.video && ctx.video.videoUrl) {
        result.video_url = ctx.video.videoUrl;
        result.video_cover = ctx.video.coverUrl || "";
      }

      var fpm = ctx.finalPriceModel || {};
      var twp = fpm.tradeWithoutPromotion || {};
      var skuMap = twp.skuMapOriginal || [];
      if (skuMap.length > 0) {
        if (!result.price_min) {
          var skuPrices = skuMap
            .map(function (s) { return parseFloat(s.discountPrice || s.price); })
            .filter(function (p) { return !isNaN(p) && p > 0; });
          if (skuPrices.length > 0) {
            result.price_min = Math.min.apply(null, skuPrices);
            result.price_max = skuPrices.length > 1 ? Math.max.apply(null, skuPrices) : null;
          }
        }
        result.sku_attrs = [{
          name: "variant",
          values: skuMap
            .map(function (s) { return s.specAttrs || ""; })
            .filter(Boolean),
        }];
      }

      var opwp = ctx.originalPricesWithoutPromotion || pm.currentPrices || [];
      if (!result.moq && opwp.length > 0 && opwp[0].beginAmount) {
        result.moq = parseInt(opwp[0].beginAmount, 10) || null;
      }
    }

    var productId = location.pathname.match(/\/offer\/(\d+)/);
    if (!result.product_id) {
      result.product_id = productId ? productId[1] : "";
    }

    var metaDesc = document.querySelector("meta[name='description']");
    result.description = metaDesc
      ? (metaDesc.getAttribute("content") || "").slice(0, 2000)
      : "";

    if (!result.title) {
      result.title = C.txt(DETAIL.title);
    }
    if (!result.supplier_name) {
      result.supplier_name = C.txt(DETAIL.supplierName);
    }

    result._extraction_method = "bridgeData";
    return result;
  }

  function extractDetailFromDOM() {
    var result = C.baseResult("1688");

    result.title = C.txt(DETAIL.title);

    var priceText = C.txt(DETAIL.price);
    var price = C.parsePrice(priceText);
    result.price_min = price.min;
    result.price_max = price.max;
    result.currency = price.currency || "CNY";

    result.supplier_name = C.txt(DETAIL.supplierName);

    var imgEls = C.qAll(DETAIL.images);
    result.images = [];
    var seen = {};
    for (var i = 0; i < imgEls.length; i++) {
      var img = imgEls[i];
      var src = img.dataset.sfOriginalSrc || img.src || "";
      if (!src || src.indexOf("data:") === 0) continue;
      var clean = src.split("?")[0];
      if (seen[clean]) continue;
      seen[clean] = true;
      result.images.push(src);
    }
    result.images = result.images.slice(0, 20);

    var specRows = C.qAll(DETAIL.specRows);
    result.specs = [];
    for (var j = 0; j < specRows.length; j++) {
      var row = specRows[j];
      var nameEl = row.querySelector(
        "span.offer-attr-item-name, th.ant-descriptions-item-label, span.field-name"
      );
      var valEl = row.querySelector(
        "span.offer-attr-item-value, td.ant-descriptions-item-content, span.field-value"
      );
      if (nameEl && valEl) {
        var key = nameEl.textContent.trim().replace(/:$/, "");
        var value = valEl.textContent.trim();
        if (key && value) result.specs.push({ key: key, value: value });
      }
    }

    result.pack_info = extractPackInfoFromDOM();

    var skuPrices = C.qAll(DETAIL.skuRows);
    var skuPriceVals = [];
    for (var k = 0; k < skuPrices.length; k++) {
      var priceEl = skuPrices[k].querySelector(
        "div.discountPrice-price, [class*='discountPrice']"
      );
      if (priceEl) {
        var pp = C.parsePrice(priceEl.textContent.trim());
        if (pp.min !== null) skuPriceVals.push(pp.min);
      }
    }
    if (skuPriceVals.length > 0 && result.price_min === null) {
      result.price_min = Math.min.apply(null, skuPriceVals);
      result.price_max = skuPriceVals.length > 1
        ? Math.max.apply(null, skuPriceVals)
        : null;
    }

    var skuBtns = C.qAll(DETAIL.skuButtons);
    if (skuBtns.length > 0) {
      result.sku_attrs = [{
        name: "variant",
        values: skuBtns.map(function (btn) {
          var label = btn.querySelector("span.label-name");
          return label ? label.textContent.trim() : btn.textContent.trim();
        }).filter(Boolean),
      }];
    }

    var productId = location.pathname.match(/\/offer\/(\d+)/);
    result.product_id = productId ? productId[1] : "";

    var metaDesc = document.querySelector("meta[name='description']");
    result.description = metaDesc
      ? (metaDesc.getAttribute("content") || "").slice(0, 2000)
      : "";

    result._extraction_method = "dom";
    return result;
  }

  function extractPackInfoFromDOM() {
    var items = [];
    var rows = C.qAll(DETAIL.packRows);
    if (rows.length === 0) return items;

    var headers = [];
    var dataRows = [];
    for (var i = 0; i < rows.length; i++) {
      var ths = rows[i].querySelectorAll("th");
      var tds = rows[i].querySelectorAll("td");
      if (ths.length > 0 && tds.length === 0) {
        headers = [];
        for (var h = 0; h < ths.length; h++) {
          headers.push(ths[h].textContent.trim());
        }
      } else if (tds.length > 0) {
        dataRows.push(rows[i]);
      }
    }

    if (headers.length > 1 && dataRows.length > 0) {
      for (var d = 0; d < dataRows.length; d++) {
        var tds = dataRows[d].querySelectorAll("td");
        var rowKey = tds[0] ? tds[0].textContent.trim() : "";
        var parts = [];
        for (var c = 1; c < tds.length && c < headers.length; c++) {
          var val = tds[c] ? tds[c].textContent.trim() : "";
          if (val) parts.push(headers[c] + ":" + val);
        }
        if (rowKey && parts.length > 0) {
          items.push({ key: rowKey, value: parts.join(", ") });
        }
      }
    } else {
      for (var r = 0; r < rows.length; r++) {
        var rths = rows[r].querySelectorAll("th");
        var rtds = rows[r].querySelectorAll("td");
        for (var j = 0; j < rths.length && j < rtds.length; j++) {
          var key = rths[j].textContent.trim().replace(/:$/, "");
          var val = rtds[j] ? rtds[j].textContent.trim() : "";
          if (key && val) items.push({ key: key, value: val });
        }
      }
    }

    return items;
  }

  function extractPackInfoFromBridge(packInfo) {
    var items = [];
    if (!packInfo) return items;

    var pws = packInfo.pieceWeightScale;
    if (!pws) return items;

    var rows = pws.pieceWeightScaleInfo || [];
    var cols = pws.columnList || [];
    if (rows.length === 0 || cols.length === 0) return items;

    // Build label map from columnList: { "length": "长(cm)", "width": "宽(cm)", ... }
    var labelMap = {};
    for (var c = 0; c < cols.length; c++) {
      labelMap[cols[c].name] = cols[c].label || cols[c].name;
    }

    // First column is the SKU identifier (e.g. "sku1" → "产品规格")
    var skuCol = cols.length > 0 ? cols[0].name : "sku1";

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var rowKey = row[skuCol] != null ? String(row[skuCol]) : "";
      var parts = [];

      for (var j = 1; j < cols.length; j++) {
        var colName = cols[j].name;
        var colLabel = labelMap[colName] || colName;
        var val = row[colName];
        if (val != null && colName !== "skuId") {
          parts.push(colLabel + ":" + val);
        }
      }

      if (rowKey && parts.length > 0) {
        items.push({ key: rowKey, value: parts.join(", ") });
      }
    }

    return items;
  }

  var DESC_SELECTORS = [
    "div.content-detail",
    "div#detail",
    "div.module-od-product-description",
    "[data-module='od_product_description']",
  ];

  var MIN_IMG_SIZE = 100;

  function scrollToDescription() {
    for (var i = 0; i < DESC_SELECTORS.length; i++) {
      var el = document.querySelector(DESC_SELECTORS[i]);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        return el;
      }
    }
    return null;
  }

  function collectDescriptionContent(root) {
    if (!root) return null;

    var images = [];
    var imgEls = root.querySelectorAll("img");
    for (var i = 0; i < imgEls.length; i++) {
      var img = imgEls[i];
      var src = img.dataset.sfOriginalSrc || img.dataset.lazyloadSrc || img.src || "";
      if (!src || src.indexOf("data:") === 0) continue;
      if (img.naturalWidth > 0 && img.naturalWidth < MIN_IMG_SIZE) continue;
      if (img.width > 0 && img.width < MIN_IMG_SIZE) continue;
      images.push(src);
    }
    var uniqueImages = images.filter(function (v, i, a) { return a.indexOf(v) === i; });

    var textSet = {};
    var textBlocks = [];
    var textEls = root.querySelectorAll("p, h1, h2, h3, h4, li, td, th, span, div");
    for (var j = 0; j < textEls.length; j++) {
      var el = textEls[j];
      if (el.children.length > 3) continue;
      var t = el.textContent.trim();
      if (t.length < 5 || t.length > 2000) continue;
      if (textSet[t]) continue;
      textSet[t] = true;
      textBlocks.push(t);
    }

    return {
      description_images: uniqueImages,
      description_text: textBlocks.join("\n").slice(0, 10000),
      description_image_count: uniqueImages.length,
    };
  }

  function waitForDescriptionContent(root, timeoutMs) {
    return new Promise(function (resolve) {
      var check = function () {
        var imgs = root.querySelectorAll("img[src]");
        return imgs.length > 2;
      };

      if (check()) {
        resolve(true);
        return;
      }

      var observer = new MutationObserver(function () {
        if (check()) {
          observer.disconnect();
          resolve(true);
        }
      });
      observer.observe(root, { childList: true, subtree: true });

      setTimeout(function () {
        observer.disconnect();
        resolve(check());
      }, timeoutMs);
    });
  }

  function extractDetailFromModel(md) {
    var result = C.baseResult("1688");

    result.title = md.subject || "";
    result.product_id = md.offerId ? String(md.offerId) : "";

    result.images = md.images && md.images.length > 0 ? md.images : (md.mainImages || []);

    var minP = parseFloat(md.minPrice);
    var maxP = parseFloat(md.maxPrice);
    result.price_min = !isNaN(minP) && minP > 0 ? minP : null;
    result.price_max = !isNaN(maxP) && maxP > 0 && maxP !== minP ? maxP : null;
    result.currency = "CNY";

    result.moq = md.beginAmount || null;
    result.unit = md.unit || "";
    result.sales_volume = md.saleCount || 0;
    result.category_id = md.categoryId ? String(md.categoryId) : "";
    result.category_name = md.categoryName || "";

    result.supplier_name = md.companyName || "";
    result.seller_login_id = md.loginId || "";
    result.seller_user_id = md.userId ? String(md.userId) : "";
    result.seller_store_url = md.winportUrl || "";

    result.specs = (md.featureAttributes || []).map(function (a) {
      return { key: a.name, value: a.value };
    });

    result.pack_info = extractPackInfoFromBridge(md.packInfo);
    if (result.pack_info.length === 0) {
      result.pack_info = extractPackInfoFromDOM();
    }

    result.sku_attrs = (md.skuProps || []).map(function (p) {
      return {
        name: p.prop || "",
        values: (p.values || []).map(function (v) { return v.name || ""; }).filter(Boolean),
      };
    });

    var skuMap = md.skuMap || [];
    if (skuMap.length > 0) {
      result.sku_list = skuMap;
      if (result.price_min === null) {
        var skuPrices = skuMap
          .map(function (s) { return parseFloat(s.discountPrice || s.price); })
          .filter(function (p) { return !isNaN(p) && p > 0; });
        if (skuPrices.length > 0) {
          result.price_min = Math.min.apply(null, skuPrices);
          result.price_max = skuPrices.length > 1 ? Math.max.apply(null, skuPrices) : null;
        }
      }
    }

    result.price_tiers = (md.currentPrices || []).map(function (cp) {
      return { beginAmount: cp.beginAmount, price: cp.price };
    });

    if (md.video) {
      result.video_url = md.video.videoUrl || "";
      result.video_cover = md.video.coverUrl || "";
    }

    result.good_rates = md.goodRates;
    result.goods_grade = md.goodsGrade;
    result.favor_count = md.favorCount || 0;

    var si = md.shopBaseInfo || {};
    result.shop_repeat_rate = si.byrRepeatRate3m || "";
    result.shop_card_type = si.cardType || "";

    var fi = md.freightInfo || {};
    result.location = fi.location || "";
    result.delivery_fee = fi.totalCost || null;
    result.unit_weight = fi.unitWeight || null;

    if (md.mixModel && md.mixModel.supportMix) {
      result.mix_amount = md.mixModel.mixAmount || null;
      result.mix_number = md.mixModel.mixNumber || null;
    }

    result._detail_url = md.detailUrl || "";

    var metaDesc = document.querySelector("meta[name='description']");
    result.description = metaDesc
      ? (metaDesc.getAttribute("content") || "").slice(0, 2000)
      : "";

    if (!result.title) result.title = C.txt(DETAIL.title);
    if (!result.supplier_name) result.supplier_name = C.txt(DETAIL.supplierName);

    result._extraction_method = "model";
    return result;
  }

  function extract(bridgeData) {
    var pageType = C.detectPageType();
    if (pageType === "search") return extractSearch();
    if (pageType === "detail") {
      if (bridgeData && bridgeData.modelData) {
        return extractDetailFromModel(bridgeData.modelData);
      }
      if (bridgeData && (bridgeData.globalData || bridgeData.contextData)) {
        return extractDetailFromData(bridgeData);
      }
      return extractDetailFromDOM();
    }
    return null;
  }

  return {
    extract: extract,
    extractSearch: extractSearch,
    extractDetailFromModel: extractDetailFromModel,
    extractDetailFromData: extractDetailFromData,
    extractDetailFromDOM: extractDetailFromDOM,
    scrollToDescription: scrollToDescription,
    waitForDescriptionContent: waitForDescriptionContent,
    collectDescriptionContent: collectDescriptionContent,
  };
})();
