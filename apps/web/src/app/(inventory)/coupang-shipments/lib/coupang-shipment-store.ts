'use client';

import type { CoupangShipmentMergedFile } from './coupang-shipment-files';

const DB_NAME = 'kiditem-coupang-shipments';
const STORE_NAME = 'merged-files';
const DB_VERSION = 1;
const MAX_FILES = 300;

export async function loadCoupangShipmentFiles(): Promise<CoupangShipmentMergedFile[]> {
  if (!canUseIndexedDb()) return [];
  const db = await openDb();
  const files = await readAll(db);
  db.close();
  return files.sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveCoupangShipmentFiles(files: CoupangShipmentMergedFile[]): Promise<void> {
  if (!canUseIndexedDb()) return;
  const db = await openDb();
  await Promise.all(files.map((file) => putFile(db, file)));
  const all = await readAll(db);
  const staleFiles = all.sort((a, b) => b.createdAt - a.createdAt).slice(MAX_FILES);
  await Promise.all(staleFiles.map((file) => deleteFile(db, file.id)));
  db.close();
}

export async function deleteCoupangShipmentFile(id: string): Promise<void> {
  if (!canUseIndexedDb()) return;
  const db = await openDb();
  await deleteFile(db, id);
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
    request.onerror = () => reject(request.error ?? new Error('쿠팡 쉽먼트 파일 저장소를 열 수 없습니다.'));
  });
}

function readAll(db: IDBDatabase): Promise<CoupangShipmentMergedFile[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as CoupangShipmentMergedFile[]);
    request.onerror = () => reject(request.error ?? new Error('쿠팡 쉽먼트 파일 목록을 읽을 수 없습니다.'));
  });
}

function putFile(db: IDBDatabase, file: CoupangShipmentMergedFile): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const request = transaction.objectStore(STORE_NAME).put(file);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('쿠팡 쉽먼트 파일을 저장할 수 없습니다.'));
  });
}

function deleteFile(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const request = transaction.objectStore(STORE_NAME).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('쿠팡 쉽먼트 파일을 삭제할 수 없습니다.'));
  });
}
