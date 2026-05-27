import {
  Circle,
  Eraser,
  MousePointer2,
  Pencil,
  Redo2,
  Slash,
  Square,
  TextCursorInput,
  Trash2,
  Undo2,
} from 'lucide-react';
import ToolButton from './ToolButton';
import type { DrawingSettings, Tool, ToolDefinition } from '../types';

const tools: ToolDefinition[] = [
  { id: 'select', label: 'Select', icon: MousePointer2 },
  { id: 'pen', label: 'Pen', icon: Pencil },
  { id: 'eraser', label: 'Eraser', icon: Eraser },
  { id: 'rectangle', label: 'Rectangle', icon: Square },
  { id: 'circle', label: 'Circle', icon: Circle },
  { id: 'line', label: 'Line', icon: Slash },
  { id: 'text', label: 'Text', icon: TextCursorInput },
];

type ToolbarProps = {
  activeTool: Tool;
  settings: DrawingSettings;
  canUndo?: boolean;
  canRedo?: boolean;
  disabled?: boolean;
  onToolChange: (tool: Tool) => void;
  onSettingsChange: (settings: DrawingSettings) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onClear?: () => void;
};

function Toolbar({
  activeTool,
  settings,
  canUndo = false,
  canRedo = false,
  onToolChange,
  onSettingsChange,
  onUndo,
  onRedo,
  onClear,
  disabled = false,
}: ToolbarProps) {
  return (
    <aside className="flex w-full flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap gap-2">
        {tools.map((tool) => (
          <ToolButton
            key={tool.id}
            icon={tool.icon}
            label={tool.label}
            active={activeTool === tool.id}
            disabled={disabled && tool.id !== 'select'}
            onClick={() => onToolChange(tool.id)}
          />
        ))}
      </div>

      <div className="hidden h-10 w-px bg-slate-200 sm:block" />

      <label className="flex h-10 w-12 items-center justify-center rounded-lg border border-slate-200 bg-white p-1" title="Color">
        <span className="sr-only">Color</span>
        <input
          type="color"
          value={settings.color}
          onChange={(event) => onSettingsChange({ ...settings, color: event.target.value })}
          disabled={disabled}
          className="h-8 w-full cursor-pointer rounded-md border-0 bg-transparent p-0"
        />
      </label>

      <label className="flex h-10 min-w-40 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3" title="Stroke width">
        <span className="w-8 text-center text-[11px] font-semibold text-slate-500">{settings.strokeWidth}px</span>
        <input
          type="range"
          min="1"
          max="32"
          value={settings.strokeWidth}
          disabled={disabled}
          onChange={(event) =>
            onSettingsChange({ ...settings, strokeWidth: Number(event.target.value) })
          }
          className="w-full accent-blue-600"
        />
      </label>

      <div className="hidden h-10 w-px bg-slate-200 sm:block" />

      <div className="flex gap-2">
        <ToolButton icon={Undo2} label="Undo" disabled={!canUndo} onClick={() => onUndo?.()} />
        <ToolButton icon={Redo2} label="Redo" disabled={!canRedo} onClick={() => onRedo?.()} />
        <ToolButton icon={Trash2} label="Clear canvas" disabled={disabled} onClick={() => onClear?.()} />
      </div>
    </aside>
  );
}

export default Toolbar;
