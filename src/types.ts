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
};
