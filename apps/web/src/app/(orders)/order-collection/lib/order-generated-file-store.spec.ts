import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createStoredTrackingFile,
  loadGeneratedOrderFiles,
  normalizeGeneratedOrderFileRecord,
  saveGeneratedOrderFile,
  withoutSellpiaTransferConfirmation,
  withSellpiaTransferNeedsConfirmation,
  withSellpiaTransmissionRequested,
  type StoredOrderCollectionFile,
} from './order-generated-file-store';

const DB_NAME = 'kiditem-order-collection-files';
const STORE_NAME = 'files';

type LegacyStoredOrderCollectionFile = StoredOrderCollectionFile & {
  sentAt?: number;
};

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
  beforeEach(() => {
    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      value: new IDBFactory(),
    });
  });

  it('normalizes legacy sentAt only while reading stored records', () => {
    const normalized = normalizeGeneratedOrderFileRecord({
      ...generatedFile(),
      sentAt: 200,
    });

    expect(normalized.transmissionRequestedAt).toBe(200);
    expect(normalized).not.toHaveProperty('sentAt');
  });

  it('migrates a legacy IndexedDB row and persists only transmissionRequestedAt', async () => {
    await seedStoredFile({ ...generatedFile(), sentAt: 200 });

    const [loaded] = await loadGeneratedOrderFiles();
    expect(loaded.transmissionRequestedAt).toBe(200);
    expect(loaded).not.toHaveProperty('sentAt');

    const updated = withSellpiaTransmissionRequested(loaded, 300);
    await saveGeneratedOrderFile(updated);
    expect(updated.transmissionRequestedAt).toBe(300);
    expect(updated).not.toHaveProperty('sentAt');

    const persisted = await readStoredFile(updated.id);
    expect(persisted?.transmissionRequestedAt).toBe(300);
    expect(persisted).not.toHaveProperty('sentAt');
  });

  it('셀피아 확인 필요 전송을 남겼다가 확인하면 전송 요청으로, 닫으면 표시만 지운다(원천 실행 id는 그대로)', async () => {
    const source = { ...generatedFile(), sourceOperationId: '22222222-2222-4222-8222-222222222222' };
    const pending = withSellpiaTransferNeedsConfirmation(source, 'transfer-op');
    await saveGeneratedOrderFile(pending);
    expect((await readStoredFile(source.id))?.sellpiaTransferConfirmationId).toBe('transfer-op');
    expect(pending).not.toHaveProperty('transmissionRequestedAt');

    const confirmed = withSellpiaTransmissionRequested(pending, 400);
    expect(confirmed).not.toHaveProperty('sellpiaTransferConfirmationId');
    expect(confirmed).toMatchObject({ transmissionRequestedAt: 400, sourceOperationId: source.sourceOperationId });

    const closed = withoutSellpiaTransferConfirmation(pending);
    expect(closed).not.toHaveProperty('sellpiaTransferConfirmationId');
    expect(closed).not.toHaveProperty('transmissionRequestedAt');
  });

  it('persists generated tracking files separately from order files', async () => {
    const tracking = await createStoredTrackingFile({
      fileName: '아트공구_송장_20260727.csv',
      blob: new Blob(['주문번호,송장번호\r\nA-1,T-1'], { type: 'text/csv;charset=utf-8' }),
      previewRows: [['주문번호', '송장번호'], ['A-1', 'T-1']],
      rowCount: 1,
      mallKey: 'art09',
      mallName: '아트공구',
      collectionDate: '2026-07-27',
      convertedAt: 123456789,
    });

    await saveGeneratedOrderFile(tracking);
    const [loaded] = await loadGeneratedOrderFiles();

    expect(loaded?.fileKind).toBe('tracking');
    expect(loaded?.collectionMode).toBe('tracking');
    expect(loaded?.fileName).toBe('아트공구_송장_20260727.csv');
    expect(loaded?.outputRows).toBe(1);
    expect(await tracking.blob.text()).toContain('A-1,T-1');
    expect(loaded?.blob).toBeDefined();
  });
});

async function seedStoredFile(file: LegacyStoredOrderCollectionFile): Promise<void> {
  const db = await openTestDatabase();
  const transaction = db.transaction(STORE_NAME, 'readwrite');
  const completed = waitForTransaction(transaction);
  await waitForRequest(transaction.objectStore(STORE_NAME).put(file));
  await completed;
  db.close();
}

async function readStoredFile(
  id: string,
): Promise<LegacyStoredOrderCollectionFile | undefined> {
  const db = await openTestDatabase();
  const transaction = db.transaction(STORE_NAME, 'readonly');
  const completed = waitForTransaction(transaction);
  const file = await waitForRequest<LegacyStoredOrderCollectionFile | undefined>(
    transaction.objectStore(STORE_NAME).get(id),
  );
  await completed;
  db.close();
  return file;
}

function openTestDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function waitForRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
