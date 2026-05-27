import type { Participant } from './types.js';

type RoomState = {
  roomId: string;
  participants: Map<string, Participant>;
  createdAt: number;
};

export class RoomManager {
  private rooms = new Map<string, RoomState>();

  createRoom(roomId = this.createRoomId()) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        roomId,
        participants: new Map(),
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

    if (room.participants.size === 0) {
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

  getParticipants(roomId: string) {
    return Array.from(this.rooms.get(roomId)?.participants.values() ?? []);
  }

  isParticipant(roomId: string, userId: string) {
    return this.rooms.get(roomId)?.participants.has(userId) ?? false;
  }

  getParticipant(roomId: string, userId: string) {
    return this.rooms.get(roomId)?.participants.get(userId) ?? null;
  }

  private createRoomId() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  }
}
