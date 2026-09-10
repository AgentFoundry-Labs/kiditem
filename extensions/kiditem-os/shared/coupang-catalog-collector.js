(function initializeCoupangCatalogCollector(root) {
  "use strict";

  const COUPANG_CATALOG_CONTRACT_REVISION = 3;
  const MAX_ATTRIBUTES_PER_OPTION = 100;
  const MAX_MEDIA_PER_OWNER = 100;
  const MAX_DOCUMENTS_PER_PRODUCT = 2_000;
  const MAX_DOCUMENT_BYTES = 64 * 1024;
  const MAX_RAW_BYTES = 64 * 1024;
  const MAX_PRODUCT_BYTES = 512 * 1024;
  const MAX_CHUNK_BYTES = 1024 * 1024;
  const MAX_PRODUCTS_PER_CHUNK = 20;
  const WING_CATALOG_PAGE_SIZE = 500;

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

  function jsonByteLength(value) {
    return new TextEncoder().encode(stableStringify(value)).byteLength;
  }

  function assertJsonBytes(value, maxBytes, message) {
    const bytes = jsonByteLength(value);
    if (bytes > maxBytes) {
      const error = new Error(`${message} (${bytes}/${maxBytes} bytes)`);
      error.code = "WING_CATALOG_PAYLOAD_TOO_LARGE";
      error.bytes = bytes;
      error.maxBytes = maxBytes;
      throw error;
    }
    return value;
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

  /**
   * Normalize the exact Wing inventory-list row into the first-stage catalog
   * shape.  The list response is the authority for sale state, stock, price,
   * SKU and barcode; detail approval state is intentionally not inferred here.
   */
  function buildCatalogBasicProduct(inventoryProduct) {
    if (!inventoryProduct || typeof inventoryProduct !== "object" ||
      Array.isArray(inventoryProduct)) {
      throw new Error("Wing 상품 목록 행이 없습니다");
    }
    const externalProductId = strictRequiredId(
      inventoryProduct.vendorInventoryId,
      "vendorInventoryId",
    );
    const items = Array.isArray(inventoryProduct.vendorInventoryItems)
      ? inventoryProduct.vendorInventoryItems
      : [];
    if (items.length === 0) {
      throw new Error(`Wing 상품 ${externalProductId}에 vendorInventoryItems가 없습니다`);
    }

    const saleStatus = saleStatusFromWingProductStatus(
      requiredText(inventoryProduct.productStatus, "Wing 판매 상태"),
    );
    const optionIds = new Set();
    const options = items.map((item) => {
      const option = buildCatalogBasicOption(item);
      if (optionIds.has(option.externalOptionId)) {
        throw new Error(`Wing 상품 ${externalProductId} 옵션 identity conflict: ${option.externalOptionId}`);
      }
      optionIds.add(option.externalOptionId);
      return option;
    });
    const primary = normalizeImageUrl(inventoryProduct.representativeImage);
    const media = primary
      ? [{ sourceUrl: primary, role: "primary", sortOrder: 0, externalOptionId: null }]
      : [];
    const raw = {
      source: "wing_inventory_list",
      vendorInventoryId: externalProductId,
      productStatus: nullableText(inventoryProduct.productStatus),
      saleStatus,
      categoryName: nullableText(inventoryProduct.categoryName),
      displayCategoryCode: optionalId(inventoryProduct.displayCategoryCode),
      categoryId: optionalId(inventoryProduct.categoryId),
      manufacture: nullableText(inventoryProduct.manufacture),
      brand: nullableText(inventoryProduct.brand),
      saleDates: inventoryProduct.saleDates ?? null,
      createdOn: nullableText(inventoryProduct.createdOn),
      modifiedOn: nullableText(inventoryProduct.modifiedOn),
      itemCount: items.length,
    };
    assertJsonBytes(raw, MAX_RAW_BYTES, `Wing 기본 상품 ${externalProductId} raw 데이터가 허용 크기를 초과했습니다`);
    const product = {
      externalProductId,
      registeredName: nullableText(inventoryProduct.productName),
      displayName: nullableText(inventoryProduct.productName),
      category: nullableText(inventoryProduct.categoryName) || categoryCode(inventoryProduct),
      manufacturer: nullableText(inventoryProduct.manufacture),
      brand: nullableText(inventoryProduct.brand),
      // Keep the provider code in productStatus; saleStatus is the
      // independently derived list-state label. Detail APPROVED is never
      // written into either basic field.
      productStatus: nullableText(inventoryProduct.productStatus),
      options,
      media,
      raw,
    };
    assertJsonBytes(product, MAX_PRODUCT_BYTES, `Wing 기본 상품 ${externalProductId}가 허용 크기를 초과했습니다`);
    return product;
  }

  function buildCatalogBasicOption(item) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("Wing vendorInventoryItem 행이 올바르지 않습니다");
    }
    const externalOptionId = requiredOptionId(item, "basic");
    const vendorItemId = strictOptionalId(item.vendorItemId, "vendorItemId");
    const vendorInventoryItemId = strictRequiredId(
      item.vendorInventoryItemId,
      "vendorInventoryItemId",
    );
    const raw = {
      vendorInventoryItemId,
      vendorItemId,
      skuId: strictOptionalId(item.skuId, "skuId"),
      itemName: nullableText(item.itemName),
      externalSkuCode: nullableText(item.externalSkuCode),
      barcode: nullableText(item.barcode),
      status: nullableText(item.status),
      soldOut: strictNullableBoolean(item.soldOut, "soldOut"),
      qcOperationStatus: nullableText(item.qcOperationStatus),
      approvalStatus: nullableText(item.approvalStatus),
      stockQuantity: nullableInteger(item.stockQuantity),
      salePrice: nullableInteger(item.salePrice),
      autoPricingActive: strictNullableBoolean(item.autoPricingActive, "autoPricingActive"),
      exposureStatuses: item.exposureStatuses ?? null,
      externalOptionIdentitySource: vendorItemId ? "vendor_item" : "inventory_item",
    };
    assertJsonBytes(raw, MAX_RAW_BYTES, `Wing 기본 옵션 ${externalOptionId} raw 데이터가 허용 크기를 초과했습니다`);
    return {
      externalOptionId,
      optionName: nullableText(item.itemName),
      skuStatus: nullableText(item.status || item.approvalStatus),
      salePrice: nullableInteger(item.salePrice),
      sellerSku: nullableText(item.externalSkuCode),
      modelNumber: null,
      barcode: nullableText(item.barcode),
      stock: nullableInteger(item.stockQuantity),
      stockQuantity: nullableInteger(item.stockQuantity),
      vendorInventoryItemId,
      vendorItemId,
      skuId: strictOptionalId(item.skuId, "skuId"),
      externalSkuCode: nullableText(item.externalSkuCode),
      soldOut: strictNullableBoolean(item.soldOut, "soldOut"),
      attributes: [],
      media: [],
      raw,
    };
  }

  /**
   * Normalize the exact seller-product JSON response.  Detail documents are
   * value-deduplicated once per product while each option retains every
   * document association.  Media is deduplicated by role + URL and retains
   * all option owners rather than flattening them away.
   */
  function buildCatalogDetailProduct(sellerProduct) {
    if (!sellerProduct || typeof sellerProduct !== "object" || Array.isArray(sellerProduct)) {
      throw new Error("Wing 상품 상세 JSON이 없습니다");
    }
    const externalProductId = strictRequiredId(sellerProduct.sellerProductId, "sellerProductId");
    const items = Array.isArray(sellerProduct.items) ? sellerProduct.items : [];
    if (items.length === 0) throw new Error(`Wing 상품 ${externalProductId}에 옵션이 없습니다`);

    const documents = [];
    const documentByKey = new Map();
    const mediaByKey = new Map();
    const options = [];
    const optionIds = new Set();
    let mediaOrder = 0;
    for (const item of items) {
      const externalOptionId = requiredOptionId(item, "detail");
      if (optionIds.has(externalOptionId)) {
        throw new Error(`Wing 상세 상품 ${externalProductId} 옵션 identity conflict: ${externalOptionId}`);
      }
      optionIds.add(externalOptionId);
      const documentIds = [];
      for (const field of DETAIL_DOCUMENT_FIELDS) {
        // Preserve the provider field as one JSON value.  In particular, an
        // empty array, an explicit null, array order, and duplicate array
        // entries are all meaningful observations and must not be flattened
        // or discarded as a side effect of normalization.  A missing or
        // undefined field is the only value that is omitted.
        if (!Object.prototype.hasOwnProperty.call(item, field) || item[field] === undefined) {
          continue;
        }
        const value = item[field];
        const key = `${field}\u0000${stableStringify(value)}`;
        let document = documentByKey.get(key);
        if (!document) {
          document = {
            id: makeStableDocumentId(field, value, documents.length),
            kind: field,
            value,
          };
          assertJsonBytes(document.value, MAX_DOCUMENT_BYTES,
            `Wing 상세 문서 ${field}가 허용 크기를 초과했습니다`);
          documentByKey.set(key, document);
          documents.push(document);
        }
        documentIds.push(document.id);
      }

      for (const image of Array.isArray(item?.images) ? item.images : []) {
        addDetailMedia(mediaByKey, "option",
          normalizeImageUrl(image?.cdnPath || image?.vendorPath), externalOptionId, mediaOrder++);
      }
      for (const sourceUrl of extractDetailImageUrls(item?.contents)) {
        addDetailMedia(mediaByKey, "detail", sourceUrl, externalOptionId, mediaOrder++);
      }

      options.push({
        externalOptionId,
        sellerProductItemId: strictOptionalId(item?.sellerProductItemId, "sellerProductItemId"),
        vendorItemId: strictOptionalId(item?.vendorItemId, "vendorItemId"),
        externalVendorSku: nullableText(item?.externalVendorSku),
        barcode: nullableText(item?.barcode),
        modelNumber: nullableText(item?.modelNo),
        attributes: normalizeDetailAttributes(item?.attributes),
        documentIds,
        raw: buildDetailOptionRaw(item),
      });
    }
    const media = [...mediaByKey.values()].map((entry, index) => ({
      sourceUrl: entry.sourceUrl,
      role: entry.role,
      sortOrder: index,
      externalOptionIds: [...entry.externalOptionIds].sort(),
    }));
    const mediaCountByOption = new Map();
    for (const entry of media) {
      for (const owner of entry.externalOptionIds) {
        const count = (mediaCountByOption.get(owner) || 0) + 1;
        if (count > MAX_MEDIA_PER_OWNER) {
          throw new Error(
            "Wing 상세 상품 " + externalProductId + " 옵션 " + owner +
            "의 미디어가 허용 개수를 초과했습니다",
          );
        }
        mediaCountByOption.set(owner, count);
      }
    }
    if (documents.length > MAX_DOCUMENTS_PER_PRODUCT) {
      throw new Error(`Wing 상세 상품 ${externalProductId}의 문서가 허용 개수를 초과했습니다`);
    }

    const raw = {
      source: "wing_seller_product_json",
      sellerProductId: externalProductId,
      productId: optionalId(sellerProduct.productId),
      status: nullableText(sellerProduct.status),
      statusName: nullableText(sellerProduct.statusName),
      saleStartedAt: nullableText(sellerProduct.saleStartedAt),
      displayCategoryCode: optionalId(sellerProduct.displayCategoryCode),
      categoryId: optionalId(sellerProduct.categoryId),
      itemCount: items.length,
    };
    assertJsonBytes(raw, MAX_RAW_BYTES, `Wing 상세 상품 ${externalProductId} raw 데이터가 허용 크기를 초과했습니다`);
    const product = {
      externalProductId,
      options,
      documents,
      media,
      raw,
    };
    assertJsonBytes(product, MAX_PRODUCT_BYTES, `Wing 상세 상품 ${externalProductId}가 허용 크기를 초과했습니다`);
    return product;
  }

  function chunkCatalogProducts(products, {
    kind,
    version = 1,
    maxBytes = MAX_CHUNK_BYTES,
  } = {}) {
    if (typeof kind !== "string" || !kind.trim()) throw new Error("Wing chunk kind가 없습니다");
    if (!Array.isArray(products)) throw new Error("Wing chunk 상품 목록이 올바르지 않습니다");
    const chunks = [];
    let current = [];
    for (let index = 0; index < products.length; index += 1) {
      const item = products[index];
      if (!item || typeof item !== "object" || !Number.isInteger(item.ordinal) ||
        item.ordinal < 0 || !item.product || typeof item.product !== "object") {
        throw new Error("Wing chunk 상품 항목이 올바르지 않습니다");
      }
      const previous = index > 0 ? products[index - 1] : null;
      if (previous && item.ordinal !== previous.ordinal + 1) {
        throw new Error("Wing chunk 상품 ordinal이 연속되지 않습니다");
      }
      assertJsonBytes(item.product, MAX_PRODUCT_BYTES,
        `Wing 상품 ${String(item.product.externalProductId || "")}가 허용 크기를 초과했습니다`);
      const candidate = {
        version,
        kind,
        startOrdinal: current.length > 0 ? current[0].ordinal : item.ordinal,
        products: [...current, item],
      };
      const candidateBytes = jsonByteLength(candidate);
      if ((candidateBytes > maxBytes || candidate.products.length > MAX_PRODUCTS_PER_CHUNK) && current.length > 0) {
        chunks.push({
          version,
          kind,
          startOrdinal: current[0].ordinal,
          products: current,
        });
        current = [item];
        if (jsonByteLength({ version, kind, startOrdinal: item.ordinal, products: current }) > maxBytes) {
          throw new Error(`Wing ${kind} chunk가 허용 크기를 초과했습니다`);
        }
      } else if (candidateBytes > maxBytes || candidate.products.length > MAX_PRODUCTS_PER_CHUNK) {
        throw new Error(`Wing ${kind} chunk가 허용 크기를 초과했습니다`);
      } else {
        current = candidate.products;
      }
    }
    if (current.length > 0) {
      chunks.push({ version, kind, startOrdinal: current[0].ordinal, products: current });
    }
    return chunks;
  }

  function buildCatalogOption(item) {
    const externalOptionId = requiredOptionId(item, "detail");
    const vendorItemId = optionalId(item?.vendorItemId);
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
        vendorItemId,
        itemId: optionalId(item?.itemId),
        originalVendorItemId: optionalId(item?.originalVendorItemId),
        externalVendorSku: nullableText(item?.externalVendorSku),
        originalPrice: nullableInteger(item?.originalPrice),
        salePrice: nullableInteger(item?.salePrice),
        supplyPrice: nullableInteger(item?.supplyPrice),
        maximumBuyCount: nullableInteger(item?.maximumBuyCount),
        offerCondition: nullableText(item?.offerCondition),
        taxType: nullableText(item?.taxType),
        ...(vendorItemId ? {} : {
          vendorInventoryItemId: optionalId(item?.vendorInventoryItemId),
          externalOptionIdentitySource: "inventory_item",
        }),
      },
    };
  }

  function buildProductMedia(items) {
    const media = [];
    let primaryAdded = false;
    for (const item of items) {
      const externalOptionId = requiredOptionId(item, "detail");
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
      const externalOptionId = requiredOptionId(item, "detail");
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

  const DETAIL_DOCUMENT_FIELDS = [
    "contents",
    "notices",
    "additionalNotices",
    "searchTags",
    "internalAttributes",
    "certifications",
    "extraProperties",
  ];

  function normalizeDetailAttributes(attributes) {
    return (Array.isArray(attributes) ? attributes : [])
      .map((attribute) => ({
        type: nullableText(attribute?.attributeTypeName || attribute?.attributeTypeId),
        value: nullableText(attribute?.attributeValueName),
      }))
      .filter((attribute) => attribute.type && attribute.value)
      .map((attribute) => ({ type: attribute.type, value: attribute.value }))
      .slice(0, MAX_ATTRIBUTES_PER_OPTION);
  }

  function buildDetailOptionRaw(item) {
    const raw = {
      sellerProductItemId: strictOptionalId(item?.sellerProductItemId, "sellerProductItemId"),
      vendorItemId: strictOptionalId(item?.vendorItemId, "vendorItemId"),
      itemId: strictOptionalId(item?.itemId, "itemId"),
      skuId: strictOptionalId(item?.skuId, "skuId"),
      externalVendorSku: nullableText(item?.externalVendorSku),
      barcode: nullableText(item?.barcode),
      modelNo: nullableText(item?.modelNo),
      originalPrice: nullableInteger(item?.originalPrice),
      salePrice: nullableInteger(item?.salePrice),
      supplyPrice: nullableInteger(item?.supplyPrice),
      externalOptionIdentitySource: item?.vendorItemId === null || item?.vendorItemId === undefined
        ? "inventory_item"
        : "vendor_item",
    };
    assertJsonBytes(raw, MAX_RAW_BYTES, "Wing 상세 옵션 raw 데이터가 허용 크기를 초과했습니다");
    return raw;
  }

  function addDetailMedia(mediaByKey, role, sourceUrl, externalOptionId, order) {
    if (!sourceUrl) return;
    const key = `${role}:${sourceUrl}`;
    const existing = mediaByKey.get(key);
    if (existing) {
      existing.externalOptionIds.add(externalOptionId);
      return;
    }
    mediaByKey.set(key, {
      sourceUrl,
      role,
      order,
      externalOptionIds: new Set([externalOptionId]),
    });
  }

  function makeStableDocumentId(field, value, ordinal) {
    const text = `${field}\u0000${stableStringify(value)}`;
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `doc:${field}:${(hash >>> 0).toString(16).padStart(8, "0")}:${ordinal}`;
  }

  function categoryCode(product) {
    const parts = [optionalId(product?.displayCategoryCode), optionalId(product?.categoryId)]
      .filter(Boolean);
    return parts.length > 0 ? parts.join("/") : null;
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
      saleStatus: nullableText(record?.saleStatus),
    }));
  }

  function buildWingCatalogSearchBody(page) {
    const requestedPage = requiredPositiveInteger(page, "Wing 페이지");
    return {
      searchKeywordType: "ALL",
      searchKeywords: "",
      salesMethod: "ALL",
      productStatus: ["ALL"],
      stockSearchType: "ALL",
      shippingFeeSearchType: "ALL",
      displayCategoryCodes: [],
      listingStartTime: null,
      listingEndTime: null,
      saleEndDateSearchType: "ALL",
      bundledShippingSearchType: "ALL",
      displayDeletedProduct: false,
      shippingMethod: "ALL",
      exposureStatus: "ALL",
      sortMethod: "SORT_BY_ITEM_LEVEL_UNIT_SOLD",
      countPerPage: WING_CATALOG_PAGE_SIZE,
      page: requestedPage,
      locale: "ko_KR",
      coupangAttributeOptimized: false,
      upBundleSearchOption: "ALL",
      exposureStatuses: [],
      qualityEnhanceTypes: [],
    };
  }

  function normalizeWingCatalogSearchResponse(payload, page, expectedVendorId) {
    const requestedPage = requiredPositiveInteger(page, "Wing 페이지");
    // The verified v2 response is the JSON object itself (`data` contains
    // productList + pagination).  Keep accepting the earlier success/message
    // envelope only for old fixtures; it is never used to infer provider
    // identity or completeness.
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Wing 상품 목록 API 응답이 올바르지 않습니다");
    }
    if (Object.prototype.hasOwnProperty.call(payload, "success") &&
      (payload.success !== true || payload.message !== null)) {
      throw new Error("Wing 상품 목록 API 응답이 올바르지 않습니다");
    }
    const data = payload.data;
    const pagination = data?.pagination;
    const productList = data?.productList;
    if (!data || typeof data !== "object" || Array.isArray(data) ||
      !Array.isArray(productList) || !pagination ||
      typeof pagination !== "object" || Array.isArray(pagination)) {
      throw new Error("Wing 상품 목록 API 데이터가 올바르지 않습니다");
    }

    const responsePage = requiredPositiveInteger(pagination.page, "Wing 응답 페이지");
    const pageSize = requiredPositiveInteger(
      pagination.countPerPage,
      "Wing 응답 페이지 크기",
    );
    const totalItems = requiredNonNegativeInteger(
      pagination.totalCount,
      "Wing 전체 상품 수",
    );
    const totalPages = requiredNonNegativeInteger(
      pagination.totalPages,
      "Wing 전체 페이지 수",
    );
    if (responsePage !== requestedPage || pageSize !== WING_CATALOG_PAGE_SIZE) {
      throw new Error("Wing 상품 목록 API 페이지 정보가 요청과 다릅니다");
    }
    const expectedPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);
    if (totalPages !== expectedPages) {
      throw new Error("Wing 상품 목록 API 페이지 수가 전체 상품 수와 다릅니다");
    }
    if (totalItems === 0) {
      if (requestedPage !== 1 || productList.length !== 0) {
        throw new Error("Wing 빈 상품 목록 API 응답이 올바르지 않습니다");
      }
    } else {
      if (requestedPage > totalPages) {
        throw new Error("Wing 상품 목록 API 페이지가 범위를 벗어났습니다");
      }
      const expectedRows = Math.min(
        pageSize,
        totalItems - ((requestedPage - 1) * pageSize),
      );
      if (productList.length !== expectedRows) {
        throw new Error(
          `Wing ${requestedPage}페이지 상품 수가 불완전합니다 (${productList.length}/${expectedRows})`,
        );
      }
    }

    const seenIds = new Set();
    const hasInventoryItems = productList.some((product) =>
      Object.prototype.hasOwnProperty.call(product || {}, "vendorInventoryItems"));
    const records = productList.map((product) => {
      if (!product || typeof product !== "object" || Array.isArray(product)) {
        throw new Error("Wing 상품 목록 행이 올바르지 않습니다");
      }
      if (!Number.isSafeInteger(product.vendorInventoryId) || product.vendorInventoryId <= 0) {
        throw new Error("Wing 상품 ID가 올바르지 않습니다");
      }
      const externalProductId = String(product.vendorInventoryId);
      if (seenIds.has(externalProductId)) {
        throw new Error(`Wing 상품 ID가 중복되었습니다: ${externalProductId}`);
      }
      seenIds.add(externalProductId);
      if (product.vendorId !== undefined &&
        (typeof product.vendorId !== "string" ||
          (expectedVendorId && product.vendorId !== expectedVendorId))) {
        throw new Error(`Wing 판매자 ID가 수집 계정과 다릅니다: ${externalProductId}`);
      }
      const registeredName = requiredText(product.productName, "Wing 상품명")
        .replace(/\s+/g, " ");
      const productStatus = requiredText(product.productStatus, "Wing 판매 상태");
      return {
        externalProductId,
        registeredName,
        primaryImageUrl: normalizeImageUrl(product.representativeImage),
        saleStatus: saleStatusFromWingProductStatus(productStatus),
      };
    });

    const basicProducts = hasInventoryItems
      ? productList.map((product) => buildCatalogBasicProduct(product))
      : [];

    return {
      success: true,
      page: requestedPage,
      pageSize,
      totalItems,
      totalPages,
      records,
      ...(basicProducts.length > 0 ? { basicProducts } : {}),
    };
  }

  function saleStatusFromText(value) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (!text) return null;
    if (/판매\s*(중지|종료)|판매중지|판매종료/.test(text)) return "판매중지";
    if (/판매\s*중|판매중/.test(text)) return "판매중";
    return null;
  }

  function saleStatusFromWingProductStatus(value) {
    switch (value) {
      case "ON_SALE":
      case "PARTIAL_ON_SALE":
        return "판매중";
      case "SUSPENDED":
        return "판매중지";
      case "REJECTED":
        return null;
      default:
        throw new Error(`Wing 판매 상태를 해석할 수 없습니다: ${String(value || "")}`);
    }
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

  function normalizeWingDiscoveryImageUrl(value) {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) return null;
    if (text.startsWith("//")) return `https:${text}`;
    if (/^https?:\/\//i.test(text)) return text;
    const relative = text.replace(/^\/+/, "");
    return `https://image.coupangcdn.com/image/${relative}`;
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

  function strictOptionalId(value, name) {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
    throw new Error(`Wing ${name} 값이 올바르지 않습니다`);
  }

  function strictRequiredId(value, name) {
    const id = strictOptionalId(value, name);
    if (!id) throw new Error(`Wing ${name} 값이 없습니다`);
    return id;
  }

  function strictNullableBoolean(value, name) {
    if (value === null || value === undefined) return null;
    if (typeof value === "boolean") return value;
    throw new Error(`Wing ${name} 값이 올바르지 않습니다`);
  }

  function requiredOptionId(item, stage) {
    const vendorItemId = strictOptionalId(item?.vendorItemId, "vendorItemId");
    if (vendorItemId) return vendorItemId;
    const relationId = stage === "basic"
      ? strictOptionalId(item?.vendorInventoryItemId, "vendorInventoryItemId")
      : strictOptionalId(item?.sellerProductItemId, "sellerProductItemId");
    if (relationId) return relationId;
    // The legacy HTML model did not expose sellerProductItemId on every
    // fixture. Keep that compatibility path only for detail models, where
    // itemId is the provider's validated identity available to us.
    if (stage === "detail") {
      const itemId = strictOptionalId(item?.itemId, "itemId");
      if (itemId) return itemId;
    }
    throw new Error("Wing 옵션 식별자가 없습니다");
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

  function requiredText(value, name) {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) throw new Error(`${name} 값이 없습니다`);
    return text;
  }

  function requiredPositiveInteger(value, name) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`${name} 값이 올바르지 않습니다`);
    }
    return value;
  }

  function requiredNonNegativeInteger(value, name) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${name} 값이 올바르지 않습니다`);
    }
    return value;
  }

  function numericOrder(value, fallback) {
    const order = Number(value);
    return Number.isInteger(order) && order >= 0 ? order : fallback;
  }

  root.KidItemCoupangCatalog = {
    contractRevision: COUPANG_CATALOG_CONTRACT_REVISION,
    buildCatalogProduct,
    buildCatalogBasicProduct,
    buildCatalogBasicOption,
    buildCatalogDetailProduct,
    buildDiscoveryItems,
    buildWingCatalogSearchBody,
    buildManifest,
    chunkCatalogProducts,
    extractSellerProductFromScripts,
    jsonByteLength,
    normalizeImageUrl,
    normalizeWingCatalogSearchResponse,
    normalizeWingDiscoveryImageUrl,
    saleStatusFromText,
    saleStatusFromWingProductStatus,
    sha256Hex,
    stableStringify,
  };
})(globalThis);
