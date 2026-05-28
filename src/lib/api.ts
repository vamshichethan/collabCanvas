import type {
  ActivityItem,
  AISummaryRecord,
  AuthUser,
  BoardExportRecord,
  BoardJsonExport,
  BoardVersionRecord,
  ChatMessage,
  DashboardBoard,
  DashboardBoardFilters,
  DashboardRoom,
  ObjectComment,
  SummaryType,
  ExportType,
  ReplayResponse,
  WhiteboardObject,
} from '../types';

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:5000';

export const api = {
  async signup(input: { name: string; email: string; password: string }) {
    return request<{ user: AuthUser }>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async login(input: { email: string; password: string }) {
    return request<{ user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async logout() {
    return request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
  },

  async me() {
    return request<{ user: AuthUser }>('/api/auth/me');
  },

  async listRooms(_userId?: string) {
    return request<DashboardRoom[]>('/api/rooms');
  },

  async listDashboardBoards(filters: DashboardBoardFilters) {
    const params = new URLSearchParams({
      search: filters.search,
      role: filters.role,
      sort: filters.sort,
      includeArchived: String(filters.includeArchived),
      limit: '60',
    });
    return request<DashboardBoard[]>(`/api/dashboard/boards?${params.toString()}`);
  },

  async createRoom(_userId?: string, _name?: string) {
    return request<{ room: DashboardRoom; board: { id: string; title: string } }>('/api/boards', {
      method: 'POST',
      body: JSON.stringify({ title: 'Untitled Board', visibility: 'PRIVATE' }),
    });
  },

  async createBoard(input: { title: string; description?: string; visibility: 'PUBLIC' | 'PRIVATE' }) {
    return request<{ room: DashboardRoom; board: { id: string; title: string } }>('/api/boards', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async updateBoard(boardId: string, input: { title?: string; pinned?: boolean; thumbnailUrl?: string }) {
    return request(`/api/boards/${encodeURIComponent(boardId)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  async duplicateBoard(boardId: string) {
    return request<{ room: DashboardRoom; board: { id: string; title: string } }>(`/api/boards/${encodeURIComponent(boardId)}/duplicate`, {
      method: 'POST',
    });
  },

  async archiveBoard(boardId: string) {
    return request(`/api/boards/${encodeURIComponent(boardId)}/archive`, { method: 'POST' });
  },

  async restoreArchivedBoard(boardId: string) {
    return request(`/api/boards/${encodeURIComponent(boardId)}/restore`, { method: 'POST' });
  },

  async deleteBoard(boardId: string) {
    return request(`/api/boards/${encodeURIComponent(boardId)}`, { method: 'DELETE' });
  },

  async updateInviteSettings(
    roomId: string,
    input: {
      inviteEnabled?: boolean;
      inviteRole?: 'EDITOR' | 'VIEWER';
      inviteExpiresAt?: string | null;
      visibility?: 'PUBLIC' | 'PRIVATE';
    },
  ) {
    return request<DashboardRoom>(`/api/rooms/${encodeURIComponent(roomId)}/invite-settings`, {
      method: 'PATCH',
      body: JSON.stringify(input),
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
    settings: {
      visibility?: 'PUBLIC' | 'PRIVATE';
      allowViewerComments?: boolean;
      allowViewerAISummaries?: boolean;
      allowViewerExports?: boolean;
      allowViewerReplay?: boolean;
      lockBoardEditing?: boolean;
    },
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

  async getBoard(boardId: string) {
    return request<{ board: WhiteboardObject[]; lastSequenceNumber: number }>(`/api/boards/${encodeURIComponent(boardId)}`);
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

  async exportBoardJson(
    boardId: string,
    userId: string,
    options: { includeComments: boolean; includeAISummaries: boolean; includeDeleted: boolean },
  ) {
    const params = new URLSearchParams({
      userId,
      includeComments: String(options.includeComments),
      includeAISummaries: String(options.includeAISummaries),
      includeDeleted: String(options.includeDeleted),
    });
    return request<BoardJsonExport>(`/api/boards/${encodeURIComponent(boardId)}/export/json?${params.toString()}`);
  },

  async recordBoardExport(boardId: string, userId: string, exportType: ExportType) {
    return request<BoardExportRecord>(`/api/boards/${encodeURIComponent(boardId)}/export/record`, {
      method: 'POST',
      body: JSON.stringify({ userId, exportType }),
    });
  },

  async getReplay(boardId: string, userId: string) {
    return request<ReplayResponse>(`/api/boards/${encodeURIComponent(boardId)}/replay?userId=${encodeURIComponent(userId)}`);
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
    credentials: 'include',
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
