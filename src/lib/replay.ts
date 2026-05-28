import type { ReplayOperation, WhiteboardObject } from '../types';

const CACHE_INTERVAL = 50;

export const applyReplayOperation = (currentState: WhiteboardObject[], operation: ReplayOperation) => {
  if (operation.type === 'CREATE') {
    if (!operation.payload || currentState.some((object) => object.id === operation.objectId && !object.deleted)) return currentState;
    return [...currentState, { ...operation.payload, deleted: false, updatedAt: operation.serverTimestamp }];
  }

  if (operation.type === 'UPDATE') {
    if (!operation.payload) return currentState;
    return currentState.map((object) =>
      object.id === operation.objectId
        ? {
            ...object,
            ...operation.payload,
            id: operation.objectId,
            createdAt: object.createdAt,
            updatedAt: operation.serverTimestamp,
            deleted: false,
          }
        : object,
    );
  }

  return currentState.map((object) =>
    object.id === operation.objectId
      ? {
          ...object,
          deleted: true,
          deletedAt: operation.serverTimestamp,
          deletedBy: operation.userId,
          updatedAt: operation.serverTimestamp,
        }
      : object,
  );
};

export const buildReplayState = (operations: ReplayOperation[], step: number, cache = buildReplayCache(operations)) => {
  const safeStep = Math.max(0, Math.min(step, operations.length));
  const cacheStep = Math.floor(safeStep / CACHE_INTERVAL) * CACHE_INTERVAL;
  let state = [...(cache.get(cacheStep) ?? [])];

  for (let index = cacheStep; index < safeStep; index += 1) {
    state = applyReplayOperation(state, operations[index]);
  }

  return state.filter((object) => !object.deleted);
};

export const buildReplayCache = (operations: ReplayOperation[]) => {
  const cache = new Map<number, WhiteboardObject[]>();
  let state: WhiteboardObject[] = [];
  cache.set(0, state);

  operations.forEach((operation, index) => {
    state = applyReplayOperation(state, operation);
    const nextStep = index + 1;
    if (nextStep % CACHE_INTERVAL === 0) {
      cache.set(nextStep, state);
    }
  });

  return cache;
};
