import type { LucideIcon } from 'lucide-react';

export type Tool = 'select' | 'pen' | 'eraser' | 'rectangle' | 'circle' | 'line' | 'text';
export type WhiteboardObjectType = 'path' | 'rectangle' | 'circle' | 'line' | 'text';

export type DrawingSettings = {
  color: string;
  strokeWidth: number;
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
  inviteCode: string;
  visibility: 'PUBLIC' | 'PRIVATE';
  allowViewerComments: boolean;
  lockBoardEditing: boolean;
  ownerId: string;
  boards: Array<{
    id: string;
    title: string;
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
  | 'OBJECT_CREATE'
  | 'OBJECT_DELETE'
  | 'COMMENT_ADD'
  | 'VERSION_CREATE'
  | 'VERSION_RESTORE';

export type ActivityItem = {
  id: string;
  roomId: string;
  userId?: string | null;
  type: ActivityType;
  message: string;
  createdAt: string;
};
