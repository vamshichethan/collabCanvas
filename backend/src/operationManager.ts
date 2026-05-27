import type { BoardOperation, ClientOperation, WhiteboardObject } from './types.js';

type RoomOperations = {
  nextSequenceNumber: number;
  log: BoardOperation[];
  board: Map<string, WhiteboardObject>;
};

export class OperationManager {
  private rooms = new Map<string, RoomOperations>();

  submit(operation: ClientOperation) {
    const room = this.getRoom(operation.roomId);
    const serverTimestamp = Date.now();
    const sequencedOperation: BoardOperation = {
      ...operation,
      previousPayload: this.getActiveObject(operation.roomId, operation.objectId),
      serverTimestamp,
      sequenceNumber: room.nextSequenceNumber,
    };

    room.nextSequenceNumber += 1;
    room.log.push(sequencedOperation);
    room.board = this.replay(room.log);

    return sequencedOperation;
  }

  getBoard(roomId: string) {
    const room = this.getRoom(roomId);
    return Array.from(room.board.values()).filter((object) => !object.deleted);
  }

  getOperationsAfter(roomId: string, sequenceNumber: number) {
    return this.getRoom(roomId).log.filter((operation) => operation.sequenceNumber > sequenceNumber);
  }

  getLastSequenceNumber(roomId: string) {
    const log = this.getRoom(roomId).log;
    return log.at(-1)?.sequenceNumber ?? 0;
  }

  private replay(log: BoardOperation[]) {
    const board = new Map<string, WhiteboardObject>();

    log
      .slice()
      .sort((a, b) => a.sequenceNumber - b.sequenceNumber)
      .forEach((operation) => this.applySequencedOperation(board, operation));

    return board;
  }

  private applySequencedOperation(board: Map<string, WhiteboardObject>, operation: BoardOperation) {
    const existing = board.get(operation.objectId);

    if (operation.type === 'CREATE') {
      if (!existing && operation.payload) {
        board.set(operation.objectId, {
          ...operation.payload,
          updatedAt: operation.serverTimestamp,
          deleted: false,
        });
      }
      return;
    }

    if (operation.type === 'UPDATE') {
      if (existing && !existing.deleted && operation.payload) {
        board.set(operation.objectId, {
          ...existing,
          ...operation.payload,
          id: operation.objectId,
          createdAt: existing.createdAt,
          updatedAt: operation.serverTimestamp,
          deleted: false,
        });
      }
      return;
    }

    if (operation.type === 'DELETE' && existing && !existing.deleted) {
      board.set(operation.objectId, {
        ...existing,
        deleted: true,
        deletedAt: operation.serverTimestamp,
        deletedBy: operation.userId,
        updatedAt: operation.serverTimestamp,
      });
    }
  }

  private getActiveObject(roomId: string, objectId: string) {
    const object = this.getRoom(roomId).board.get(objectId);
    return object && !object.deleted ? object : null;
  }

  private getRoom(roomId: string) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        nextSequenceNumber: 1,
        log: [],
        board: new Map(),
      });
    }

    return this.rooms.get(roomId)!;
  }
}
