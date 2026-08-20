chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'searchWingCatalogProducts') {
    searchWingCatalogProducts(msg).then(sendResponse);
    return true;
  }
});
