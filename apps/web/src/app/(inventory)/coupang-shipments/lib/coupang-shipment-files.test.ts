import { describe, expect, it } from 'vitest';
import {
  classifyCoupangShipmentFile,
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
});
