import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL(
    "../../coupang-ads-scraper/utils/coupang-seller-detail.js",
    import.meta.url,
  ),
  "utf8",
);
const context = vm.createContext({ URL });
vm.runInContext(source, context);
const { extractCoupangSellerDetail, extractCoupangSellerShopLink } =
  context.KidItemCoupangSellerDetail;

test("extracts seller identity from the rendered product-page shop link", () => {
  const result = extractCoupangSellerShopLink({
    href: "https://shop.coupang.com/vid/A01596861?source=brandstore_sdp_atf",
    text: "말랑코코판매자 상품 보러가기",
  });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    sellerName: "말랑코코",
    sellerId: "A01596861",
    sellerStoreUrl: "https://shop.coupang.com/vid/A01596861",
  });
});

test("extracts seller name and id from Coupang embedded product data", () => {
  const result = extractCoupangSellerDetail(`
    <script>
      window.__PRODUCT__ = {"vendorId":"vendor-42","vendorName":"키즈\\uB9C8\\uCF13"};
    </script>
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    sellerName: "키즈마켓",
    sellerId: "vendor-42",
    sellerStoreUrl: "https://shop.coupang.com/vendor-42",
  });
});

test("falls back to JSON-LD seller organization name", () => {
  const result = extractCoupangSellerDetail(`
    <script type="application/ld+json">
      {"offers":{"seller":{"@type":"Organization","name":"문구&amp;완구 연구소"}}}
    </script>
  `);

  assert.equal(result?.sellerName, "문구&완구 연구소");
  assert.equal(result?.sellerId, null);
  assert.equal(result?.sellerStoreUrl, null);
});

test("extracts seller name from Coupang nested escaped state", () => {
  const result = extractCoupangSellerDetail(
    String.raw`<script>{"state":"{\\\"sellerDetailInfo\\\":{\\\"vendorName\\\":\\\"넥스트팬지아(주)\\\"}}"}</script>`,
  );

  assert.equal(result?.sellerName, "넥스트팬지아(주)");
  assert.equal(result?.sellerId, null);
  assert.equal(result?.sellerStoreUrl, null);
});

test("extracts the canonical seller shop from the product detail link", () => {
  const result = extractCoupangSellerDetail(`
    <a href="https://shop.coupang.com/vid/A00744213?source=brandstore_sdp_atf">
      넥스트팬지아(주) 판매자 상품 보러가기
    </a>
  `);

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    sellerName: null,
    sellerId: "A00744213",
    sellerStoreUrl: "https://shop.coupang.com/A00744213",
  });
});

test("returns null instead of inventing a seller when detail data is absent", () => {
  assert.equal(
    extractCoupangSellerDetail(
      "<html><body><h1>캐릭터 연필 세트</h1></body></html>",
    ),
    null,
  );
});
