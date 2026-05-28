import type { ParticipantRole, PrismaClient } from '@prisma/client';
import { canRole, type PermissionAction } from './roleGuards.js';
import type { ClientOperation, WhiteboardObject } from './types.js';

export class PermissionManager {
  constructor(private readonly prisma: PrismaClient) {}

  async getParticipant(roomId: string, userId: string) {
    return this.prisma.participant.findUnique({
      where: { roomId_userId: { roomId, userId } },
      include: { room: true },
    });
  }

  async requireAction(roomId: string, userId: string, action: PermissionAction) {
    const participant = await this.getParticipant(roomId, userId);
    if (!participant) return 'user is not a room participant';
    if (!canRole(participant.role, action)) return `permission denied: ${action}`;
    return null;
  }

  async validateOperation(operation: ClientOperation) {
    if (!operation.roomId?.trim()) return 'roomId is required';
    if (!operation.boardId?.trim()) return 'boardId is required';
    if (!operation.objectId?.trim()) return 'objectId is required';
    if (!['CREATE', 'UPDATE', 'DELETE'].includes(operation.type)) return 'operation type is invalid';
    if (operation.type !== 'DELETE' && !operation.payload) return 'payload is required';

    const participant = await this.getParticipant(operation.roomId, operation.userId);
    if (!participant) return 'user is not a room participant';
    if (participant.role === 'VIEWER') return 'viewer cannot submit drawing operations';
    if (participant.room.lockBoardEditing && participant.role !== 'OWNER') return 'board editing is locked';

    if (operation.type === 'DELETE' && participant.role === 'EDITOR') {
      const object = await this.getObjectFromBoard(operation.boardId, operation.objectId);
      if (object?.createdBy && object.createdBy !== operation.userId) {
        return 'editor can only delete own objects';
      }
    }

    return null;
  }

  async canComment(roomId: string, userId: string) {
    const participant = await this.getParticipant(roomId, userId);
    if (!participant) return 'user is not a room participant';
    if (participant.role === 'VIEWER' && !participant.room.allowViewerComments) {
      return 'viewer comments are disabled';
    }
    return canRole(participant.role, 'COMMENT') || participant.role === 'VIEWER' ? null : 'permission denied: COMMENT';
  }

  async canChat(roomId: string, userId: string) {
    return this.canComment(roomId, userId);
  }

  async canResolveComment(roomId: string, userId: string) {
    const participant = await this.getParticipant(roomId, userId);
    if (!participant) return 'user is not a room participant';
    return participant.role === 'OWNER' ? null : 'only owners can resolve comments';
  }

  async canDeleteComment(roomId: string, actorId: string, commentUserId: string) {
    const participant = await this.getParticipant(roomId, actorId);
    if (!participant) return 'user is not a room participant';
    if (participant.role === 'OWNER' || actorId === commentUserId) return null;
    return 'cannot delete another user comment';
  }

  async canManageParticipant(roomId: string, userId: string) {
    return this.requireAction(roomId, userId, 'CHANGE_ROLES');
  }

  async canRestoreVersion(roomId: string, userId: string) {
    return this.requireAction(roomId, userId, 'RESTORE_VERSION');
  }

  async canCreateVersion(roomId: string, userId: string) {
    return this.requireAction(roomId, userId, 'CREATE_VERSION');
  }

  async canGenerateAISummary(roomId: string, userId: string) {
    const participant = await this.getParticipant(roomId, userId);
    if (!participant) return 'user is not a room participant';
    if (participant.role === 'VIEWER') {
      return participant.room.allowViewerAISummaries ? null : 'viewer AI summaries are disabled';
    }
    return canRole(participant.role, 'GENERATE_AI_SUMMARY') ? null : 'permission denied: GENERATE_AI_SUMMARY';
  }

  async canExportBoard(roomId: string, userId: string) {
    const participant = await this.getParticipant(roomId, userId);
    if (!participant) return 'user is not a room participant';
    if (participant.role === 'VIEWER') {
      return participant.room.allowViewerExports ? null : 'viewer exports are disabled';
    }
    return canRole(participant.role, 'EXPORT_BOARD') ? null : 'permission denied: EXPORT_BOARD';
  }

  async canReplayBoard(roomId: string, userId: string) {
    const participant = await this.getParticipant(roomId, userId);
    if (!participant) return 'user is not a room participant';
    if (participant.role === 'VIEWER') {
      return participant.room.allowViewerReplay ? null : 'viewer replay is disabled';
    }
    return canRole(participant.role, 'REPLAY_BOARD') ? null : 'permission denied: REPLAY_BOARD';
  }

  async canUpdateSettings(roomId: string, userId: string) {
    return this.requireAction(roomId, userId, 'UPDATE_ROOM_SETTINGS');
  }

  async assertOwner(roomId: string, userId: string) {
    const participant = await this.getParticipant(roomId, userId);
    return participant?.role === 'OWNER' ? null : 'owner permission required';
  }

  private async getObjectFromBoard(boardId: string, objectId: string) {
    const board = await this.prisma.board.findUnique({ where: { id: boardId } });
    const state = Array.isArray(board?.currentState) ? (board.currentState as WhiteboardObject[]) : [];
    return state.find((object) => object.id === objectId && !object.deleted) ?? null;
  }
}

export const normalizeRole = (role: string): ParticipantRole => {
  if (role === 'OWNER' || role === 'EDITOR' || role === 'VIEWER') return role;
  if (role === 'owner') return 'OWNER';
  if (role === 'viewer') return 'VIEWER';
  return 'EDITOR';
};
