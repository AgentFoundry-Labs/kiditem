chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'runCoupangCompetitorSellerCatalog') {
    startCoupangCompetitorSellerCatalogCollection(msg);
    sendResponse({ ok: true });
    return true;
  }
});
