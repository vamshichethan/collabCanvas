import { useCallback, useRef, useState } from 'react';
import type { Canvas } from 'fabric';

type HistoryControls = {
  canUndo: boolean;
  canRedo: boolean;
  initializeHistory: (canvas: Canvas) => void;
  saveHistory: (canvas: Canvas) => void;
  undo: (canvas: Canvas) => Promise<void>;
  redo: (canvas: Canvas) => Promise<void>;
};

export function useCanvasHistory(): HistoryControls {
  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);
  const restoring = useRef(false);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(() => setVersion((current) => current + 1), []);

  const serialize = useCallback((canvas: Canvas) => JSON.stringify(canvas.toJSON()), []);

  const loadState = useCallback(async (canvas: Canvas, state: string) => {
    restoring.current = true;
    await canvas.loadFromJSON(JSON.parse(state));
    canvas.requestRenderAll();
    restoring.current = false;
  }, []);

  const initializeHistory = useCallback(
    (canvas: Canvas) => {
      undoStack.current = [serialize(canvas)];
      redoStack.current = [];
      refresh();
    },
    [refresh, serialize],
  );

  const saveHistory = useCallback(
    (canvas: Canvas) => {
      if (restoring.current) return;

      const snapshot = serialize(canvas);
      const latest = undoStack.current[undoStack.current.length - 1];

      if (snapshot !== latest) {
        undoStack.current.push(snapshot);
        redoStack.current = [];
        refresh();
      }
    },
    [refresh, serialize],
  );

  const undo = useCallback(
    async (canvas: Canvas) => {
      if (undoStack.current.length <= 1) return;

      const current = undoStack.current.pop();
      if (current) redoStack.current.push(current);

      const previous = undoStack.current[undoStack.current.length - 1];
      await loadState(canvas, previous);
      refresh();
    },
    [loadState, refresh],
  );

  const redo = useCallback(
    async (canvas: Canvas) => {
      const next = redoStack.current.pop();
      if (!next) return;

      undoStack.current.push(next);
      await loadState(canvas, next);
      refresh();
    },
    [loadState, refresh],
  );

  return {
    canUndo: undoStack.current.length > 1,
    canRedo: redoStack.current.length > 0,
    initializeHistory,
    saveHistory,
    undo,
    redo,
  };
}
