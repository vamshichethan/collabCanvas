import { describe, expect, it } from 'vitest';
import { PermissionManager } from '../permissionManager.js';

describe('PermissionManager', () => {
  it('blocks viewer drawing operations', async () => {
    const permissions = new PermissionManager({
      participant: {
        findUnique: async () => ({ role: 'VIEWER', room: { lockBoardEditing: false, status: 'ACTIVE' } }),
      },
    } as never);

    await expect(
      permissions.validateOperation({
        opId: 'op_1',
        roomId: 'room_1',
        boardId: 'board_1',
        objectId: 'object_1',
        type: 'CREATE',
        payload: {},
        userId: 'viewer',
        clientTimestamp: Date.now(),
      } as never),
    ).resolves.toBe('viewer cannot submit drawing operations');
  });

  it('makes archived boards read-only', async () => {
    const permissions = new PermissionManager({
      participant: {
        findUnique: async () => ({ role: 'OWNER', room: { lockBoardEditing: false, status: 'ARCHIVED' } }),
      },
    } as never);

    await expect(
      permissions.validateOperation({
        opId: 'op_1',
        roomId: 'room_1',
        boardId: 'board_1',
        objectId: 'object_1',
        type: 'UPDATE',
        payload: {},
        userId: 'owner',
        clientTimestamp: Date.now(),
      } as never),
    ).resolves.toBe('archived boards are read-only');
  });
});
