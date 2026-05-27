import { createClientId } from './ids';
import type { ClientOperation, QueuedOperation, QueuedOperationStatus } from '../types';

const DB_NAME = 'collabcanvas-offline';
const DB_VERSION = 1;
const STORE_NAME = 'operations';

const openQueueDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'localId' });
        store.createIndex('roomId', 'roomId');
        store.createIndex('status', 'status');
        store.createIndex('clientTimestamp', 'clientTimestamp');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const withStore = async <T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T> | void) => {
  const db = await openQueueDb();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const request = action(store);

    transaction.oncomplete = () => {
      db.close();
      resolve(request && 'result' in request ? request.result : undefined as T);
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
};

export const offlineQueue = {
  async enqueue(operation: ClientOperation) {
    const queued: QueuedOperation = {
      ...operation,
      localId: createClientId('local'),
      retryCount: 0,
      status: 'PENDING',
    };
    await withStore('readwrite', (store) => store.put(queued));
    return queued;
  },

  async listRoom(roomId: string) {
    const operations = await withStore<QueuedOperation[]>('readonly', (store) => store.getAll());
    return operations
      .filter((operation) => operation.roomId === roomId)
      .sort((a, b) => a.clientTimestamp - b.clientTimestamp);
  },

  async listPending(roomId: string, includeFailed = false) {
    return (await this.listRoom(roomId)).filter(
      (operation) => operation.status === 'PENDING' || (includeFailed && operation.status === 'FAILED'),
    );
  },

  async countPending(roomId: string) {
    return (await this.listPending(roomId)).length;
  },

  async updateStatus(localId: string, status: QueuedOperationStatus, retryIncrement = 0) {
    const existing = await withStore<QueuedOperation | undefined>('readonly', (store) => store.get(localId));
    if (!existing) return null;
    const next = { ...existing, status, retryCount: existing.retryCount + retryIncrement };
    await withStore('readwrite', (store) => store.put(next));
    return next;
  },

  async markMany(localIds: string[], status: QueuedOperationStatus, retryIncrement = 0) {
    await Promise.all(localIds.map((localId) => this.updateStatus(localId, status, retryIncrement)));
  },
};
