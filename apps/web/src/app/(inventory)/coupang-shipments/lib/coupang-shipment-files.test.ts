import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import {
  classifyCoupangShipmentFile,
  mergeCoupangShipmentFiles,
  sortCoupangShipmentFiles,
  type CoupangShipmentFileDraft,
} from './coupang-shipment-files';

describe('coupang shipment files', () => {
  it('classifies date, center, and kind from filenames', () => {
    const label = classifyCoupangShipmentFile(
      new File(['x'], '쿠팡_2026-06-30_인천28_Label.pdf', { type: 'application/pdf' }),
      '2026-06-28',
    );
    const statement = classifyCoupangShipmentFile(
      new File(['x'], '쿠팡_260630_창원1_내역서.pdf', { type: 'application/pdf' }),
      '2026-06-28',
    );

    expect(label.shipmentDate).toBe('2026-06-30');
    expect(label.center).toBe('인천28');
    expect(label.kind).toBe('label');
    expect(statement.shipmentDate).toBe('2026-06-30');
    expect(statement.center).toBe('창원1');
    expect(statement.kind).toBe('statement');
  });

  it('parses 8-digit yyyymmdd dates', () => {
    const draft = classifyCoupangShipmentFile(
      new File(['x'], '쿠팡_20260714_인천_Label.pdf', { type: 'application/pdf' }),
      '2026-07-11',
    );
    expect(draft.shipmentDate).toBe('2026-07-14');
  });

  it('does not misread long shipment-number digits as a date (falls back to batch date)', () => {
    // 같은 배치의 파일들이 쉽먼트 번호의 일부(958893…)를 가짜 날짜로 잡아 서로 다른 날짜로
    // 흩어지면 종류별 병합이 여러 개로 쪼개진다. 유효하지 않은 숫자열은 fallback 날짜로 모아야 한다.
    const a = classifyCoupangShipmentFile(
      new File(['x'], 'SHIPMENT_9588932828_Label.pdf', { type: 'application/pdf' }),
      '2026-07-11',
    );
    const b = classifyCoupangShipmentFile(
      new File(['x'], 'SHIPMENT_1234567890_Label.pdf', { type: 'application/pdf' }),
      '2026-07-11',
    );
    expect(a.shipmentDate).toBe('2026-07-11');
    expect(b.shipmentDate).toBe('2026-07-11');
    // → 같은 날짜 + 같은 종류라 병합 시 하나로 합쳐진다.
    expect(a.shipmentDate).toBe(b.shipmentDate);
  });

  it('sorts labels before statements and centers in shipment order', () => {
    const base = {
      id: 'id',
      file: new File(['x'], 'x.pdf', { type: 'application/pdf' }),
      shipmentDate: '2026-06-30',
    };
    const files = [
      { ...base, id: 'statement', name: '내역서.pdf', kind: 'statement', center: '서울2' },
      { ...base, id: 'changwon', name: '창원.pdf', kind: 'label', center: '창원1' },
      { ...base, id: 'incheon', name: '인천.pdf', kind: 'label', center: '인천28' },
      { ...base, id: 'seoul', name: '서울.pdf', kind: 'label', center: '서울2' },
    ] satisfies CoupangShipmentFileDraft[];

    expect(sortCoupangShipmentFiles(files).map((file) => file.id)).toEqual([
      'seoul',
      'incheon',
      'changwon',
      'statement',
    ]);
  });

  it('consolidates each kind into a single file regardless of date', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const bytes = await doc.save();
    const mkDraft = (
      id: string,
      kind: CoupangShipmentFileDraft['kind'],
      shipmentDate: string,
      center: string,
    ): CoupangShipmentFileDraft => ({
      id,
      name: `${id}.pdf`,
      kind,
      shipmentDate,
      center,
      file: new File([bytes as BlobPart], `${id}.pdf`, { type: 'application/pdf' }),
    });

    const drafts = [
      mkDraft('l1', 'label', '2026-07-11', '인천'),
      mkDraft('l2', 'label', '2026-07-12', '창원'), // 날짜가 달라도
      mkDraft('s1', 'statement', '2026-07-11', '인천'),
    ];

    const files = (await mergeCoupangShipmentFiles(drafts)).flatMap((result) => result.files);
    // 라벨 2개 + 내역서 1개 → 라벨 1개 + 내역서 1개로 통합 (날짜로 안 쪼갬)
    expect(files).toHaveLength(2);
    expect(files.map((file) => file.kind).sort()).toEqual(['label', 'statement']);
    expect(files.find((file) => file.kind === 'label')?.sourceCount).toBe(2);
  });
});
