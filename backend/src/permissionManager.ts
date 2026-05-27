import { RoomManager } from './roomManager.js';
import type { ClientOperation } from './types.js';

export class PermissionManager {
  constructor(private readonly rooms: RoomManager) {}

  validateOperation(operation: ClientOperation) {
    if (!operation.roomId?.trim()) return 'roomId is required';
    if (!operation.objectId?.trim()) return 'objectId is required';
    if (!['CREATE', 'UPDATE', 'DELETE'].includes(operation.type)) return 'operation type is invalid';
    if (!this.rooms.isParticipant(operation.roomId, operation.userId)) return 'user is not a room participant';

    const participant = this.rooms.getParticipant(operation.roomId, operation.userId);
    if (participant?.role === 'viewer') return 'viewer cannot submit drawing operations';
    if (operation.type !== 'DELETE' && !operation.payload) return 'payload is required';

    return null;
  }
}
