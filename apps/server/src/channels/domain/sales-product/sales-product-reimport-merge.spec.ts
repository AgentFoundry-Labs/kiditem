import { ChannelIntegrityAdapter } from '../../adapter/out/integrity/channel-integrity.adapter';
import { describe, expect, it } from 'vitest';
import {
  mergeSabangnetReimport,
  sabangnetDetailDigests,
  type SabangnetReimportBasics,
} from './sales-product-reimport-merge';

const sha256 = new ChannelIntegrityAdapter().sha256;

function basics(overrides: Partial<SabangnetReimportBasics> = {}): SabangnetReimportBasics {
  return {
    name: '투명우산',
    ownCode: 'OWN-1',
    shortName: null,
    englishName: null,
    printName: null,
    modelName: '8321-1',
    modelNo: null,
    brand: '키드아이템',
    manufacturer: null,
    originCountry: '중국',
    originRegion: null,
    keywords: ['우산'],
    standardCategory: null,
    description: '',
    targetAudience: null,
    ageGroup: null,
    productSize: null,
    colorVariantNames: [],
    boxSetQuantity: null,
    registrationDefaults: null,
    status: 'active',
    taxType: 'taxable',
    deliveryFeeType: null,
    deliveryFee: null,
    stockManaged: false,
    imageUrls: ['https://pic.sabangnet.co.kr/a.jpg', 'https://pic.sabangnet.co.kr/b.jpg'],
    noticeCategory: '01',
    noticeValues: ['면', '중국'],
    certifications: [{
      number: 'CB-1', issuer: 'KTR', field: null, validFrom: null, validTo: null,
      issuedAt: null, certifiedAt: null, imageUrl: null,
    }],
    kcStatus: 'exists',
    importDeclarationNo: null,
    adminMemo: '메모',
    ...overrides,
  };
}

function baselineOf(record: SabangnetReimportBasics) {
  return { basics: record };
}

describe('Sabangnet reimport three-way merge', () => {
  it('takes the file value for a field nobody edited since the last import', () => {
    const last = basics();
    const file = basics({ name: '투명우산 그리기', noticeValues: ['면', '베트남'] });

    const result = mergeSabangnetReimport({ current: last, incoming: file, baseline: baselineOf(last) });

    expect(result.merged.name).toBe('투명우산 그리기');
    expect(result.merged.noticeValues).toEqual(['면', '베트남']);
    expect(result.updated).toEqual(['name', 'noticeValues']);
    expect(result.preserved).toEqual([]);
  });

  it('keeps the operator value for a field that differs from what the last import produced', () => {
    const last = basics();
    const current = basics({
      noticeValues: ['면', '한국'],
      kcStatus: 'none',
      certifications: [],
      adminMemo: '운영 메모',
      imageUrls: ['https://storage.example/own.jpg', 'https://pic.sabangnet.co.kr/b.jpg'],
    });
    const file = basics({
      noticeValues: ['면', '베트남'],
      adminMemo: '사방넷 메모',
      imageUrls: ['https://pic.sabangnet.co.kr/c.jpg'],
      brand: '새 브랜드',
    });

    const result = mergeSabangnetReimport({ current, incoming: file, baseline: baselineOf(last) });

    expect(result.merged).toMatchObject({
      noticeValues: ['면', '한국'],
      kcStatus: 'none',
      certifications: [],
      adminMemo: '운영 메모',
      imageUrls: ['https://storage.example/own.jpg', 'https://pic.sabangnet.co.kr/b.jpg'],
      brand: '새 브랜드',
    });
    expect(result.preserved).toEqual(['imageUrls', 'noticeValues', 'certifications', 'kcStatus', 'adminMemo']);
    expect(result.updated).toEqual(['brand']);
  });

  it('keeps every current value when there is no baseline', () => {
    const current = basics({ adminMemo: '운영 메모' });
    const file = basics({ name: '다른 이름', adminMemo: null });

    const result = mergeSabangnetReimport({ current, incoming: file, baseline: null });

    expect(result.merged).toEqual(current);
    expect(result.updated).toEqual([]);
    expect(result.preserved).toEqual(['name', 'adminMemo']);
  });

  it('compares arrays and certification objects by value, not by identity or key order', () => {
    const last = basics();
    const current = basics({
      keywords: [...last.keywords],
      // PostgreSQL jsonb returns object keys in its own order.
      certifications: [{
        imageUrl: null, certifiedAt: null, issuedAt: null, validTo: null, validFrom: null,
        field: null, issuer: 'KTR', number: 'CB-1',
      }],
    });
    const file = basics({ keywords: ['우산', '미술'], certifications: [] });

    const result = mergeSabangnetReimport({ current, incoming: file, baseline: baselineOf(last) });

    expect(result.merged.keywords).toEqual(['우산', '미술']);
    expect(result.merged.certifications).toEqual([]);
    expect(result.preserved).toEqual([]);
  });

  it('treats a reordered image list as an operator edit', () => {
    const last = basics();
    const current = basics({ imageUrls: [...last.imageUrls].reverse() });
    const file = basics({ imageUrls: ['https://pic.sabangnet.co.kr/c.jpg'] });

    const result = mergeSabangnetReimport({ current, incoming: file, baseline: baselineOf(last) });

    expect(result.merged.imageUrls).toEqual([...last.imageUrls].reverse());
    expect(result.preserved).toEqual(['imageUrls']);
  });

  it('always keeps the draft fields the Sabangnet file never carries, without reporting them', () => {
    const last = basics();
    const current = basics({
      description: '운영자 설명', targetAudience: '유아', ageGroup: '3세+', productSize: '20cm',
      colorVariantNames: ['빨강'], boxSetQuantity: 12, registrationDefaults: { deliveryDays: 2 },
    });

    const result = mergeSabangnetReimport({ current, incoming: basics(), baseline: baselineOf(last) });

    expect(result.merged).toMatchObject({
      description: '운영자 설명', targetAudience: '유아', ageGroup: '3세+', productSize: '20cm',
      colorVariantNames: ['빨강'], boxSetQuantity: 12, registrationDefaults: { deliveryDays: 2 },
    });
    expect(result.preserved).toEqual([]);
    expect(result.updated).toEqual([]);
  });

  it('fills an empty own code from the file', () => {
    const last = basics({ ownCode: null });
    const result = mergeSabangnetReimport({
      current: last, incoming: basics({ ownCode: 'OWN-2' }), baseline: baselineOf(last),
    });
    expect(result.merged.ownCode).toBe('OWN-2');
  });

  it('never replaces a set own code with the file one', () => {
    const last = basics();
    const result = mergeSabangnetReimport({
      current: last, incoming: basics({ ownCode: 'OWN-2' }), baseline: baselineOf(last),
    });
    expect(result.merged.ownCode).toBe('OWN-1');
    expect(result.updated).toEqual([]);
    expect(result.preserved).toEqual([]);
  });

  it('digests an empty detail as empty so a missing and a blank detail agree', () => {
    expect(sabangnetDetailDigests({ detailHtml: null, extraDetailHtml: [] }, sha256))
      .toEqual({ detailHtml: '', extraDetailHtml: '' });
    expect(sabangnetDetailDigests({ detailHtml: 'x', extraDetailHtml: ['x', 'y'] }, sha256))
      .toEqual({
        detailHtml: '2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881',
        extraDetailHtml: '2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881,'
          + 'a1fce4363854ff888cff4b8e7875d600c2682390412a8cf79b37d0b11148b0fa',
      });
  });
});
