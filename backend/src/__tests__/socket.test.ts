import { describe, expect, it } from 'vitest';
import { io as createSocketClient } from 'socket.io-client';
import { schemas } from '../validation.js';

describe('socket payload validation', () => {
  it('has Socket.IO client utilities available for integration tests', () => {
    expect(typeof createSocketClient).toBe('function');
  });

  it('accepts a drawing operation payload', () => {
    expect(
      schemas.operation.parse({
        opId: 'op_1',
        roomId: 'room_1',
        boardId: 'board_1',
        objectId: 'object_1',
        type: 'CREATE',
        payload: { id: 'object_1' },
        userId: 'ignored-on-server',
        clientTimestamp: Date.now(),
      }).type,
    ).toBe('CREATE');
  });

  it('rejects invalid operation types before broadcast', () => {
    expect(() =>
      schemas.operation.parse({
        opId: 'op_1',
        roomId: 'room_1',
        boardId: 'board_1',
        objectId: 'object_1',
        type: 'DRAW',
        payload: {},
        clientTimestamp: Date.now(),
      }),
    ).toThrow();
  });
});
