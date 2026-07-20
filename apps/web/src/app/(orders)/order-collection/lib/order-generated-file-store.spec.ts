import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadGeneratedOrderFiles,
  markGeneratedOrderFileTransmissionRequested,
  normalizeGeneratedOrderFileRecord,
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

    const updated = await markGeneratedOrderFileTransmissionRequested(
      loaded,
      300,
    );
    expect(updated.transmissionRequestedAt).toBe(300);
    expect(updated).not.toHaveProperty('sentAt');

    const persisted = await readStoredFile(updated.id);
    expect(persisted?.transmissionRequestedAt).toBe(300);
    expect(persisted).not.toHaveProperty('sentAt');
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
