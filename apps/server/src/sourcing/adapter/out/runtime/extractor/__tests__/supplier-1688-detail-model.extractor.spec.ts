import { describe, expect, it } from 'vitest';
import { supplier1688DetailModelSnapshotFixture } from '../__fixtures__/supplier-1688-detail-model.fixture';
import { extract1688DetailModelSnapshot } from '../supplier-1688-detail-model.extractor';

describe('extract1688DetailModelSnapshot', () => {
  it('extracts a product snapshot from the modern 1688 window.context detail model', () => {
    const result = extract1688DetailModelSnapshot(
      supplier1688DetailModelSnapshotFixture,
    );

    expect(result).toEqual(
      expect.objectContaining({
        product_id: '767987154308',
        title:
          '국경 간 어린이 원격 제어 탱크 장난감 오프로드 차량은 물 폭탄 전기 2.4g 등반 자동차 소년 도매를 발사 할 수 있습니다.',
        price_min: 27,
        price_max: 29,
        currency: 'CNY',
        moq: 1,
        unit: '盒',
        sales_volume: 321,
        category_id: '122962002',
        category_name: '遥控车',
        supplier_name: '汕头市迂夫子玩具科技有限公司',
        seller_login_id: '迂夫子玩具批发',
        seller_user_id: '2207908046238',
        seller_store_url: 'https://shop61883j118sj17.1688.com',
        good_rates: 98.8,
        goods_grade: 5,
        favor_count: 205,
        shop_repeat_rate: '62.29%',
        location: '广东省汕头市',
        delivery_fee: 'TEMPLATED',
        unit_weight: 0,
        mix_amount: 10,
        mix_number: 2,
        _detail_url: 'https://itemcdn.tmall.com/1688offer/icoss1306087057a3a1aeb487db1b72',
        _extraction_method: '1688_context_model',
      }),
    );
    expect(result?.images).toEqual([
      'https://cbu01.alicdn.com/img/ibank/O1CN01XFglFt1vx3aHYqDQD_!!2207908046238-0-cib.jpg',
      'https://cbu01.alicdn.com/img/ibank/O1CN01EB5Tpu1vx3aHYgsqb_!!2207908046238-0-cib.jpg',
    ]);
    expect(result?.price_tiers).toEqual([
      { beginAmount: 1, price: '27.00' },
      { beginAmount: 1, price: '29.00' },
    ]);
    expect(result?.sku_attrs).toEqual([
      {
        name: '색상',
        values: [
          '[800리모컨탱크 전자상거래 모델] 노란색',
          '[800리모컨탱크 전자상거래 모델] 블루',
          '[800 리모콘 탱크 컬러박스 모델] 노란색',
          '[800 리모콘 탱크 컬러박스 모델] 블루',
        ],
      },
    ]);
    expect(result?.sku_list).toEqual([
      expect.objectContaining({
        skuId: '5789866389356',
        specAttrs: '[800 리모콘 탱크 컬러박스 모델] 노란색',
        price: '29.00',
        canBookCount: 9087,
      }),
      expect.objectContaining({
        skuId: '5789866389355',
        specAttrs: '[800리모컨탱크 전자상거래 모델] 블루',
        price: '27.00',
        canBookCount: 9006,
      }),
    ]);
    expect(result?.specs).toEqual([
      { key: '유형', value: '배터리,무선 원격 제어,충전' },
      { key: '브랜드', value: '장난감' },
      { key: '원산지', value: '중국 본토' },
    ]);
    expect(result?.pack_info).toEqual([
      {
        key: '[800리모컨탱크 전자상거래 모델] 노란색',
        value: '长(cm):27.5, 宽(cm):27.5, 高(cm):15.5, 体积(cm³):11721.875, 重量(g):400',
      },
    ]);
  });

  it('falls back to main images and sku prices when top-level price fields are absent', () => {
    const result = extract1688DetailModelSnapshot({
      model: {
        offerDetail: {
          offerId: 'offer-1',
          subject: '테스트 상품',
          mainImageList: [{ fullPathImageURI: 'https://img.example/main.jpg' }],
        },
        tradeModel: {
          skuMap: [
            { skuId: 'sku-1', specAttrs: 'red', price: '12.50' },
            { skuId: 'sku-2', specAttrs: 'blue', discountPrice: '15.00' },
          ],
        },
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        product_id: 'offer-1',
        title: '테스트 상품',
        images: ['https://img.example/main.jpg'],
        price_min: 12.5,
        price_max: 15,
      }),
    );
  });

  it('returns null when the model has no identifying detail fields', () => {
    expect(extract1688DetailModelSnapshot({ model: { offerDetail: {} } })).toBeNull();
    expect(extract1688DetailModelSnapshot(null)).toBeNull();
  });
});
