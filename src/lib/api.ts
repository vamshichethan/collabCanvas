import type {
  ActivityItem,
  AISummaryRecord,
  BoardVersionRecord,
  ChatMessage,
  DashboardRoom,
  ObjectComment,
  SummaryType,
  WhiteboardObject,
} from '../types';

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

  async getChat(roomId: string) {
    return request<ChatMessage[]>(`/api/rooms/${encodeURIComponent(roomId)}/chat`);
  },

  async getActivity(roomId: string) {
    return request<ActivityItem[]>(`/api/rooms/${encodeURIComponent(roomId)}/activity`);
  },

  async updateRoomSettings(
    roomId: string,
    userId: string,
    settings: { visibility?: 'PUBLIC' | 'PRIVATE'; allowViewerComments?: boolean; allowViewerAISummaries?: boolean; lockBoardEditing?: boolean },
  ) {
    return request<DashboardRoom>(`/api/rooms/${encodeURIComponent(roomId)}/settings`, {
      method: 'PATCH',
      body: JSON.stringify({ userId, settings }),
    });
  },

  async regenerateInvite(roomId: string, userId: string) {
    return request<DashboardRoom>(`/api/rooms/${encodeURIComponent(roomId)}/regenerate-invite`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  },

  async updateParticipantRole(roomId: string, actorId: string, userId: string, role: 'OWNER' | 'EDITOR' | 'VIEWER') {
    return request(`/api/rooms/${encodeURIComponent(roomId)}/participants/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ actorId, role }),
    });
  },

  async removeParticipant(roomId: string, actorId: string, userId: string) {
    return request(`/api/rooms/${encodeURIComponent(roomId)}/participants/${encodeURIComponent(userId)}?actorId=${encodeURIComponent(actorId)}`, {
      method: 'DELETE',
    });
  },

  async getVersions(boardId: string) {
    return request<BoardVersionRecord[]>(`/api/boards/${encodeURIComponent(boardId)}/versions`);
  },

  async getComments(boardId: string) {
    return request<ObjectComment[]>(`/api/boards/${encodeURIComponent(boardId)}/comments`);
  },

  async getAISummaries(boardId: string) {
    return request<AISummaryRecord[]>(`/api/boards/${encodeURIComponent(boardId)}/ai-summaries`);
  },

  async generateAISummary(boardId: string, userId: string, summaryType: SummaryType) {
    return request<AISummaryRecord>(`/api/boards/${encodeURIComponent(boardId)}/ai-summary`, {
      method: 'POST',
      body: JSON.stringify({ userId, summaryType }),
    });
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
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}
