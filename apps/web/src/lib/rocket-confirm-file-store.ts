// Generated Rocket confirmation workbooks are local operator conveniences,
// never server truth or marketplace acceptance evidence.

export interface StoredRocketConfirmFile {
  id: string;
  fileName: string;
  createdAt: number;
  blob: Blob;
  totalRows: number;
  fullyConfirmed: number;
  shortRows: number;
}

export const ROCKET_CONFIRM_FILES_CHANGED_EVENT = 'kiditem:rocket-confirm-files-changed';

const DB_NAME = 'kiditem-rocket-confirm-files';
const STORE_NAME = 'files';
const DB_VERSION = 1;
const MAX_FILES = 200;

function canUseIndexedDb(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function notifyFilesChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(ROCKET_CONFIRM_FILES_CHANGED_EVENT));
  }
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
    request.onerror = () => reject(
      request.error ?? new Error('발주확정 파일 저장소를 열 수 없습니다.'),
    );
  });
}

export async function loadRocketConfirmFiles(): Promise<StoredRocketConfirmFile[]> {
  if (!canUseIndexedDb()) return [];
  const db = await openDb();
  const files = await new Promise<StoredRocketConfirmFile[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as StoredRocketConfirmFile[]);
    request.onerror = () => reject(
      request.error ?? new Error('파일 목록을 읽을 수 없습니다.'),
    );
  });
  db.close();
  return files.sort((left, right) => right.createdAt - left.createdAt);
}

export async function saveRocketConfirmFile(file: StoredRocketConfirmFile): Promise<void> {
  if (!canUseIndexedDb()) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const request = tx.objectStore(STORE_NAME).put(file);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('파일을 저장할 수 없습니다.'));
  });
  db.close();

  const stale = (await loadRocketConfirmFiles()).slice(MAX_FILES);
  if (stale.length > 0) {
    await Promise.all(stale.map((entry) => deleteRocketConfirmFile(entry.id, false)));
  }
  notifyFilesChanged();
}

export async function deleteRocketConfirmFile(
  id: string,
  notify = true,
): Promise<void> {
  if (!canUseIndexedDb()) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const request = tx.objectStore(STORE_NAME).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('파일을 삭제할 수 없습니다.'));
  });
  db.close();
  if (notify) notifyFilesChanged();
}
