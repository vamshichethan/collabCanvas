import type { BoardVersionRecord, DashboardRoom, WhiteboardObject } from '../types';

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:5000';

export const api = {
  async listRooms(userId: string) {
    return request<DashboardRoom[]>(`/api/rooms?userId=${encodeURIComponent(userId)}`);
  },

  async createRoom(userId: string, name: string) {
    return request<{ room: DashboardRoom; board: { id: string } }>('/api/rooms', {
      method: 'POST',
      body: JSON.stringify({ userId, name }),
    });
  },

  async getRoom(roomId: string) {
    return request<DashboardRoom>(`/api/rooms/${encodeURIComponent(roomId)}`);
  },

  async getVersions(boardId: string) {
    return request<BoardVersionRecord[]>(`/api/boards/${encodeURIComponent(boardId)}/versions`);
  },

  async createVersion(boardId: string, name: string, createdBy: string) {
    return request<BoardVersionRecord>(`/api/boards/${encodeURIComponent(boardId)}/versions`, {
      method: 'POST',
      body: JSON.stringify({ name, createdBy }),
    });
  },

  async restoreVersion(boardId: string, versionId: string, userId: string) {
    return request<{ board: WhiteboardObject[]; lastSequenceNumber: number }>(
      `/api/boards/${encodeURIComponent(boardId)}/restore/${encodeURIComponent(versionId)}`,
      {
        method: 'POST',
        body: JSON.stringify({ userId }),
      },
    );
  },
};

async function request<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}
