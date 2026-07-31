(function () {
  try {
    var data = null;
    var source = "";

    if (window.context && window.context.result) {
      var r = window.context.result;

      if (r.global && r.global.globalData && r.global.globalData.model) {
        var m = r.global.globalData.model;
        var od = m.offerDetail || {};
        var tm = m.tradeModel || {};
        var sm = m.sellerModel || {};
        var db = m.detailBusiness || {};
        var dd = m.detailDescription || {};
        var descFields = ((r.data || {}).description || {}).fields || {};
        var packFields = ((r.data || {}).productPackInfo || {}).fields || {};

        data = {
          modelData: {
            subject: od.subject || "",
            offerId: od.offerId || "",
            images: (od.imageList || []).map(function (i) { return i.fullPathImageURI || ""; }).filter(Boolean),
            mainImages: (od.mainImageList || []).map(function (i) { return i.fullPathImageURI || ""; }).filter(Boolean),
            featureAttributes: (od.featureAttributes || []).map(function (a) {
              return { name: a.name || "", value: a.value || "" };
            }).filter(function (a) { return a.name && a.value; }),
            skuProps: (od.skuProps || []).map(function (p) {
              return {
                prop: p.prop || "",
                values: (p.value || []).map(function (v) { return { name: v.name || "", imageUrl: v.imageUrl || "" }; }),
              };
            }),
            categoryId: od.leafCategoryId || "",
            categoryName: od.leafCategoryName || "",
            video: od.wirelessVideo
              ? { coverUrl: od.wirelessVideo.coverUrl || "", videoUrl: (od.wirelessVideo.videoUrls || {}).android || "", title: od.wirelessVideo.title || "" }
              : null,
            detailUrl: od.detailUrl || descFields.detailUrl || "",
            status: od.status || "",
            minPrice: tm.minPrice || "",
            maxPrice: tm.maxPrice || "",
            beginAmount: tm.beginAmount || 1,
            unit: tm.unit || "",
            saleCount: tm.saleCount || 0,
            currentPrices: (tm.offerPriceModel || {}).currentPrices || [],
            skuMap: (tm.skuMap || []).map(function (s) {
              return {
                skuId: s.skuId || "",
                specAttrs: s.specAttrs || "",
                price: s.price || "",
                discountPrice: s.discountPrice || "",
                canBookCount: s.canBookCount || 0,
                saleCount: s.saleCount || 0,
              };
            }),
            mixModel: tm.mixModel || null,
            companyName: sm.companyName || "",
            loginId: sm.loginId || "",
            userId: sm.userId || "",
            winportUrl: sm.winportUrl || "",
            goodRates: (db.rateInfo || {}).goodRates || null,
            goodsGrade: (db.rateInfo || {}).goodsGrade || null,
            favorCount: db.favorCount || 0,
            shopBaseInfo: db.shopBaseInfo || {},
            freightInfo: dd.freightInfo || {},
            packAttributes: od.packAttributes || [],
            packInfo: packFields,
            unitWeight: od.unitWeight || packFields.unitWeight || (dd.freightInfo || {}).unitWeight || null,
          },
        };
        source = "model";
      }

      if (!data && r.data) {
        var rd = r.data;
        var pt = (rd.productTitle || {}).fields || {};
        var mp = (rd.mainPrice || {}).fields || {};
        var gal = (rd.gallery || {}).fields || {};
        var desc = (rd.description || {}).fields || {};
        var ppi = (rd.productPackInfo || {}).fields || {};

        data = {
          contextData: {
            title: pt.title || "",
            saleNum: pt.saleNum || "",
            unit: mp.unit || pt.unit || "",
            priceModel: mp.priceModel || {},
            finalPriceModel: mp.finalPriceModel || {},
            originalPricesWithoutPromotion: mp.originalPricesWithoutPromotion || [],
            mainImage: gal.mainImage || [],
            offerImgList: gal.offerImgList || [],
            offerId: gal.offerId || "",
            subject: gal.subject || "",
            video: gal.video || null,
            detailUrl: desc.detailUrl || "",
            packInfo: ppi,
          },
        };
        source = "context";
      }
    }

    if (!data && window.__INIT_DATA__ && window.__INIT_DATA__.globalData) {
      var g = window.__INIT_DATA__.globalData;
      data = {
        globalData: {
          tempModel: g.tempModel || {},
          images: g.images || [],
          skuModel: g.skuModel || {},
          orderParamModel: g.orderParamModel || {},
        },
      };
      source = "__INIT_DATA__";
    }

    if (!data) return;

    window.postMessage(
      { type: "__ps_1688_detail_data", payload: JSON.stringify(data), source: source },
      window.location.origin
    );
  } catch (e) {
    console.debug('[bridge] error:', e.message);
  }
})();
