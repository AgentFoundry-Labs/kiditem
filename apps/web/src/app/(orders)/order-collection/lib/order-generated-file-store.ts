import type { OrderCollectionConversionResult } from './order-collection-api';

export interface StoredOrderCollectionFile extends OrderCollectionConversionResult {
  id: string;
  sourceName: string;
  convertedAt: number;
  collectionDate?: string;
  collectionMode?: 'browser' | 'manual-upload';
  collectedRows?: number;
  mallKey?: string;
  mallName?: string;
  /** 연결된 쿠팡 로켓 워크북 내보내기. 로켓 주문수집 파일에만 존재한다. */
  rocketWorkbookExportId?: string | null;
  /** 서버가 발급한 Sellpia 전송 멱등 키. 로컬 파일 ID보다 우선한다. */
  transmissionIntentKey?: string | null;
  /** 이번 수집에 포함된 서로 다른 주문번호 (있을 때). "당일" 집계에서 재수집한 같은 주문을 중복 카운트하지 않도록 유니크 기준으로 사용. */
  orderNumbers?: string[];
  /** 셀피아 주문접수 버튼 클릭이 성공해 전송을 요청한 시각. Sellpia 접수 완료를 의미하지 않는다. */
  transmissionRequestedAt?: number;
}

type LegacyStoredOrderCollectionFile = StoredOrderCollectionFile & {
  sentAt?: number;
};

const DB_NAME = 'kiditem-order-collection-files';
const STORE_NAME = 'files';
const DB_VERSION = 1;
const MAX_FILES = 1000;

export async function loadGeneratedOrderFiles(): Promise<StoredOrderCollectionFile[]> {
  if (!canUseIndexedDb()) return [];
  const db = await openDb();
  const files = await readAll(db);
  db.close();
  return files
    .map(normalizeGeneratedOrderFileRecord)
    .sort((a, b) => b.convertedAt - a.convertedAt);
}

export async function saveGeneratedOrderFile(file: StoredOrderCollectionFile): Promise<void> {
  if (!canUseIndexedDb()) return;
  const db = await openDb();
  await putFile(db, withoutLegacySentAt(file));
  const files = await readAll(db);
  const staleFiles = files
    .sort((a, b) => b.convertedAt - a.convertedAt)
    .slice(MAX_FILES);
  await Promise.all(staleFiles.map((item) => deleteFile(db, item.id)));
  db.close();
}

export async function markGeneratedOrderFileTransmissionRequested(
  file: StoredOrderCollectionFile,
  transmissionRequestedAt: number,
): Promise<StoredOrderCollectionFile> {
  const updated = withoutLegacySentAt({
    ...file,
    transmissionRequestedAt,
  });
  await saveGeneratedOrderFile(updated);
  return updated;
}

export function normalizeGeneratedOrderFileRecord(
  file: LegacyStoredOrderCollectionFile,
): StoredOrderCollectionFile {
  const current = withoutLegacySentAt(file);
  if (current.transmissionRequestedAt !== undefined || file.sentAt === undefined) {
    return current;
  }
  return { ...current, transmissionRequestedAt: file.sentAt };
}

function withoutLegacySentAt(
  file: LegacyStoredOrderCollectionFile,
): StoredOrderCollectionFile {
  const { sentAt, ...current } = file;
  void sentAt;
  return current;
}

export async function deleteGeneratedOrderFile(id: string): Promise<void> {
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
    request.onerror = () => reject(request.error ?? new Error('생성 파일 저장소를 열 수 없습니다.'));
  });
}

function readAll(db: IDBDatabase): Promise<LegacyStoredOrderCollectionFile[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as LegacyStoredOrderCollectionFile[]);
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
