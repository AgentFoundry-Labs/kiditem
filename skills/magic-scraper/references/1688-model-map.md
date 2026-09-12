# 1688 Model Map

Use this reference only when authoring or repairing 1688 scrapers from a rendered detail page.

## Detail Page Root

Most modern 1688 detail pages expose product data at:

```text
window.context.result.global.globalData.model
```

Useful children:

```text
model.offerDetail
model.tradeModel
model.sellerModel
model.detailBusiness
model.detailDescription
window.context.result.data
```

## Field Mapping

| Output field | Preferred source |
|---|---|
| `product_id` | `offerDetail.offerId` |
| `title` | `offerDetail.subject` |
| `images` | `offerDetail.imageList[].fullPathImageURI`, then `mainImageList[]` |
| `price_min` | `tradeModel.minPrice` |
| `price_max` | `tradeModel.maxPrice` |
| `moq` | `tradeModel.beginAmount` |
| `unit` | `tradeModel.unit` |
| `sales_volume` | `tradeModel.saleCount` |
| `price_tiers` | `tradeModel.offerPriceModel.currentPrices[]` |
| `sku_attrs` | `offerDetail.skuProps[]` |
| `sku_list` | `tradeModel.skuMap[]` |
| `specs` | `offerDetail.featureAttributes[]` |
| `category_id` | `offerDetail.leafCategoryId` |
| `category_name` | `offerDetail.leafCategoryName` |
| `supplier_name` | `sellerModel.companyName` |
| `seller_login_id` | `sellerModel.loginId` |
| `seller_user_id` | `sellerModel.userId` |
| `seller_store_url` | `sellerModel.winportUrl` |
| `good_rates` | `detailBusiness.rateInfo.goodRates` |
| `goods_grade` | `detailBusiness.rateInfo.goodsGrade` |
| `favor_count` | `detailBusiness.favorCount` |
| `shop_repeat_rate` | `detailBusiness.shopBaseInfo.byrRepeatRate3m` |
| `location` | `detailDescription.freightInfo.location` |
| `delivery_fee` | `detailDescription.freightInfo.totalCost` |
| `unit_weight` | `offerDetail.unitWeight`, `result.data.productPackInfo.fields.unitWeight`, or `detailDescription.freightInfo.unitWeight` |
| `detail_description_url` | `result.data.description.fields.detailUrl` |

## Collection Pages

`show.1688.com` collection pages may not expose rich product models. First extract detail URLs from anchors matching:

```text
https://detail.1688.com/offer/<offerId>.html
```

Then open each detail URL and extract from the detail model above.

## Fixture Guidance

Keep fixtures small:

- include one representative product per page family
- keep arrays short when a full list is not needed for the assertion
- remove cookies, headers, browser profile paths, user identifiers unrelated to seller/product data, and raw HTML unless the test needs it
