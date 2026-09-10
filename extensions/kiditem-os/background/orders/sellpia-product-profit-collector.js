(function installSellpiaProductProfitCollector(root) {
  "use strict";

  const SELLPIA_PRODUCT_PROFIT_URL =
    "https://kiditem.sellpia.com/stat_prd_profit.html#none";

  function requireDependencies(options) {
    if (
      !options?.chrome?.scripting?.executeScript ||
      typeof options.waitForTabReady !== "function" ||
      typeof options.withTimeout !== "function"
    ) {
      throw new Error("Sellpia product-profit collector dependencies are required.");
    }
    return options;
  }

  async function assertCollectionActive(collection) {
    if (typeof collection?.assertActive !== "function") return;
    const active = await collection.assertActive();
    if (active === false) {
      const error = new Error("Sellpia profitability collection is no longer active.");
      error.code = "COLLECTION_CANCELLED";
      throw error;
    }
  }

  function cancellationResult(error) {
    return {
      success: false,
      errorCode: "COLLECTION_CANCELLED",
      error: String(error?.message || "Sellpia profitability collection was cancelled."),
    };
  }

  function isCancellation(error) {
    return error?.code === "COLLECTION_CANCELLED";
  }

  function create(options) {
    const {
      chrome: chromeApi,
      waitForTabReady,
      withTimeout,
      isMallAccessError,
      mallAccessErrorResult,
      mallGenericErrorResult,
    } = requireDependencies(options);

    const accessError = typeof isMallAccessError === "function"
      ? isMallAccessError
      : () => false;
    const accessResult = typeof mallAccessErrorResult === "function"
      ? mallAccessErrorResult
      : (mallName) => ({
        success: false,
        pendingLogin: true,
        error: `${mallName} login is required.`,
      });
    const genericResult = typeof mallGenericErrorResult === "function"
      ? mallGenericErrorResult
      : (mallName, error) => ({
        success: false,
        error: `${mallName} collection failed: ${String(error?.message || error)}`,
      });

    async function createTab() {
      const tab = await chromeApi.tabs.create({
        url: SELLPIA_PRODUCT_PROFIT_URL,
        active: false,
      });
      return tab;
    }

    async function collect(input = {}) {
      const {
        startDate = null,
        endDate = null,
        collection = null,
      } = input;
      let tab = null;
      let attached = false;
      let keepOpen = false;
      let tabClosed = false;
      const closeTab = async () => {
        if (!tab?.id || tabClosed) return;
        try {
          await chromeApi.tabs.remove(tab.id);
          tabClosed = true;
        } catch {
          // Chrome may have closed the task tab during cancellation already.
        }
      };
      const cleanupTab = async () => {
        if (!tab?.id || tabClosed || keepOpen) return;
        if (attached && collection?.detachTab) {
          try {
            const detached = await collection.detachTab(tab, { owned: true });
            if (detached !== null && detached !== false) {
              tabClosed = true;
              return;
            }
          } catch {
            // Fall through to a direct best-effort close of this created tab.
          }
        }
        await closeTab();
      };
      try {
        await assertCollectionActive(collection);
        tab = await createTab();
        if (!tab?.id) {
          return {
            success: false,
            error: "셀피아(kiditem.sellpia.com) 탭을 열 수 없습니다.",
          };
        }
        if (collection?.attachTab) {
          const attachment = await collection.attachTab(tab, { owned: true });
          if (!attachment) {
            await closeTab();
            return cancellationResult(new Error("Sellpia profitability collection was cancelled before tab attachment."));
          }
          attached = true;
        }
        await waitForTabReady(tab.id);
        await assertCollectionActive(collection);
        const injected = await withTimeout(
          chromeApi.scripting.executeScript({
            target: { tabId: tab.id },
            world: "MAIN",
            func: scrapeSellpiaProductProfit,
            args: [startDate, endDate],
          }),
          90000,
          "셀피아 상품별 이익현황 조회 시간이 초과되었습니다.",
        );
        const result = injected[0]?.result ?? {
          success: false,
          error: "셀피아 화면에 접근하지 못했습니다.",
        };
        if (result?.pendingLogin) keepOpen = true;
        return result;
      } catch (error) {
        if (isCancellation(error)) return cancellationResult(error);
        if (accessError(error)) {
          keepOpen = true;
          return accessResult("셀피아");
        }
        return genericResult("셀피아", error);
      } finally {
        await cleanupTab();
      }
    }

    return Object.freeze({ collect });
  }

async function scrapeSellpiaProductProfit(startDate, endDate) {
  try {
    const p = (n) => String(n).padStart(2, "0");
    const toYmd = (date) => `${date.getUTCFullYear()}-${p(date.getUTCMonth() + 1)}-${p(date.getUTCDate())}`;
    // 브라우저/운영체제 시간대와 무관하게 KST 달력을 기준으로 어제까지의 연속
    // 400일 증거창을 만든다. 끝점에서 400일을 빼므로 양 끝 포함 401일이다.
    const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const defaultEnd = new Date(Date.UTC(
      nowKst.getUTCFullYear(), nowKst.getUTCMonth(), nowKst.getUTCDate() - 1,
    ));
    const defaultStart = new Date(Date.UTC(
      defaultEnd.getUTCFullYear(), defaultEnd.getUTCMonth(), defaultEnd.getUTCDate() - 400,
    ));
    const end = endDate || toYmd(defaultEnd);
    const start = startDate || toYmd(defaultStart);
    const dateKey = /^\d{4}-\d{2}-\d{2}$/;
    const toValidDate = (value) => {
      if (typeof value !== "string" || !dateKey.test(value)) return null;
      const timestamp = Date.parse(`${value}T00:00:00.000Z`);
      if (!Number.isFinite(timestamp)) return null;
      const parsed = new Date(timestamp);
      return parsed.toISOString().slice(0, 10) === value ? parsed : null;
    };
    const startValue = toValidDate(start);
    const endValue = toValidDate(end);
    if (!startValue || !endValue || startValue > endValue) {
      return { success: false, error: "셀피아 상품별 이익현황 조회 기간이 올바르지 않습니다." };
    }
    const rangeMonths = new Set();
    const purchasePeriods = [];
    for (
      let monthIndex = startValue.getUTCFullYear() * 12 + startValue.getUTCMonth();
      monthIndex <= endValue.getUTCFullYear() * 12 + endValue.getUTCMonth();
      monthIndex += 1
    ) {
      const year = Math.floor(monthIndex / 12);
      const month = monthIndex % 12;
      const monthStart = new Date(Date.UTC(year, month, 1));
      const monthEnd = new Date(Date.UTC(year, month + 1, 0));
      const periodStart = startValue > monthStart ? startValue : monthStart;
      const periodEnd = endValue < monthEnd ? endValue : monthEnd;
      const yearMonth = `${year}-${String(month + 1).padStart(2, "0")}`;
      rangeMonths.add(yearMonth);
      purchasePeriods.push({
        yearMonth,
        from: toYmd(periodStart),
        to: toYmd(periodEnd),
      });
    }
    const fetchRows = async (purchaseStart, purchaseEnd) => {
      const body = new URLSearchParams({
        mode: "stat_prd_profit",
        // Keep the sales window fixed at the approved 401-day range. Only the
        // purchase period is narrowed per calendar bucket below.
        s_date: start,
        e_date: end,
        in_s_date: purchaseStart,
        in_e_date: purchaseEnd,
        buy_point: "R",
        provider: "",
        vat_tp: "1",
        p_str: "",
        period_free: "false",
        prd_cate: "",
        prd_type: "",
      });
      const res = await fetch("stat_action.ajax.html", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" },
        body: body.toString(),
      });
      if (!res.ok) {
        throw new Error("셀피아 상품별 이익현황 조회 실패 (HTTP " + res.status + "). 셀피아 로그인을 확인하세요.");
      }
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("셀피아 상품별 이익현황 응답을 해석하지 못했습니다. 셀피아 로그인을 확인하세요.");
      }
      if (!Array.isArray(data) || data.length > 20000) {
        throw new Error("셀피아 상품별 이익현황 응답 형식이 예상과 다릅니다.");
      }
      return data;
    };
    const data = await fetchRows(start, end);
    const normalizeGraphKey = (key) => {
      const value = String(key);
      const monthMatch = value.match(/^(\d{4})-(\d{1,2})$/);
      if (monthMatch) {
        const month = Number(monthMatch[2]);
        if (month < 1 || month > 12) return null;
        return {
          kind: "month",
          yearMonth: monthMatch[1] + "-" + String(month).padStart(2, "0"),
        };
      }
      const fullDateMatch = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      const shortDateMatch = value.match(/^(\d{1,2})[/-](\d{1,2})$/);
      const yearCandidates = fullDateMatch
        ? [Number(fullDateMatch[1])]
        : shortDateMatch
          ? Array.from({ length: endValue.getUTCFullYear() - startValue.getUTCFullYear() + 1 },
            (_, offset) => startValue.getUTCFullYear() + offset)
          : [];
      const month = Number(fullDateMatch?.[2] ?? shortDateMatch?.[1]);
      const day = Number(fullDateMatch?.[3] ?? shortDateMatch?.[2]);
      if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1 || day > 31) {
        return null;
      }
      const candidates = yearCandidates
        .map((year) => new Date(Date.UTC(year, month - 1, day)))
        .filter((date) =>
          date.getUTCMonth() === month - 1
          && date.getUTCDate() === day
          && date >= startValue
          && date <= endValue,
        );
      if (candidates.length !== 1) return null;
      const date = candidates[0];
      return {
        kind: "day",
        date: toYmd(date),
        yearMonth: date.toISOString().slice(0, 7),
      };
    };
    const int = (value) => {
      if (typeof value !== "number" && typeof value !== "string") return null;
      if (typeof value === "string" && !/^\d+$/.test(value)) return null;
      const parsed = Number(value);
      return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 2147483647
        ? parsed
        : null;
    };
    const signedInt = (value) => {
      if (typeof value !== "number" && typeof value !== "string") return null;
      if (typeof value === "string" && !/^-?\d+$/.test(value)) return null;
      const parsed = Number(value);
      return Number.isSafeInteger(parsed)
        && parsed >= -2147483648
        && parsed <= 2147483647
        ? parsed
        : null;
    };
    const boundedString = (value, max, allowEmpty = false) => {
      if (typeof value !== "string" && typeof value !== "number") return null;
      const normalized = String(value).trim();
      if ((!allowEmpty && !normalized) || normalized.length > max) return null;
      return normalized;
    };
    const providerInt = (value) => {
      if (typeof value !== "string" && typeof value !== "number") return null;
      return int(value);
    };
    const invalidResponse = () => new Error("셀피아 상품별 이익현황 응답 형식이 예상과 다릅니다.");
    const inconsistentPurchaseResponse = () => new Error(
      "셀피아 상품별 이익현황 구매기간 응답이 401일 판매 증거와 일치하지 않습니다.",
    );
    const addInt = (left, right) => {
      const total = left + right;
      return int(total);
    };
    const parseRows = (rows) => {
      const parsedProducts = [];
      const identities = new Set();
      let skippedAdjustmentCount = 0;
      for (const p2 of rows) {
        if (!p2 || typeof p2 !== "object" || Array.isArray(p2)) throw invalidResponse();
        const productCode = boundedString(p2.product_code, 64);
        const optionCode = boundedString(p2.option_code ?? "", 64, true);
        const productName = boundedString(p2.product_name, 400);
        const salePrice = p2.sale_price == null || p2.sale_price === "" ? 0 : int(p2.sale_price);
        const buyPrice = p2.buy_price == null || p2.buy_price === "" ? 0 : int(p2.buy_price);
        const barcode = p2.dp_code == null || p2.dp_code === "" ? undefined : boundedString(p2.dp_code, 64);
        if (!productCode || optionCode === null || !productName || salePrice === null || buyPrice === null || barcode === null) {
          throw invalidResponse();
        }
        const identity = `${productCode}\u0000${optionCode}`;
        if (identities.has(identity)) throw invalidResponse();
        identities.add(identity);
        const graph = p2.graph;
        if (!graph || typeof graph !== "object" || Array.isArray(graph)) throw invalidResponse();
        const rawMonthValues = [];
        const nativeGraphKeys = new Set();
        let graphKind = null;
        for (const key of Object.keys(graph)) {
          const graphKey = normalizeGraphKey(key);
          const nativeKey = graphKey?.kind === "day"
            ? `day:${graphKey.date}`
            : `month:${graphKey?.yearMonth}`;
          if (!graphKey || !rangeMonths.has(graphKey.yearMonth)
            || nativeGraphKeys.has(nativeKey)
            || (graphKind !== null && graphKind !== graphKey.kind)
            || typeof graph[key] !== "string") {
            throw invalidResponse();
          }
          graphKind = graphKey.kind;
          nativeGraphKeys.add(nativeKey);
          const parts = graph[key].split(",");
          if (parts.length !== 3) throw invalidResponse();
          const inAmount = signedInt(parts[0]);
          const orderAmount = signedInt(parts[1]);
          const orderQty = signedInt(parts[2]);
          if (inAmount === null || orderAmount === null || orderQty === null) throw invalidResponse();
          rawMonthValues.push({ ...graphKey, inAmount, orderAmount, orderQty });
        }
        // Sellpia includes financial-only rows such as `할인` in the product
        // report. They have no unit price, barcode, or inbound value and carry
        // negative revenue only. They are not inventory products and cannot be
        // mapped to a MasterProduct, so exclude only this narrow adjustment
        // shape. Negative revenue on an inventory-bearing product remains a
        // contract failure instead of being silently erased.
        const pureFinancialAdjustment = salePrice === 0
          && buyPrice === 0
          && barcode === undefined
          && rawMonthValues.some((month) => month.orderAmount < 0)
          && rawMonthValues.every((month) =>
            month.inAmount === 0
            && month.orderAmount <= 0
            && month.orderQty >= 0,
          );
        if (pureFinancialAdjustment) {
          skippedAdjustmentCount += 1;
          continue;
        }
        const monthValues = new Map();
        for (const month of rawMonthValues) {
          if (month.inAmount < 0 || month.orderAmount < 0 || month.orderQty < 0) throw invalidResponse();
          const previous = monthValues.get(month.yearMonth);
          if (!previous) {
            monthValues.set(month.yearMonth, {
              inAmount: month.inAmount,
              orderAmount: month.orderAmount,
              orderQty: month.orderQty,
            });
            continue;
          }
          const inAmount = addInt(previous.inAmount, month.inAmount);
          const orderAmount = addInt(previous.orderAmount, month.orderAmount);
          const orderQty = addInt(previous.orderQty, month.orderQty);
          if (inAmount === null || orderAmount === null || orderQty === null) throw invalidResponse();
          monthValues.set(month.yearMonth, { inAmount, orderAmount, orderQty });
        }
        let graphOrderAmount = 0;
        let graphOrderQty = 0;
        for (const month of monthValues.values()) {
          graphOrderAmount = addInt(graphOrderAmount, month.orderAmount);
          graphOrderQty = addInt(graphOrderQty, month.orderQty);
          if (graphOrderAmount === null || graphOrderQty === null) throw invalidResponse();
        }
        const totalOrderAmount = providerInt(p2.total_order_amount);
        const totalOrderQty = providerInt(p2.total_order_qty);
        const totalInAmount = providerInt(p2.total_in_amount);
        const totalInQty = providerInt(p2.total_in_qty);
        if (
          totalOrderAmount === null
          || totalOrderQty === null
          || totalInAmount === null
          || totalInQty === null
          || graphOrderAmount !== totalOrderAmount
          || graphOrderQty !== totalOrderQty
        ) {
          throw invalidResponse();
        }
        parsedProducts.push({
          productCode,
          optionCode,
          productName,
          optionName: p2.option_name ? String(p2.option_name) : undefined,
          providerName: p2.provider_name ? String(p2.provider_name) : undefined,
          salePrice,
          buyPrice,
          barcode,
          identity,
          monthValues,
          totalOrderAmount,
          totalOrderQty,
          totalInAmount,
          totalInQty,
        });
      }
      return {
        products: parsedProducts,
        byIdentity: new Map(parsedProducts.map((product) => [product.identity, product])),
        skippedAdjustmentCount,
      };
    };

    const baseline = parseRows(data);
    const periodCosts = new Map();
    for (const period of purchasePeriods) {
      const parsed = parseRows(await fetchRows(period.from, period.to));
      if (parsed.products.length !== baseline.products.length) throw inconsistentPurchaseResponse();
      for (const baselineProduct of baseline.products) {
        const current = parsed.byIdentity.get(baselineProduct.identity);
        if (!current
          || current.totalOrderAmount !== baselineProduct.totalOrderAmount
          || current.totalOrderQty !== baselineProduct.totalOrderQty
          || current.monthValues.size !== baselineProduct.monthValues.size) {
          throw inconsistentPurchaseResponse();
        }
        for (const [yearMonth, baselineMonth] of baselineProduct.monthValues) {
          const currentMonth = current.monthValues.get(yearMonth);
          if (!currentMonth
            || currentMonth.orderAmount !== baselineMonth.orderAmount
            || currentMonth.orderQty !== baselineMonth.orderQty) {
            throw inconsistentPurchaseResponse();
          }
        }
        const productPeriods = periodCosts.get(baselineProduct.identity) || new Map();
        if (productPeriods.has(period.yearMonth)) throw inconsistentPurchaseResponse();
        productPeriods.set(period.yearMonth, {
          inAmount: current.totalInAmount,
          inQty: current.totalInQty,
        });
        periodCosts.set(baselineProduct.identity, productPeriods);
      }
    }

    const products = baseline.products.map((baselineProduct) => {
      const productPeriods = periodCosts.get(baselineProduct.identity) || new Map();
      let totalInAmount = 0;
      let totalInQty = 0;
      for (const period of purchasePeriods) {
        const values = productPeriods.get(period.yearMonth);
        if (!values) throw inconsistentPurchaseResponse();
        totalInAmount = addInt(totalInAmount, values.inAmount);
        totalInQty = addInt(totalInQty, values.inQty);
        if (totalInAmount === null || totalInQty === null) throw inconsistentPurchaseResponse();
        if (!baselineProduct.monthValues.has(period.yearMonth)
          && (values.inAmount !== 0 || values.inQty !== 0)) {
          throw inconsistentPurchaseResponse();
        }
      }
      if (
        totalInAmount !== baselineProduct.totalInAmount
        || totalInQty !== baselineProduct.totalInQty
      ) {
        throw inconsistentPurchaseResponse();
      }
      const months = [...baselineProduct.monthValues.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([yearMonth, values]) => {
          const period = productPeriods.get(yearMonth);
          if (!period) throw inconsistentPurchaseResponse();
          return {
            yearMonth,
            inAmount: period.inAmount,
            orderAmount: values.orderAmount,
            orderQty: values.orderQty,
            inQty: period.inQty,
          };
        });
      return {
        productCode: baselineProduct.productCode,
        optionCode: baselineProduct.optionCode,
        productName: baselineProduct.productName,
        optionName: baselineProduct.optionName,
        providerName: baselineProduct.providerName,
        salePrice: baselineProduct.salePrice,
        buyPrice: baselineProduct.buyPrice,
        barcode: baselineProduct.barcode,
        totalOrderAmount: baselineProduct.totalOrderAmount,
        totalOrderQty: baselineProduct.totalOrderQty,
        totalInAmount: baselineProduct.totalInAmount,
        totalInQty: baselineProduct.totalInQty,
        months,
      };
    });
    return {
      success: true,
      payload: {
        range: { from: start, to: end },
        parserVersion: "sellpia-profitability-v2",
        provenance: {
          source: "sellpia_stat_prd_profit",
          costBasis: "ORDER_TIME_SUPPLY_COST",
          vatIncluded: true,
        },
        products,
      },
      productCount: products.length,
      skippedAdjustmentCount: baseline.skippedAdjustmentCount,
      range: { start, end },
    };
  } catch (e) {
    return { success: false, error: String((e && e.message) || e) };
  }
}


  root.KidItemSellpiaProductProfitCollector = Object.freeze({ create });
})(globalThis);
