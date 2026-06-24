export interface Supplier1688DetailModelSnapshot {
  model: Record<string, unknown>;
  data?: Record<string, unknown> | null;
}

export function extract1688DetailModelSnapshot(
  snapshot: unknown,
): Record<string, unknown> | null {
  if (!isRecord(snapshot)) return null;
  const model = recordField(snapshot, 'model');
  if (!model) return null;

  const offerDetail = recordField(model, 'offerDetail');
  if (!offerDetail) return null;

  const tradeModel = recordField(model, 'tradeModel') ?? {};
  const sellerModel = recordField(model, 'sellerModel') ?? {};
  const detailBusiness = recordField(model, 'detailBusiness') ?? {};
  const detailDescription = recordField(model, 'detailDescription') ?? {};
  const data = recordField(snapshot, 'data') ?? {};

  const title = stringField(offerDetail.subject);
  const productId = stringField(offerDetail.offerId);
  if (!title && !productId) return null;

  const detailUrl =
    stringField(offerDetail.detailUrl) ??
    stringField(nestedRecord(data, ['description', 'fields'])?.detailUrl);
  const productPackInfo = nestedRecord(data, ['productPackInfo', 'fields']);
  const freightInfo = recordField(detailDescription, 'freightInfo');
  const rateInfo = recordField(detailBusiness, 'rateInfo');
  const shopBaseInfo = recordField(detailBusiness, 'shopBaseInfo');
  const video = recordField(offerDetail, 'wirelessVideo');
  const videoUrls = recordField(video, 'videoUrls');
  const mixModel = recordField(tradeModel, 'mixModel');

  const minPrice = numberField(tradeModel.minPrice);
  const maxPrice = numberField(tradeModel.maxPrice);
  const images = imageUris(arrayField(offerDetail.imageList));
  const mainImages = imageUris(arrayField(offerDetail.mainImageList));
  const skuMap = arrayField(tradeModel.skuMap);
  const skuPrices = skuMap
    .map((item) => {
      const record = recordField(item);
      return numberField(record?.discountPrice) ?? numberField(record?.price);
    })
    .filter((value): value is number => value !== null && value > 0);
  const supportsMix = booleanField(mixModel?.supportMix);

  return {
    product_id: productId,
    title,
    images: images.length > 0 ? images : mainImages,
    price_min: minPrice ?? minOrNull(skuPrices),
    price_max: maxPrice && maxPrice !== minPrice ? maxPrice : maxOrNull(skuPrices),
    currency: 'CNY',
    moq: numberField(tradeModel.beginAmount),
    unit: stringField(tradeModel.unit) ?? '',
    sales_volume: numberField(tradeModel.saleCount) ?? 0,
    price_tiers: priceTiers(recordField(tradeModel, 'offerPriceModel')),
    sku_attrs: skuAttrs(arrayField(offerDetail.skuProps)),
    sku_list: skuList(skuMap),
    specs: featureAttributes(arrayField(offerDetail.featureAttributes)),
    category_id: stringField(offerDetail.leafCategoryId) ?? '',
    category_name: stringField(offerDetail.leafCategoryName) ?? '',
    supplier_name: stringField(sellerModel.companyName) ?? '',
    seller_login_id: stringField(sellerModel.loginId) ?? '',
    seller_user_id: stringField(sellerModel.userId) ?? '',
    seller_store_url: stringField(sellerModel.winportUrl) ?? '',
    video_url: stringField(videoUrls?.android) ?? stringField(videoUrls?.ios) ?? '',
    video_cover: stringField(video?.coverUrl) ?? '',
    good_rates: numberField(rateInfo?.goodRates),
    goods_grade: numberField(rateInfo?.goodsGrade),
    favor_count: numberField(detailBusiness.favorCount) ?? 0,
    shop_repeat_rate: stringField(shopBaseInfo?.byrRepeatRate3m) ?? '',
    shop_card_type: stringField(shopBaseInfo?.cardType) ?? '',
    location: stringField(freightInfo?.location) ?? '',
    delivery_fee: stringField(freightInfo?.totalCost) ?? stringField(freightInfo?.deliveryFee) ?? null,
    unit_weight:
      numberField(offerDetail.unitWeight) ??
      numberField(productPackInfo?.unitWeight) ??
      numberField(freightInfo?.unitWeight),
    pack_info: packInfo(productPackInfo),
    mix_amount: supportsMix ? numberField(mixModel?.mixAmount) : null,
    mix_number: supportsMix ? numberField(mixModel?.mixNumber) : null,
    _detail_url: detailUrl ?? '',
    _extraction_method: '1688_context_model',
  };
}

