// Opens the Coupang Wing product inventory page in a new tab so the user can
// drag-and-drop the AI-generated thumbnail into the Wing editor.
export function openCoupangWingInventory(): void {
  window.open(
    'https://wing.coupang.com/vendor-inventory/list?searchKeywordType=ALL&searchKeywords=&salesMethod=ALL&productStatus=ALL&stockSearchType=ALL&shippingFeeSearchType=ALL&displayCategoryCodes=&listingStartTime=null&listingEndTime=null&saleEndDateSearchType=ALL&bundledShippingSearchType=ALL&upBundling=ALL&displayDeletedProduct=false&shippingMethod=ALL&exposureStatus=ALL&locale=ko_KR&sortMethod=SORT_BY_ITEM_LEVEL_UNIT_SOLD&countPerPage=50&page=1',
    '_blank',
  );
}
