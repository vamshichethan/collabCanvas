export type WhiteboardObjectType = 'path' | 'rectangle' | 'circle' | 'line' | 'text';

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

export type Participant = {
  userId: string;
  name: string;
  socketId: string;
  joinedAt: number;
  role: 'editor' | 'viewer';
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

export type CursorPosition = {
  roomId: string;
  userId: string;
  name: string;
  x: number;
  y: number;
};