function imageUris(items: unknown[]): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const item of items) {
    const record = recordField(item);
    const url = stringField(record?.fullPathImageURI);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

function priceTiers(priceModel: Record<string, unknown> | null): Array<Record<string, unknown>> {
  return arrayField(priceModel?.currentPrices)
    .map((item): Record<string, unknown> | null => {
      const record = recordField(item);
      if (!record) return null;
      const price = stringField(record.price);
      if (!price) return null;
      return {
        beginAmount: numberField(record.beginAmount),
        price,
      };
    })
    .filter((item): item is Record<string, unknown> => item !== null);
}

function skuAttrs(items: unknown[]): Array<Record<string, unknown>> {
  return items
    .map((item): Record<string, unknown> | null => {
      const record = recordField(item);
      if (!record) return null;
      const name = stringField(record.prop);
      const values = arrayField(record.value)
        .map((value) => {
          const valueRecord = recordField(value);
          return stringField(valueRecord?.name) ?? stringField(valueRecord?.imageUrl);
        })
        .filter((value): value is string => Boolean(value));
      return name && values.length > 0 ? { name, values } : null;
    })
    .filter((item): item is Record<string, unknown> => item !== null);
}

function skuList(items: unknown[]): Array<Record<string, unknown>> {
  return items
    .map((item): Record<string, unknown> | null => {
      const record = recordField(item);
      if (!record) return null;
      return {
        skuId: stringField(record.skuId) ?? '',
        specAttrs: stringField(record.specAttrs) ?? '',
        price: stringField(record.price) ?? '',
        discountPrice: stringField(record.discountPrice) ?? '',
        canBookCount: numberField(record.canBookCount) ?? 0,
        saleCount: numberField(record.saleCount) ?? 0,
      };
    })
    .filter((item): item is Record<string, unknown> => item !== null);
}

function featureAttributes(items: unknown[]): Array<Record<string, unknown>> {
  return items
    .map((item): Record<string, unknown> | null => {
      const record = recordField(item);
      if (!record) return null;
      const key = stringField(record.name);
      const value = stringField(record.value);
      return key && value ? { key, value } : null;
    })
    .filter((item): item is Record<string, unknown> => item !== null);
}

function packInfo(fields: Record<string, unknown> | null): Array<Record<string, unknown>> {
  const pieceWeightScale = recordField(fields?.pieceWeightScale);
  const rows = arrayField(pieceWeightScale?.pieceWeightScaleInfo);
  const columns = arrayField(pieceWeightScale?.columnList);
  if (rows.length === 0 || columns.length === 0) return [];

  const labels = new Map<string, string>();
  for (const column of columns) {
    const record = recordField(column);
    const name = stringField(record?.name);
    if (!name) continue;
    labels.set(name, stringField(record?.label) ?? name);
  }
  const skuColumn = stringField(recordField(columns[0])?.name) ?? 'sku1';

  return rows
    .map((row): Record<string, unknown> | null => {
      const record = recordField(row);
      if (!record) return null;
      const key = stringField(record[skuColumn]);
      const parts: string[] = [];
      for (const [name, label] of labels.entries()) {
        if (name === skuColumn || name === 'skuId') continue;
        const value = record[name];
        if (value === null || value === undefined || value === '') continue;
        parts.push(`${label}:${String(value)}`);
      }
      return key && parts.length > 0 ? { key, value: parts.join(', ') } : null;
    })
    .filter((item): item is Record<string, unknown> => item !== null);
}

function nestedRecord(
  root: Record<string, unknown>,
  path: string[],
): Record<string, unknown> | null {
  let current: unknown = root;
  for (const key of path) {
    const record = recordField(current);
    if (!record) return null;
    current = record[key];
  }
  return recordField(current);
}

function recordField(value: unknown, key?: string): Record<string, unknown> | null {
  const target = key && isRecord(value) ? value[key] : value;
  return isRecord(target) ? target : null;
}

function arrayField(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringField(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function numberField(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const parsed = Number(value.replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function booleanField(value: unknown): boolean {
  return value === true;
}

function minOrNull(values: number[]): number | null {
  return values.length > 0 ? Math.min(...values) : null;
}

function maxOrNull(values: number[]): number | null {
  if (values.length <= 1) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return max !== min ? max : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
