(function initializeCoupangCatalogCollector(root) {
  "use strict";

  const MAX_ATTRIBUTES_PER_OPTION = 100;
  const MAX_MEDIA_PER_OWNER = 100;

  function stableStringify(value) {
    if (value === null || typeof value !== "object") {
      return JSON.stringify(value) ?? "null";
    }
    if (Array.isArray(value)) {
      return `[${value.map((item) => stableStringify(item)).join(",")}]`;
    }
    return `{${Object.entries(value)
      .filter(([, nested]) => nested !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)
      .join(",")}}`;
  }

  async function sha256Hex(value) {
    const bytes = new TextEncoder().encode(stableStringify(value));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  function extractSellerProductFromScripts(sources) {
    for (const source of Array.isArray(sources) ? sources : []) {
      const text = String(source || "");
      let keyIndex = text.indexOf('"oSellerProduct"');
      while (keyIndex >= 0) {
        const colonIndex = text.indexOf(":", keyIndex + 16);
        const objectStart = colonIndex >= 0 ? text.indexOf("{", colonIndex + 1) : -1;
        if (objectStart >= 0) {
          const objectEnd = findBalancedObjectEnd(text, objectStart);
          if (objectEnd > objectStart) {
            try {
              return JSON.parse(text.slice(objectStart, objectEnd));
            } catch {
              // Another inline script can contain a non-data reference; keep searching.
            }
          }
        }
        keyIndex = text.indexOf('"oSellerProduct"', keyIndex + 16);
      }
    }
    return null;
  }

  function findBalancedObjectEnd(source, start) {
    let depth = 0;
    let quote = null;
    let escaped = false;
    for (let index = start; index < source.length; index += 1) {
      const character = source[index];
      if (quote) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === quote) quote = null;
        continue;
      }
      if (character === '"' || character === "'") {
        quote = character;
      } else if (character === "{") {
        depth += 1;
      } else if (character === "}") {
        depth -= 1;
        if (depth === 0) return index + 1;
      }
    }
    return -1;
  }

  function buildCatalogProduct(sellerProduct) {
    if (!sellerProduct || typeof sellerProduct !== "object") {
      throw new Error("Wing 상품 상세 데이터가 없습니다");
    }
    const externalProductId = requiredId(
      sellerProduct.sellerProductId,
      "sellerProductId",
    );
    const items = Array.isArray(sellerProduct.items) ? sellerProduct.items : [];
    if (items.length === 0) {
      throw new Error(`Wing 상품 ${externalProductId}에 옵션이 없습니다`);
    }

    const options = items.map((item) => buildCatalogOption(item));
    const media = buildProductMedia(items);
    const categoryParts = [
      optionalId(sellerProduct.displayCategoryCode),
      optionalId(sellerProduct.categoryId),
    ].filter(Boolean);

    return {
      externalProductId,
      registeredName: nullableText(sellerProduct.sellerProductName),
      displayName: nullableText(
        sellerProduct.displayProductName || sellerProduct.generalProductName,
      ),
      category: categoryParts.length > 0 ? categoryParts.join("/") : null,
      manufacturer: nullableText(sellerProduct.manufacture),
      brand: nullableText(sellerProduct.brand),
      productStatus: nullableText(sellerProduct.statusName || sellerProduct.status),
      options,
      media,
      raw: {
        source: "wing_app_data",
        sellerProductId: externalProductId,
        productId: optionalId(sellerProduct.productId),
        displayCategoryCode: optionalId(sellerProduct.displayCategoryCode),
        categoryId: optionalId(sellerProduct.categoryId),
        itemCount: items.length,
        generalProductName: nullableText(sellerProduct.generalProductName),
        productOrigin: nullableText(sellerProduct.productOrigin),
        saleStartedAt: nullableText(sellerProduct.saleStartedAt),
        saleEndedAt: nullableText(sellerProduct.saleEndedAt),
        status: nullableText(sellerProduct.status),
        deliveryMethod: nullableText(sellerProduct.deliveryMethod),
        deliveryCompanyCode: nullableText(sellerProduct.deliveryCompanyCode),
        deliveryChargeType: nullableText(sellerProduct.deliveryChargeType),
        deliveryCharge: nullableInteger(sellerProduct.deliveryCharge),
        freeShipOverAmount: nullableInteger(sellerProduct.freeShipOverAmount),
        returnCharge: nullableInteger(sellerProduct.returnCharge),
      },
    };
  }

  function buildCatalogOption(item) {
    const externalOptionId = requiredId(
      item?.vendorItemId ?? item?.sellerProductItemId ?? item?.itemId,
      "vendorItemId",
    );
    const media = uniqueMedia(
      (Array.isArray(item?.images) ? item.images : [])
        .map((image, index) => ({
          sourceUrl: normalizeImageUrl(image?.cdnPath || image?.vendorPath),
          role: "option",
          sortOrder: numericOrder(image?.imageOrder, index),
          externalOptionId,
        }))
        .filter((entry) => entry.sourceUrl),
    );
    const attributes = (Array.isArray(item?.attributes) ? item.attributes : [])
      .map((attribute) => ({
        type: nullableText(attribute?.attributeTypeName || attribute?.attributeTypeId),
        value: nullableText(attribute?.attributeValueName),
      }))
      .filter((attribute) => attribute.type && attribute.value)
      .map((attribute) => ({ type: attribute.type, value: attribute.value }))
      .slice(0, MAX_ATTRIBUTES_PER_OPTION);

    return {
      externalOptionId,
      optionName: nullableText(item?.itemName),
      skuStatus: nullableText(item?.statusName || item?.status || item?.offerCondition),
      salePrice: nullableInteger(item?.salePrice),
      sellerSku: nullableText(item?.externalVendorSku),
      modelNumber: nullableText(item?.modelNo),
      barcode: nullableText(item?.barcode),
      attributes,
      media,
      raw: {
        sellerProductItemId: optionalId(item?.sellerProductItemId),
        vendorItemId: externalOptionId,
        itemId: optionalId(item?.itemId),
        originalVendorItemId: optionalId(item?.originalVendorItemId),
        externalVendorSku: nullableText(item?.externalVendorSku),
        originalPrice: nullableInteger(item?.originalPrice),
        salePrice: nullableInteger(item?.salePrice),
        supplyPrice: nullableInteger(item?.supplyPrice),
        maximumBuyCount: nullableInteger(item?.maximumBuyCount),
        offerCondition: nullableText(item?.offerCondition),
        taxType: nullableText(item?.taxType),
      },
    };
  }

  function buildProductMedia(items) {
    const media = [];
    let primaryAdded = false;
    for (const item of items) {
      const externalOptionId = requiredId(
        item?.vendorItemId ?? item?.sellerProductItemId ?? item?.itemId,
        "vendorItemId",
      );
      const images = Array.isArray(item?.images) ? item.images : [];
      for (const image of images) {
        const sourceUrl = normalizeImageUrl(image?.cdnPath || image?.vendorPath);
        if (!sourceUrl || primaryAdded) continue;
        media.push({
          sourceUrl,
          role: "primary",
          sortOrder: 0,
          externalOptionId,
        });
        primaryAdded = true;
      }
    }
    for (const item of items) {
      const externalOptionId = requiredId(
        item?.vendorItemId ?? item?.sellerProductItemId ?? item?.itemId,
        "vendorItemId",
      );
      for (const sourceUrl of extractDetailImageUrls(item?.contents)) {
        media.push({
          sourceUrl,
          role: "detail",
          sortOrder: media.length,
          externalOptionId,
        });
      }
    }
    return uniqueMedia(media);
  }

  function extractDetailImageUrls(contents) {
    const urls = [];
    for (const content of Array.isArray(contents) ? contents : []) {
      for (const detail of Array.isArray(content?.contentDetails)
        ? content.contentDetails
        : []) {
        const html = String(detail?.content || "");
        for (const match of html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
          const url = normalizeImageUrl(match[1]);
          if (url) urls.push(url);
        }
      }
    }
    return [...new Set(urls)];
  }

  function uniqueMedia(media) {
    const seen = new Set();
    return media.filter((entry) => {
      const key = `${entry.role}:${entry.externalOptionId || ""}:${entry.sourceUrl}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, MAX_MEDIA_PER_OWNER);
  }

  function buildDiscoveryItems(records, page, pageSize) {
    const offset = (Number(page) - 1) * Number(pageSize);
    return (Array.isArray(records) ? records : []).map((record, index) => ({
      ordinal: offset + index,
      externalProductId: requiredId(record?.externalProductId, "externalProductId"),
      registeredName: nullableText(record?.registeredName),
      primaryImageUrl: normalizeImageUrl(record?.primaryImageUrl),
    }));
  }

  async function buildManifest({ totalItems, pageSize, firstPageItems }) {
    const normalizedTotal = Number(totalItems);
    const normalizedPageSize = Number(pageSize);
    if (!Number.isInteger(normalizedTotal) || normalizedTotal <= 0) {
      throw new Error("Wing 전체 상품 수를 확인할 수 없습니다");
    }
    if (!Number.isInteger(normalizedPageSize) || normalizedPageSize <= 0) {
      throw new Error("Wing 페이지 크기를 확인할 수 없습니다");
    }
    return {
      totalItems: normalizedTotal,
      pageSize: normalizedPageSize,
      expectedPages: Math.ceil(normalizedTotal / normalizedPageSize),
      firstPageFingerprint: await sha256Hex({
        version: 1,
        items: firstPageItems,
      }),
    };
  }

  function normalizeImageUrl(value) {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) return null;
    if (text.startsWith("//")) return `https:${text}`;
    if (/^https?:\/\//i.test(text)) return text;
    return `https://image1.coupangcdn.com/image/${text.replace(/^\/+/, "")}`;
  }

  function nullableText(value) {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    return text || null;
  }

  function optionalId(value) {
    if (value === null || value === undefined || value === "") return null;
    return String(value);
  }

  function nullableInteger(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 ? number : null;
  }

  function requiredId(value, name) {
    const id = optionalId(value);
    if (!id) throw new Error(`Wing ${name} 값이 없습니다`);
    return id;
  }

  function numericOrder(value, fallback) {
    const order = Number(value);
    return Number.isInteger(order) && order >= 0 ? order : fallback;
  }

  root.KidItemCoupangCatalog = {
    buildCatalogProduct,
    buildDiscoveryItems,
    buildManifest,
    extractSellerProductFromScripts,
    normalizeImageUrl,
    sha256Hex,
    stableStringify,
  };
})(globalThis);
