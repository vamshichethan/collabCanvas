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
};

export type Participant = {
  userId: string;
  name: string;
  socketId: string;
  joinedAt: number;
};

export type BoardOperation = {
  opId: string;
  roomId: string;
  objectId: string;
  type: 'CREATE' | 'UPDATE' | 'DELETE';
  payload: WhiteboardObject;
  userId: string;
  timestamp: number;
};

export type CursorPosition = {
  roomId: string;
  userId: string;
  name: string;
  x: number;
  y: number;
};
