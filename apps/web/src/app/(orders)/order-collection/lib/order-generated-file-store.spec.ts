import { describe, expect, it } from 'vitest';
import {
  markGeneratedOrderFileTransmissionRequested,
  normalizeGeneratedOrderFileRecord,
  type StoredOrderCollectionFile,
} from './order-generated-file-store';

function generatedFile(): StoredOrderCollectionFile {
  return {
    id: 'legacy-file',
    fileName: 'orders.xlsx',
    sourceName: 'orders.csv',
    blob: new Blob(['orders']),
    previewRows: [],
    sourceRows: 1,
    productRows: 1,
    outputRows: 2,
    skippedRows: 0,
    convertedAt: 100,
  };
}

describe('generated order file transmission storage', () => {
  it('normalizes legacy sentAt only while reading stored records', () => {
    const normalized = normalizeGeneratedOrderFileRecord({
      ...generatedFile(),
      sentAt: 200,
    });

    expect(normalized.transmissionRequestedAt).toBe(200);
    expect(normalized).not.toHaveProperty('sentAt');
  });

  it('writes only transmissionRequestedAt for new transmission requests', async () => {
    const updated = await markGeneratedOrderFileTransmissionRequested(
      { ...generatedFile(), sentAt: 200 } as StoredOrderCollectionFile,
      300,
    );

    expect(updated.transmissionRequestedAt).toBe(300);
    expect(updated).not.toHaveProperty('sentAt');
  });
});
