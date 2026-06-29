// 생성한 발주확정 양식(.xlsx)을 로컬(IndexedDB)에 보관 — 목록/재다운로드/삭제.

export interface StoredRocketConfirmFile {
  id: string;
  fileName: string;
  createdAt: number;
  blob: Blob;
  totalRows: number;
  fullyConfirmed: number;
  shortRows: number;
}

const DB_NAME = 'kiditem-rocket-confirm-files';
const STORE_NAME = 'files';
const DB_VERSION = 1;
const MAX_FILES = 200;

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
    request.onerror = () => reject(request.error ?? new Error('발주확정 파일 저장소를 열 수 없습니다.'));
  });
}

export async function loadRocketConfirmFiles(): Promise<StoredRocketConfirmFile[]> {
  if (!canUseIndexedDb()) return [];
  const db = await openDb();
  const files = await new Promise<StoredRocketConfirmFile[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result as StoredRocketConfirmFile[]);
    req.onerror = () => reject(req.error ?? new Error('파일 목록을 읽을 수 없습니다.'));
  });
  db.close();
  return files.sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveRocketConfirmFile(file: StoredRocketConfirmFile): Promise<void> {
  if (!canUseIndexedDb()) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).put(file);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error('파일을 저장할 수 없습니다.'));
  });
  // prune oldest beyond MAX_FILES
  const all = await loadRocketConfirmFiles();
  const stale = all.slice(MAX_FILES);
  if (stale.length) {
    await Promise.all(stale.map((f) => deleteRocketConfirmFile(f.id)));
  }
  db.close();
}

export async function deleteRocketConfirmFile(id: string): Promise<void> {
  if (!canUseIndexedDb()) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error('파일을 삭제할 수 없습니다.'));
  });
  db.close();
}
