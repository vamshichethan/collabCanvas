import type { BoardOperation, Participant, WhiteboardObject } from './types.js';

type RoomState = {
  roomId: string;
  participants: Map<string, Participant>;
  board: WhiteboardObject[];
  createdAt: number;
};

export class RoomManager {
  private rooms = new Map<string, RoomState>();

  createRoom(roomId = this.createRoomId()) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        roomId,
        participants: new Map(),
        board: [],
        createdAt: Date.now(),
      });
    }

    return this.rooms.get(roomId)!;
  }

  joinRoom(roomId: string, participant: Participant) {
    const room = this.createRoom(roomId);
    room.participants.set(participant.userId, participant);
    return room;
  }

  leaveRoom(roomId: string, userId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return [];

    room.participants.delete(userId);
    const participants = this.getParticipants(roomId);

    if (room.participants.size === 0 && room.board.length === 0) {
      this.rooms.delete(roomId);
    }

    return participants;
  }

  removeSocket(socketId: string) {
    const removals: Array<{ roomId: string; participant: Participant; participants: Participant[] }> = [];

    this.rooms.forEach((room) => {
      room.participants.forEach((participant, userId) => {
        if (participant.socketId === socketId) {
          room.participants.delete(userId);
          removals.push({
            roomId: room.roomId,
            participant,
            participants: this.getParticipants(room.roomId),
          });
        }
      });
    });

    return removals;
  }

  getBoard(roomId: string) {
    return this.rooms.get(roomId)?.board ?? [];
  }

  getParticipants(roomId: string) {
    return Array.from(this.rooms.get(roomId)?.participants.values() ?? []);
  }

  applyOperation(operation: BoardOperation) {
    const room = this.createRoom(operation.roomId);
    const index = room.board.findIndex((object) => object.id === operation.objectId);

    if (operation.type === 'DELETE') {
      room.board = room.board.filter((object) => object.id !== operation.objectId);
      return room.board;
    }

    const payload = {
      ...operation.payload,
      updatedAt: operation.timestamp,
    };

    if (index === -1) {
      room.board = [...room.board, payload];
    } else {
      room.board = room.board.map((object) =>
        object.id === operation.objectId
          ? { ...object, ...payload, createdAt: object.createdAt }
          : object,
      );
    }

    return room.board;
  }

  private createRoomId() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  }
}
