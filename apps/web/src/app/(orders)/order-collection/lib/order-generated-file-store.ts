import type { OrderCollectionConversionResult } from './order-collection-api';

export interface StoredOrderCollectionFile extends OrderCollectionConversionResult {
  id: string;
  sourceName: string;
  convertedAt: number;
}

const DB_NAME = 'kiditem-order-collection-files';
const STORE_NAME = 'files';
const DB_VERSION = 1;
const MAX_FILES = 100;

export async function loadGeneratedOrderFiles(): Promise<StoredOrderCollectionFile[]> {
  if (!canUseIndexedDb()) return [];
  const db = await openDb();
  const files = await readAll(db);
  db.close();
  return files.sort((a, b) => b.convertedAt - a.convertedAt);
}

export async function saveGeneratedOrderFile(file: StoredOrderCollectionFile): Promise<void> {
  if (!canUseIndexedDb()) return;
  const db = await openDb();
  await putFile(db, file);
  const files = await readAll(db);
  const staleFiles = files
    .sort((a, b) => b.convertedAt - a.convertedAt)
    .slice(MAX_FILES);
  await Promise.all(staleFiles.map((item) => deleteFile(db, item.id)));
  db.close();
}

function canUseIndexedDb(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('생성 파일 저장소를 열 수 없습니다.'));
  });
}

function readAll(db: IDBDatabase): Promise<StoredOrderCollectionFile[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as StoredOrderCollectionFile[]);
    request.onerror = () => reject(request.error ?? new Error('생성 파일 목록을 읽을 수 없습니다.'));
  });
}

function putFile(db: IDBDatabase, file: StoredOrderCollectionFile): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const request = transaction.objectStore(STORE_NAME).put(file);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('생성 파일을 저장할 수 없습니다.'));
  });
}

function deleteFile(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const request = transaction.objectStore(STORE_NAME).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('생성 파일을 정리할 수 없습니다.'));
  });
}
