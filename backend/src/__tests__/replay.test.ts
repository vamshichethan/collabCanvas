import { describe, expect, it } from 'vitest';
import { PersistenceManager } from '../persistenceManager.js';

describe('replay data shaping', () => {
  it('returns operations ordered for replay with user names', async () => {
    const persistence = new PersistenceManager({
      board: {
        findUniqueOrThrow: async () => ({ roomId: 'room_1' }),
      },
      drawingOperation: {
        findMany: async () => [
          {
            opId: 'op_1',
            type: 'CREATE',
            objectId: 'object_1',
            payload: { id: 'object_1', type: 'rectangle' },
            previousPayload: null,
            userId: 'user_1',
            user: { name: 'Vamshi' },
            sequenceNumber: 1,
            serverTimestamp: new Date(1000),
          },
        ],
      },
    } as never);

    await expect(persistence.getReplayOperations('board_1')).resolves.toMatchObject({
      boardId: 'board_1',
      roomId: 'room_1',
      operations: [{ opId: 'op_1', userName: 'Vamshi', sequenceNumber: 1, serverTimestamp: 1000 }],
    });
  });
});
