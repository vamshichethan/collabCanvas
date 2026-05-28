import type { LucideIcon } from 'lucide-react';

export type Tool = 'select' | 'pen' | 'eraser' | 'rectangle' | 'circle' | 'line' | 'text';
export type WhiteboardObjectType = 'path' | 'rectangle' | 'circle' | 'line' | 'text';

export type DrawingSettings = {
  color: string;
  strokeWidth: number;
};

export type AuthUser = {
  id: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
};

export type ToolDefinition = {
  id: Tool;
  label: string;
  icon: LucideIcon;
};

export type WhiteboardObject = {
  id: string;
  type: WhiteboardObjectType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  points?: unknown;
  text?: string;
  strokeColor: string;
  fillColor?: string;
  strokeWidth: number;
  createdBy?: string;
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
  deletedAt?: number;
  deletedBy?: string;
};

export type OperationType = 'CREATE' | 'UPDATE' | 'DELETE';

export type ClientOperation = {
  opId: string;
  roomId: string;
  boardId: string;
  objectId: string;
  type: OperationType;
  payload: WhiteboardObject | null;
  previousPayload?: WhiteboardObject | null;
  userId: string;
  clientTimestamp: number;
};

export type BoardOperation = ClientOperation & {
  serverTimestamp: number;
  sequenceNumber: number;
};

export type OperationAck = {
  accepted: boolean;
  opId: string;
  operation?: BoardOperation;
  reason?: string;
  boardState?: WhiteboardObject[];
};

export type QueuedOperationStatus = 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED';

export type QueuedOperation = ClientOperation & {
  localId: string;
  retryCount: number;
  status: QueuedOperationStatus;
};

export type SyncStatus = 'Connected' | 'Reconnecting' | 'Offline' | 'Syncing' | 'Synced';

export type BatchOperationAck = OperationAck & {
  localId: string;
};

export type Participant = {
  userId: string;
  name: string;
  socketId: string;
  joinedAt: number;
  role: 'owner' | 'editor' | 'viewer';
};

export type CursorPosition = {
  roomId: string;
  userId: string;
  name: string;
  x: number;
  y: number;
};

export type BoardVersionRecord = {
  id: string;
  boardId: string;
  name: string;
  state: unknown;
  sequenceNumber: number;
  createdAt: string;
  createdBy: string;
};

export type DashboardRoom = {
  id: string;
  name: string;
  description?: string | null;
  inviteCode: string;
  inviteEnabled: boolean;
  inviteRole: 'OWNER' | 'EDITOR' | 'VIEWER';
  inviteExpiresAt?: string | null;
  visibility: 'PUBLIC' | 'PRIVATE';
  status: 'ACTIVE' | 'ARCHIVED' | 'DELETED';
  allowViewerComments: boolean;
  allowViewerAISummaries: boolean;
  allowViewerExports: boolean;
  allowViewerReplay: boolean;
  lockBoardEditing: boolean;
  ownerId: string;
  boards: Array<{
    id: string;
    title: string;
    status: 'ACTIVE' | 'ARCHIVED' | 'DELETED';
    thumbnailUrl?: string | null;
    pinned: boolean;
    lastSequenceNumber: number;
    updatedAt: string;
  }>;
  participants: Array<{
    id: string;
    userId: string;
    role: 'OWNER' | 'EDITOR' | 'VIEWER';
    user?: {
      id: string;
      name: string;
      email?: string | null;
    };
  }>;
  updatedAt: string;
  lastActiveAt: string;
};

export type DashboardBoard = {
  id: string;
  roomId: string;
  title: string;
  roomTitle: string;
  description?: string | null;
  status: 'ACTIVE' | 'ARCHIVED' | 'DELETED';
  roomStatus: 'ACTIVE' | 'ARCHIVED' | 'DELETED';
  role: 'OWNER' | 'EDITOR' | 'VIEWER';
  visibility: 'PUBLIC' | 'PRIVATE';
  inviteCode: string;
  inviteEnabled: boolean;
  inviteRole: 'OWNER' | 'EDITOR' | 'VIEWER';
  inviteExpiresAt?: string | null;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  lastActiveAt: string;
  lastSequenceNumber: number;
  activeParticipantCount: number;
  thumbnailUrl?: string | null;
  pinned: boolean;
  isOwner: boolean;
  isShared: boolean;
  isPublic: boolean;
};

export type DashboardBoardFilters = {
  search: string;
  role: 'ALL' | 'OWNER' | 'EDITOR' | 'VIEWER';
  sort: 'updated' | 'created' | 'title';
  includeArchived: boolean;
};

export type SummaryType = 'MEETING_NOTES' | 'ACTION_ITEMS' | 'CLASS_NOTES' | 'MIND_MAP';

export type AISummaryContent = {
  summary: string;
  keyPoints: string[];
  actionItems: string[];
  decisions: string[];
  openQuestions: string[];
  nextSteps: string[];
};

export type AISummaryRecord = {
  id: string;
  boardId: string;
  roomId: string;
  generatedBy: string;
  generatedByName: string;
  summaryType: SummaryType;
  summary: AISummaryContent;
  actionItems?: string[];
  decisions?: string[];
  openQuestions?: string[];
  generatedAt?: string;
  createdAt: string;
};

export type ChatMessage = {
  id: string;
  roomId: string;
  userId: string;
  userName: string;
  message: string;
  createdAt: string;
};

export type ObjectComment = {
  id: string;
  boardId: string;
  roomId: string;
  objectId: string;
  userId: string;
  userName: string;
  message: string;
  resolved: boolean;
  createdAt: string;
};

export type ActivityType =
  | 'JOIN'
  | 'LEAVE'
  | 'BOARD_CREATE'
  | 'BOARD_RENAME'
  | 'BOARD_DUPLICATE'
  | 'BOARD_ARCHIVE'
  | 'BOARD_RESTORE'
  | 'BOARD_DELETE'
  | 'INVITE_REGENERATE'
  | 'OBJECT_CREATE'
  | 'OBJECT_DELETE'
  | 'COMMENT_ADD'
  | 'VERSION_CREATE'
  | 'VERSION_RESTORE'
  | 'BOARD_EXPORT'
  | 'BOARD_REPLAY';

export type ActivityItem = {
  id: string;
  roomId: string;
  userId?: string | null;
  type: ActivityType;
  message: string;
  createdAt: string;
};

export type ExportType = 'PNG' | 'PDF' | 'JSON';

export type BoardJsonExport = {
  boardId: string;
  roomId: string;
  title: string;
  exportedAt: string;
  lastSequenceNumber: number;
  objects: WhiteboardObject[];
  comments: ObjectComment[];
  versions: BoardVersionRecord[];
  aiSummaries: AISummaryRecord[];
};

export type BoardExportRecord = {
  id: string;
  boardId: string;
  roomId: string;
  exportedBy: string;
  exportedByName: string;
  exportType: ExportType;
  createdAt: string;
};

export type ReplayOperation = {
  opId: string;
  type: OperationType;
  objectId: string;
  payload: WhiteboardObject | null;
  previousPayload?: WhiteboardObject | null;
  userId: string;
  userName: string;
  sequenceNumber: number;
  serverTimestamp: number;
};

export type ReplayResponse = {
  boardId: string;
  roomId: string;
  operations: ReplayOperation[];
};
