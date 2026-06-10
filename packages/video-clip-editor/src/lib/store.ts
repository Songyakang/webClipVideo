import type { MediaAsset, ProjectState } from './types.js';

const DB_NAME = 'video-clip-editor';
const DB_VERSION = 1;

let _dbPromise: Promise<IDBDatabase> | null = null;

const openDB = (): Promise<IDBDatabase> => {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('assets')) {
        db.createObjectStore('assets', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('project')) {
        db.createObjectStore('project');
      }
      if (!db.objectStoreNames.contains('files')) {
        db.createObjectStore('files');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
  return _dbPromise;
};

const run = <T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T> =>
  new Promise((resolve, reject) => {
    openDB()
      .then((db) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const result = fn(store);
        tx.oncomplete = () => resolve((result as IDBRequest<T>)?.result);
        tx.onerror = () => reject(tx.error ?? new Error('Transaction failed'));
      })
      .catch(reject);
  });

const runCursor = <T>(
  storeName: string,
  fn: (store: IDBObjectStore) => IDBRequest<IDBCursorWithValue | null>,
  onItem: (cursor: IDBCursorWithValue) => T,
): Promise<T[]> =>
  new Promise((resolve, reject) => {
    openDB()
      .then((db) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const items: T[] = [];
        const req = fn(store);
        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor) {
            items.push(onItem(cursor));
            cursor.continue();
          }
        };
        tx.oncomplete = () => resolve(items);
        tx.onerror = () => reject(tx.error ?? new Error('Cursor transaction failed'));
      })
      .catch(reject);
  });

// --- Assets ---

export const listAssets = async (): Promise<MediaAsset[]> =>
  runCursor<MediaAsset>('assets', (store) => store.openCursor(), (c) => c.value);

export const getAsset = async (id: string): Promise<MediaAsset | undefined> =>
  run<MediaAsset | undefined>('assets', 'readonly', (store) => store.get(id));

export const saveAsset = async (asset: MediaAsset): Promise<void> => {
  await run('assets', 'readwrite', (store) => store.put(asset));
};

export const deleteAssetFromDB = async (id: string): Promise<void> => {
  await run('assets', 'readwrite', (store) => store.delete(id));
};

// --- Files (stored as Blobs in IndexedDB) ---

export const saveFile = async (key: string, file: File): Promise<void> => {
  await run('files', 'readwrite', (store) => store.put(file, key));
};

export const getFile = async (key: string): Promise<File | undefined> =>
  run<File | undefined>('files', 'readonly', (store) => store.get(key));

export const deleteFile = async (key: string): Promise<void> => {
  await run('files', 'readwrite', (store) => store.delete(key));
};

// --- Project ---

const PROJECT_KEY = 'current';

export const loadProject = async (): Promise<ProjectState | null> =>
  run<ProjectState | null>('project', 'readonly', (store) => store.get(PROJECT_KEY));

export const saveProject = async (project: ProjectState): Promise<void> => {
  await run('project', 'readwrite', (store) => store.put(project, PROJECT_KEY));
};
