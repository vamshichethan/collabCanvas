import type { PrismaClient } from '@prisma/client';
import type { ClientOperation } from './types.js';

export class PermissionManager {
  constructor(private readonly prisma: PrismaClient) {}

  async validateOperation(operation: ClientOperation) {
    if (!operation.roomId?.trim()) return 'roomId is required';
    if (!operation.boardId?.trim()) return 'boardId is required';
    if (!operation.objectId?.trim()) return 'objectId is required';
    if (!['CREATE', 'UPDATE', 'DELETE'].includes(operation.type)) return 'operation type is invalid';
    if (operation.type !== 'DELETE' && !operation.payload) return 'payload is required';

    const participant = await this.prisma.participant.findUnique({
      where: {
        roomId_userId: {
          roomId: operation.roomId,
          userId: operation.userId,
        },
      },
    });

    if (!participant) return 'user is not a room participant';
    if (participant.role === 'VIEWER') return 'viewer cannot submit drawing operations';

    return null;
  }
}
