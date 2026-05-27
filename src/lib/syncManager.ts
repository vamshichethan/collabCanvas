import type { BoardOperation, QueuedOperation } from '../types';

export const findOfflineConflicts = (pendingOperations: QueuedOperation[], remoteOperations: BoardOperation[]) => {
  const pendingObjectIds = new Set(pendingOperations.map((operation) => operation.objectId));
  return remoteOperations.filter((operation) => pendingObjectIds.has(operation.objectId));
};

export const toBatchPayload = (operations: QueuedOperation[]) =>
  operations.map(({ localId, retryCount, status, ...operation }) => ({
    localId,
    operation,
  }));
