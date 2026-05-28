import type { ParticipantRole, Prisma, PrismaClient, RoomVisibility } from '@prisma/client';
import type { BoardOperation, ClientOperation, WhiteboardObject } from './types.js';

const SNAPSHOT_INTERVAL = 25;
const SYSTEM_USER_ID = 'system';

export class PersistenceManager {
  constructor(private readonly prisma: PrismaClient) {}

  async ensureSystemUser() {
    await this.prisma.user.upsert({
      where: { id: SYSTEM_USER_ID },
      update: {},
      create: { id: SYSTEM_USER_ID, name: 'System' },
    });
  }

  async ensureUser(userId: string, name: string) {
    return this.prisma.user.upsert({
      where: { id: userId },
      update: { name },
      create: { id: userId, name },
    });
  }

  async createRoom(userId: string, name: string, roomId = this.createRoomId()) {
    await this.ensureSystemUser();
    await this.ensureUser(userId, name);

    return this.prisma.$transaction(async (tx) => {
      const room = await tx.room.upsert({
        where: { id: roomId },
        update: {},
        create: {
          id: roomId,
          name: `${name || 'Untitled'}'s Room`,
          inviteCode: roomId,
          visibility: 'PRIVATE',
          ownerId: userId,
        },
      });

      const board = await tx.board.upsert({
        where: { id: roomId },
        update: {},
        create: {
          id: roomId,
          roomId: room.id,
          title: 'Main Board',
          currentState: [],
          lastSequenceNumber: 0,
        },
      });

      await tx.participant.upsert({
        where: { roomId_userId: { roomId: room.id, userId } },
        update: { role: 'OWNER' },
        create: { roomId: room.id, userId, role: 'OWNER' },
      });

      return { room, board };
    });
  }

  async joinRoom(roomId: string, userId: string, name: string, role: 'OWNER' | 'EDITOR' | 'VIEWER' = 'EDITOR') {
    await this.ensureSystemUser();
    await this.ensureUser(userId, name);
    await this.ensureRoomAndBoard(roomId, userId, name);

    return this.prisma.participant.upsert({
      where: { roomId_userId: { roomId, userId } },
      update: {},
      create: { roomId, userId, role },
      include: { user: true },
    });
  }

  async inviteParticipant(roomId: string, userId: string, name: string, role: ParticipantRole) {
    await this.ensureUser(userId, name);
    return this.prisma.participant.upsert({
      where: { roomId_userId: { roomId, userId } },
      update: { role },
      create: { roomId, userId, role },
      include: { user: true },
    });
  }

  async removeParticipant(roomId: string, userId: string) {
    return this.prisma.participant.delete({
      where: { roomId_userId: { roomId, userId } },
    });
  }

  async updateParticipantRole(roomId: string, userId: string, role: ParticipantRole) {
    return this.prisma.participant.update({
      where: { roomId_userId: { roomId, userId } },
      data: { role },
      include: { user: true },
    });
  }

