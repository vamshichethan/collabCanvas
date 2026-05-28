import { describe, expect, it } from 'vitest';
import { OperationManager } from '../operationManager.js';

describe('OperationManager', () => {
  it('caches accepted board state after submit', async () => {
    const persistence = {
      submitOperation: async (operation: any) => ({
        operation: { ...operation, sequenceNumber: 7, serverTimestamp: 100 },
        board: [{ id: 'object_1', deleted: false }],
      }),
      getBoardState: async () => ({ board: [], lastSequenceNumber: 0 }),
      getOperationsAfter: async () => [],
    };
    const manager = new OperationManager(persistence as never);

    await manager.submit({
      opId: 'op_1',
      roomId: 'room_1',
      boardId: 'board_1',
      objectId: 'object_1',
      type: 'CREATE',
      payload: {} as never,
      userId: 'user_1',
      clientTimestamp: 1,
    });

    await expect(manager.getBoardState('board_1')).resolves.toEqual({
      board: [{ id: 'object_1', deleted: false }],
      lastSequenceNumber: 7,
    });
  });
});
