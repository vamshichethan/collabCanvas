import type { LucideIcon } from 'lucide-react';

export type Tool = 'select' | 'pen' | 'eraser' | 'rectangle' | 'circle' | 'line' | 'text';

export type DrawingSettings = {
  color: string;
  strokeWidth: number;
};

export type ToolDefinition = {
  id: Tool;
  label: string;
  icon: LucideIcon;
};
