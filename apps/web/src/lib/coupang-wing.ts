const WING_URL =
  'https://wing.coupang.com/vendor-inventory/list?searchKeywordType=ALL&searchKeywords=&salesMethod=ALL&productStatus=ALL&stockSearchType=ALL&shippingFeeSearchType=ALL&displayCategoryCodes=&listingStartTime=null&listingEndTime=null&saleEndDateSearchType=ALL&bundledShippingSearchType=ALL&upBundling=ALL&displayDeletedProduct=false&shippingMethod=ALL&exposureStatus=ALL&locale=ko_KR&sortMethod=SORT_BY_ITEM_LEVEL_UNIT_SOLD&countPerPage=50&page=1';

// Opens the Coupang Wing product inventory page in a new tab.
export function openCoupangWingInventory(searchKeyword?: string | null): void {
  const url = new URL(WING_URL);
  if (searchKeyword) {
    url.searchParams.set('searchKeywords', searchKeyword);
  }
  const a = document.createElement('a');
  a.href = url.toString();
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
