(function () {
  try {
    var d = window.detailData;
    if (!d || !d.globalData) return;
    var g = d.globalData;
    var slim = {
      globalData: {
        product: g.product || {},
        seller: g.seller || {},
        trade: g.trade || {},
        certification: g.certification || {},
        certificationLogos: g.certificationLogos || [],
      },
    };
    window.postMessage(
      { type: "__ps_detail_data", payload: JSON.stringify(slim) },
      "*"
    );
  } catch (e) {}
})();
