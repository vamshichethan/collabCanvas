import { useCallback, useRef, useState } from 'react';
import { cloneWhiteboardObjects } from '../lib/whiteboardObjects';
import type { WhiteboardObject } from '../types';

type HistoryControls = {
  canUndo: boolean;
  canRedo: boolean;
  initializeHistory: (objects: WhiteboardObject[]) => void;
  saveHistory: (objects: WhiteboardObject[]) => void;
  undo: () => WhiteboardObject[] | null;
  redo: () => WhiteboardObject[] | null;
};

export function useCanvasHistory(): HistoryControls {
  const undoStack = useRef<WhiteboardObject[][]>([]);
  const redoStack = useRef<WhiteboardObject[][]>([]);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(() => setVersion((current) => current + 1), []);

  const serialize = useCallback((objects: WhiteboardObject[]) => JSON.stringify(objects), []);

  const initializeHistory = useCallback(
    (objects: WhiteboardObject[]) => {
      undoStack.current = [cloneWhiteboardObjects(objects)];
      redoStack.current = [];
      refresh();
    },
    [refresh],
  );

  const saveHistory = useCallback(
    (objects: WhiteboardObject[]) => {
      const snapshot = cloneWhiteboardObjects(objects);
      const latest = undoStack.current[undoStack.current.length - 1];

      if (serialize(snapshot) !== serialize(latest ?? [])) {
        undoStack.current.push(snapshot);
        redoStack.current = [];
        refresh();
      }
    },
    [refresh, serialize],
  );

  const undo = useCallback(() => {
    if (undoStack.current.length <= 1) return null;

    const current = undoStack.current.pop();
    if (current) redoStack.current.push(current);

    const previous = cloneWhiteboardObjects(undoStack.current[undoStack.current.length - 1]);
    refresh();
    return previous;
  }, [refresh]);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return null;

    undoStack.current.push(next);
    refresh();
    return cloneWhiteboardObjects(next);
  }, [refresh]);

  return {
    canUndo: undoStack.current.length > 1,
    canRedo: redoStack.current.length > 0,
    initializeHistory,
    saveHistory,
    undo,
    redo,
  };
}
