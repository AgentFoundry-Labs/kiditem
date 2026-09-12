(function installOrderCollectionServerConverter(root) {
  "use strict";

  const JSON_HEADERS = { "content-type": "application/json" };
  const FILE_MIME = {
    domeggook: "text/csv",
    "lotte-on": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "gs-shop": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    always: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    boribori: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "teacher-mall": "application/vnd.ms-excel",
  };
  const ENDPOINTS = {
    "icecream-mall": "/api/orders/collection/icecream-mall/convert-rows",
    kidsnote: "/api/orders/collection/kidsnote/convert",
    kkomangse: "/api/orders/collection/kkomangse/convert",
    onch: "/api/orders/collection/onchannel/convert",
    kidkids: "/api/orders/collection/kidkids/convert",
    "haebub-mall": "/api/orders/collection/haebeop/convert",
    art09: "/api/orders/collection/art09/convert",
    domeggook: "/api/orders/collection/domeggook/convert",
    "lotte-on": "/api/orders/collection/lotteon/convert",
    "gs-shop": "/api/orders/collection/gsshop/convert",
    always: "/api/orders/collection/alwayz/convert",
    boribori: "/api/orders/collection/boribori/convert",
    "teacher-mall": "/api/orders/collection/teacherville/convert",
  };
  const UUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const ROW_KEY_SEPARATOR = "\u001f";

  function bounded(value, fallback, maximum = 300) {
    if (typeof value !== "string") return fallback;
    const text = value.trim();
    return text && text.length <= maximum ? text : fallback;
  }

  function markLocalError(error) {
    const result = error instanceof Error ? error : new Error(String(error));
    result.conversionLocal = true;
    return result;
  }

  function markTransportError(error) {
    const result = error instanceof Error ? error : new Error(String(error));
    result.conversionTransport = true;
    return result;
  }

  function header(response, name) {
    return response?.headers?.get?.(name) || null;
  }

  function numericHeader(response, name) {
    const raw = header(response, name);
    if (raw === null || raw === undefined || String(raw).trim() === "") return null;
    const value = Number(raw);
    return Number.isInteger(value) && value >= 0 ? value : null;
  }

  function fileName(response, fallback) {
    const value = header(response, "Content-Disposition") || "";
    const encoded = /filename\*=UTF-8''([^;]+)/i.exec(value)?.[1];
    if (encoded) {
      try {
        return decodeURIComponent(encoded);
      } catch {
        return encoded;
      }
    }
    return /filename="([^"]+)"/i.exec(value)?.[1] || fallback;
  }

  async function errorFromResponse(response, fallback) {
    let body = null;
    try {
      body = await response.clone().json();
    } catch {
      try {
        body = { message: await response.clone().text() };
      } catch {
        body = null;
      }
    }
    const error = new Error(bounded(body?.message, fallback));
    error.code = bounded(body?.code, "CONVERSION_FAILED", 80);
    error.status = response?.status;
    return error;
  }

  function bytesFromBase64(value) {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error("주문 원본 파일이 없습니다.");
    }
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  function rowKeys(rows) {
    return (Array.isArray(rows) ? rows : []).map((row) =>
      (Array.isArray(row) ? row : []).map((cell) => String(cell ?? "").trim()).join(ROW_KEY_SEPARATOR));
  }

  function icecreamPayload(capture, plan, input) {
    const headers = Array.isArray(capture?.headers) ? capture.headers : [];
    const rows = Array.isArray(capture?.rows) ? capture.rows : [];
    const seen = new Set(
      Array.isArray(plan?.seenRowKeys)
        ? plan.seenRowKeys.filter((value) => typeof value === "string")
        : [],
    );
    const automatic = plan?.selectionMode === "automatic";
    const allRowKeys = rowKeys(rows);
    const selectedRows = automatic ? rows.filter((row, index) => !seen.has(allRowKeys[index])) : rows;
    const selectedRowKeys = automatic
      ? allRowKeys.filter((key) => !seen.has(key))
      : allRowKeys;
    if (automatic && selectedRows.length === 0) {
      const error = new Error("아이스크림몰 신규 주문이 없습니다.");
      error.code = "NO_NEW_ORDERS";
      error.empty = true;
      error.sourcePayload = {
        headers,
        rows,
        fileName: capture?.fileName || input?.fileName,
        selectionMode: "automatic",
        seenRowKeys: [...seen],
        selectedRows: [],
        originalRows: rows,
        selectedRowKeys: [],
      };
      throw error;
    }
    // `rows` is deliberately retained alongside the converter input. The
    // server converter ignores the extra fields, while the source artifact
    // keeps delivery-index coverage and the frozen automatic selection.
    return {
      headers,
      rows: selectedRows,
      fileName: input?.fileName,
      sourceRows: rows,
      originalRows: rows,
      selectionMode: automatic ? "automatic" : "manual",
      seenRowKeys: [...seen],
      selectedRows,
      selectedRowKeys,
    };
  }

  function kidsnotePayload(capture) {
    return {
      orders: (Array.isArray(capture?.orders) ? capture.orders : []).map((order) => ({
        ono: order.ono,
        orderedAt: order.orderedAt,
        paidAt: order.paidAt ?? "",
        buyer: order.ordererName,
        total: order.totalAmount,
        paid: order.paidAmount,
        payMethod: order.payMethod,
        status: order.status,
        receiver: order.receiver || order.ordererName,
        mobile: order.mobile ?? "",
        tel: order.tel ?? "",
        zip: order.zip ?? "",
        address: order.address ?? "",
        request: order.request ?? "",
        items: order.items?.length
          ? order.items
          : [{ productName: order.productName, qty: 1, option: "", shipFee: 0 }],
      })),
    };
  }

  function jsonPayload(mallKey, capture, plan, input) {
    switch (mallKey) {
      case "icecream-mall":
        return icecreamPayload(capture, plan, input);
      case "kidsnote":
        return kidsnotePayload(capture);
      case "kkomangse":
        return { xlsxBase64: capture?.xlsxBase64, date: plan.collectionDate };
      case "onch":
        return { orders: capture?.orders || [] };
      case "kidkids":
        return { orders: capture?.orders || [] };
      case "haebub-mall":
        return { orders: capture?.orders || [] };
      case "art09":
        return { rows: capture?.rows || [] };
      default:
        return null;
    }
  }

  function noNewOrders(capture) {
    if (capture?.empty === true) return true;
    if (Array.isArray(capture?.rows)) return capture.rows.length === 0;
    if (Array.isArray(capture?.orders)) return capture.orders.length === 0;
    if (Array.isArray(capture?.pos)) return capture.pos.length === 0;
    return false;
  }

  function requireCaptureShape(mallKey, capture) {
    const isArray = (key) => Array.isArray(capture?.[key]);
    const isBase64 = (key) => typeof capture?.[key] === "string" && capture[key].trim();
    let valid = true;
    if (mallKey === "icecream-mall") {
      valid = isArray("headers") && isArray("rows");
    } else if (["kidsnote", "onch", "kidkids", "haebub-mall"].includes(mallKey)) {
      valid = isArray("orders");
    } else if (mallKey === "art09") {
      valid = isArray("rows");
    } else if (mallKey === "kkomangse") {
      valid = isBase64("xlsxBase64");
    } else if (mallKey === "domeggook") {
      valid = capture?.empty === true || isBase64("csvBase64") || isBase64("xlsxBase64");
    } else if (mallKey in FILE_MIME) {
      valid = isBase64("csvBase64") || isBase64("xlsxBase64");
    }
    if (valid) return;
    const error = new Error("주문 원본 캡처 형식이 올바르지 않습니다.");
    error.code = "CAPTURE_INVALID";
    error.sourcePayload = capture;
    throw error;
  }

  function bodyFor(mallKey, capture, plan, input) {
    const json = jsonPayload(mallKey, capture, plan, input);
    if (json) {
      return {
        headers: JSON_HEADERS,
        body: JSON.stringify(json),
        fileName: null,
        sourcePayload: json,
      };
    }
    if (!(mallKey in FILE_MIME)) throw new Error("지원하지 않는 주문 수집 몰입니다.");
    const bytes = bytesFromBase64(capture?.csvBase64 || capture?.xlsxBase64);
    const name = capture?.fileName || `${mallKey}-orders.xlsx`;
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: FILE_MIME[mallKey] }), name);
    if (mallKey === "domeggook" && plan.collectionDate) {
      form.append("date", plan.collectionDate);
    }
    return { headers: undefined, body: form, fileName: name, sourcePayload: null };
  }

  function create(options) {
    if (typeof options?.request !== "function") throw new Error("Server request is required");

    async function convert({ environmentId, attempt, mallKey, capture, plan = {}, input = {} }) {
      let body;
      let endpoint;
      try {
        if (!UUID.test(String(attempt?.attemptId || "")) || !UUID.test(String(attempt?.attemptToken || ""))) {
          throw new Error("Order collection owner fence is required");
        }
        if (mallKey === "kakao") {
          const error = new Error("카카오는 셀피아 변환 규격이 검증되지 않아 지원하지 않습니다.");
          error.code = "UNSUPPORTED_CONVERSION";
          // Preserve the exact named collector capture for operator evidence;
          // reducing it to `orders` would discard provider metadata.
          error.sourcePayload = capture;
          throw error;
        }
        requireCaptureShape(mallKey, capture);
        if (
          noNewOrders(capture) &&
          !(mallKey === "icecream-mall" && plan.selectionMode === "automatic")
        ) {
          const error = new Error("신규 주문이 없습니다.");
          error.code = "NO_NEW_ORDERS";
          error.empty = true;
          error.sourcePayload = capture;
          throw error;
        }
        endpoint = ENDPOINTS[mallKey];
        if (!endpoint) throw new Error("지원하지 않는 주문 수집 몰입니다.");
        body = bodyFor(
          mallKey,
          capture,
          plan,
          input,
        );
      } catch (error) {
        throw markLocalError(error);
      }
      const headers = {
        ...(body.headers || {}),
        "x-order-collection-attempt-id": attempt.attemptId,
        "x-source-attempt-token": attempt.attemptToken,
      };
      let response;
      try {
        response = await options.request(environmentId, endpoint, {
          method: "POST",
          ...(Object.keys(headers).length > 0 ? { headers } : {}),
          body: body.body,
          timeoutMs: 240000,
        });
      } catch (error) {
        throw markTransportError(error);
      }
      if (!response?.ok) {
        throw await errorFromResponse(response, "주문 파일 변환에 실패했습니다.");
      }
      return {
        success: true,
        artifactId: header(response, "X-Order-Collection-Artifact-Id"),
        fileName: fileName(response, body.fileName || `${mallKey}_셀피아변환.xls`),
        sourceRows: numericHeader(response, "X-Order-Collection-Source-Rows"),
        productRows: numericHeader(response, "X-Order-Collection-Product-Rows"),
        outputRows: numericHeader(response, "X-Order-Collection-Output-Rows"),
        skippedRows: numericHeader(response, "X-Order-Collection-Skipped-Rows"),
      };
    }

    return Object.freeze({ convert });
  }

  root.KidItemOrderCollectionServerConverter = Object.freeze({ create });
})(globalThis);