  async transferOwnership(roomId: string, ownerId: string, nextOwnerId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.room.update({ where: { id: roomId }, data: { ownerId: nextOwnerId } });
      await tx.participant.update({
        where: { roomId_userId: { roomId, userId: ownerId } },
        data: { role: 'EDITOR' },
      });
      return tx.participant.update({
        where: { roomId_userId: { roomId, userId: nextOwnerId } },
        data: { role: 'OWNER' },
        include: { user: true },
      });
    });
  }

  async updateRoomSettings(
    roomId: string,
    settings: {
      visibility?: RoomVisibility;
      allowViewerComments?: boolean;
      allowViewerAISummaries?: boolean;
      allowViewerExports?: boolean;
      allowViewerReplay?: boolean;
      lockBoardEditing?: boolean;
    },
  ) {
    return this.prisma.room.update({
      where: { id: roomId },
      data: settings,
    });
  }

  async regenerateInviteCode(roomId: string) {
    return this.prisma.room.update({
      where: { id: roomId },
      data: { inviteCode: this.createRoomId() },
    });
  }

  async createComment(boardId: string, userId: string, message: string, objectId?: string) {
    return this.prisma.comment.create({
      data: { boardId, userId, message, objectId },
    });
  }

  async createChatMessage(roomId: string, userId: string, message: string) {
    return this.prisma.chatMessage.create({
      data: { roomId, userId, message },
    });
  }

  async getBoardState(boardId: string) {
    const board = await this.prisma.board.findUnique({ where: { id: boardId } });
    return {
      board: this.toWhiteboardObjects(board?.currentState),
      lastSequenceNumber: board?.lastSequenceNumber ?? 0,
    };
  }

  async getBoardRoomId(boardId: string) {
    const board = await this.prisma.board.findUnique({ where: { id: boardId }, select: { roomId: true } });
    return board?.roomId ?? null;
  }

  async getRoom(roomId: string) {
    return this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        boards: true,
        participants: { include: { user: true } },
      },
    });
  }

  async getDashboardRooms(userId: string) {
    return this.prisma.room.findMany({
      where: { participants: { some: { userId } } },
      include: {
        boards: true,
        participants: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async submitOperation(operation: ClientOperation) {
    return this.prisma.$transaction(async (tx) => {
      const board = await tx.board.findUniqueOrThrow({ where: { id: operation.boardId } });
      const currentState = this.toWhiteboardObjects(board.currentState);
      const serverTimestamp = Date.now();
      const sequenceNumber = board.lastSequenceNumber + 1;
      const previousPayload = this.getActiveObject(currentState, operation.objectId);
      const sequencedOperation: BoardOperation = {
        ...operation,
        previousPayload,
        serverTimestamp,
        sequenceNumber,
      };
      const nextState = this.applyOperation(currentState, sequencedOperation);

      await tx.drawingOperation.create({
        data: {
          opId: sequencedOperation.opId,
          roomId: sequencedOperation.roomId,
          boardId: sequencedOperation.boardId,
          objectId: sequencedOperation.objectId,
          type: sequencedOperation.type,
          payload: sequencedOperation.payload as Prisma.InputJsonValue,
          previousPayload: sequencedOperation.previousPayload as Prisma.InputJsonValue,
          userId: sequencedOperation.userId,
          clientTimestamp: new Date(sequencedOperation.clientTimestamp),
          serverTimestamp: new Date(sequencedOperation.serverTimestamp),
          sequenceNumber: sequencedOperation.sequenceNumber,
        },
      });

      await tx.board.update({
        where: { id: operation.boardId },
        data: {
          currentState: nextState as Prisma.InputJsonValue,
          lastSequenceNumber: sequenceNumber,
        },
      });

      if (sequenceNumber % SNAPSHOT_INTERVAL === 0) {
        await tx.boardSnapshot.create({
          data: {
            boardId: operation.boardId,
            state: nextState as Prisma.InputJsonValue,
            sequenceNumber,
            createdBy: SYSTEM_USER_ID,
          },
        });
      }

      return { operation: sequencedOperation, board: nextState };
    });
  }

  async getOperationsAfter(boardId: string, sequenceNumber: number) {
    const operations = await this.prisma.drawingOperation.findMany({
      where: {
        boardId,
        sequenceNumber: { gt: sequenceNumber },
      },
      orderBy: { sequenceNumber: 'asc' },
    });

    return operations.map((operation) => this.toBoardOperation(operation));
  }

  async getReplayOperations(boardId: string) {
    const board = await this.prisma.board.findUniqueOrThrow({ where: { id: boardId }, select: { roomId: true } });
    const operations = await this.prisma.drawingOperation.findMany({
      where: { boardId },
      include: { user: true },
      orderBy: { sequenceNumber: 'asc' },
    });

    return {
      boardId,
      roomId: board.roomId,
      operations: operations.map((operation) => ({
        opId: operation.opId,
        type: operation.type,
        objectId: operation.objectId,
        payload: operation.payload as WhiteboardObject | null,
        previousPayload: operation.previousPayload as WhiteboardObject | null,
        userId: operation.userId,
        userName: operation.user.name,
        sequenceNumber: operation.sequenceNumber,
        serverTimestamp: operation.serverTimestamp.getTime(),
      })),
    };
  }

  async getUserName(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    return user?.name ?? userId;
  }

  async listVersions(boardId: string) {
    return this.prisma.boardVersion.findMany({
      where: { boardId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createVersion(boardId: string, name: string, createdBy: string) {
    const board = await this.prisma.board.findUniqueOrThrow({ where: { id: boardId } });
    await this.ensureUser(createdBy, 'Version Creator');

    return this.prisma.boardVersion.create({
      data: {
        boardId,
        name,
        state: board.currentState as Prisma.InputJsonValue,
        sequenceNumber: board.lastSequenceNumber,
        createdBy,
      },
    });
  }

  async restoreVersion(boardId: string, versionId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const version = await tx.boardVersion.findUniqueOrThrow({ where: { id: versionId } });
      const board = await tx.board.findUniqueOrThrow({ where: { id: boardId } });
      const nextSequenceNumber = board.lastSequenceNumber + 1;

      await tx.board.update({
        where: { id: boardId },
        data: {
          currentState: version.state as Prisma.InputJsonValue,
          lastSequenceNumber: nextSequenceNumber,
        },
      });

      await tx.boardSnapshot.create({
        data: {
          boardId,
          state: version.state as Prisma.InputJsonValue,
          sequenceNumber: nextSequenceNumber,
          createdBy: userId,
        },
      });

      return {
        board: this.toWhiteboardObjects(version.state),
        lastSequenceNumber: nextSequenceNumber,
      };
    });
  }

  async listSnapshots(boardId: string) {
    return this.prisma.boardSnapshot.findMany({
      where: { boardId },
      orderBy: { createdAt: 'desc' },
    });
  }

  applyOperation(state: WhiteboardObject[], operation: BoardOperation) {
    const existing = this.getActiveObject(state, operation.objectId);

    if (operation.type === 'CREATE') {
      if (existing || !operation.payload) return state;
      return [...state, { ...operation.payload, deleted: false, updatedAt: operation.serverTimestamp }];
    }

    if (operation.type === 'UPDATE') {
      if (!existing || !operation.payload) return state;
      return state.map((object) =>
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

    if (operation.type === 'DELETE') {
      return state.map((object) =>
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
    }

    return state;
  }

  private async ensureRoomAndBoard(roomId: string, userId: string, name: string) {
    const existingRoom = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (existingRoom) return;

    await this.createRoom(userId, name, roomId);
  }

  private getActiveObject(state: WhiteboardObject[], objectId: string) {
    return state.find((object) => object.id === objectId && !object.deleted) ?? null;
  }

  private toWhiteboardObjects(value: Prisma.JsonValue | undefined) {
    return Array.isArray(value) ? (value as WhiteboardObject[]) : [];
  }

  private toBoardOperation(operation: {
    opId: string;
    roomId: string;
    boardId: string;
    objectId: string;
    type: 'CREATE' | 'UPDATE' | 'DELETE';
    payload: Prisma.JsonValue | null;
    previousPayload: Prisma.JsonValue | null;
    userId: string;
    clientTimestamp: Date;
    serverTimestamp: Date;
    sequenceNumber: number;
  }): BoardOperation {
    return {
      opId: operation.opId,
      roomId: operation.roomId,
      boardId: operation.boardId,
      objectId: operation.objectId,
      type: operation.type,
      payload: operation.payload as WhiteboardObject | null,
      previousPayload: operation.previousPayload as WhiteboardObject | null,
      userId: operation.userId,
      clientTimestamp: operation.clientTimestamp.getTime(),
      serverTimestamp: operation.serverTimestamp.getTime(),
      sequenceNumber: operation.sequenceNumber,
    };
  }

  private createRoomId() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  }
}
