import { cloneElement, isValidElement, type ReactElement, type ReactNode, useCallback, useEffect, useRef } from 'react';
import {
  Canvas,
  Circle,
  FabricObject,
  IText,
  Line,
  PencilBrush,
  Rect,
  type TPointerEvent,
} from 'fabric';
import { useCanvasHistory } from '../hooks/useCanvasHistory';
import type { DrawingSettings, Tool } from '../types';

type CanvasBoardProps = {
  activeTool: Tool;
  settings: DrawingSettings;
  toolbar: ReactNode;
};

const ERASER_COLOR = '#ffffff';

type ToolbarHistoryProps = {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
};

function CanvasBoard({ activeTool, settings, toolbar }: CanvasBoardProps) {
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<Canvas | null>(null);
  const activeToolRef = useRef(activeTool);
  const settingsRef = useRef(settings);
  const shapeRef = useRef<FabricObject | Line | null>(null);
  const originRef = useRef({ x: 0, y: 0 });
  const isDrawingShapeRef = useRef(false);
  const { canUndo, canRedo, initializeHistory, saveHistory: recordHistory, undo, redo } = useCanvasHistory();

  useEffect(() => {
    activeToolRef.current = activeTool;
    settingsRef.current = settings;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const freeDrawing = activeTool === 'pen' || activeTool === 'eraser';
    canvas.isDrawingMode = freeDrawing;
    canvas.selection = activeTool === 'select';
    canvas.defaultCursor = activeTool === 'text' ? 'text' : freeDrawing ? 'crosshair' : 'default';

    canvas.getObjects().forEach((object) => {
      object.selectable = activeTool === 'select';
      object.evented = activeTool === 'select';
    });

    if (freeDrawing) {
      const brush = new PencilBrush(canvas);
      brush.color = activeTool === 'eraser' ? ERASER_COLOR : settings.color;
      brush.width = activeTool === 'eraser' ? settings.strokeWidth * 2.5 : settings.strokeWidth;
      canvas.freeDrawingBrush = brush;
    }
  }, [activeTool, settings]);

  const saveHistory = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas) recordHistory(canvas);
  }, [recordHistory]);

  const addText = useCallback(
    (canvas: Canvas, x: number, y: number) => {
      const text = new IText('Type here', {
        left: x,
        top: y,
        fill: settingsRef.current.color,
        fontFamily: 'Inter, sans-serif',
        fontSize: 28,
        editable: true,
      });

      canvas.add(text);
      canvas.setActiveObject(text);
      canvas.requestRenderAll();
      text.enterEditing();
      text.selectAll();
      saveHistory();
    },
    [saveHistory],
  );

  const createShape = useCallback((tool: Tool, x: number, y: number) => {
    const common = {
      left: x,
      top: y,
      fill: 'transparent',
      stroke: settingsRef.current.color,
      strokeWidth: settingsRef.current.strokeWidth,
      selectable: false,
      evented: false,
    };

    if (tool === 'rectangle') {
      return new Rect({ ...common, width: 1, height: 1 });
    }

    if (tool === 'circle') {
      return new Circle({ ...common, radius: 1 });
    }

    if (tool === 'line') {
      return new Line([x, y, x, y], {
        stroke: settingsRef.current.color,
        strokeWidth: settingsRef.current.strokeWidth,
        selectable: false,
        evented: false,
      });
    }

    return null;
  }, []);

  const handleMouseDown = useCallback(
    (event: { e: TPointerEvent }) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const tool = activeToolRef.current;
      const pointer = canvas.getPointer(event.e);

      if (tool === 'text') {
        addText(canvas, pointer.x, pointer.y);
        return;
      }

      if (!['rectangle', 'circle', 'line'].includes(tool)) return;

      const shape = createShape(tool, pointer.x, pointer.y);
      if (!shape) return;

      originRef.current = { x: pointer.x, y: pointer.y };
      shapeRef.current = shape;
      isDrawingShapeRef.current = true;
      canvas.add(shape);
    },
    [addText, createShape],
  );

  const handleMouseMove = useCallback((event: { e: TPointerEvent }) => {
    const canvas = canvasRef.current;
    const shape = shapeRef.current;
    if (!canvas || !shape || !isDrawingShapeRef.current) return;

    const pointer = canvas.getPointer(event.e);
    const origin = originRef.current;

    // Shape dimensions are normalized so dragging in any direction feels natural.
    if (shape instanceof Rect) {
      shape.set({
        left: Math.min(origin.x, pointer.x),
        top: Math.min(origin.y, pointer.y),
        width: Math.abs(pointer.x - origin.x),
        height: Math.abs(pointer.y - origin.y),
      });
    } else if (shape instanceof Circle) {
      const radius = Math.hypot(pointer.x - origin.x, pointer.y - origin.y) / 2;
      shape.set({
        left: Math.min(origin.x, pointer.x),
        top: Math.min(origin.y, pointer.y),
        radius,
      });
    } else if (shape instanceof Line) {
      shape.set({ x2: pointer.x, y2: pointer.y });
    }

    canvas.requestRenderAll();
  }, []);

  const handleMouseUp = useCallback(() => {
    const canvas = canvasRef.current;
    const shape = shapeRef.current;
    if (!canvas || !shape || !isDrawingShapeRef.current) return;

    shape.set({ selectable: true, evented: true });
    shape.setCoords();
    shapeRef.current = null;
    isDrawingShapeRef.current = false;
    canvas.setActiveObject(shape);
    saveHistory();
  }, [saveHistory]);

  useEffect(() => {
    const element = canvasElementRef.current;
    const shell = shellRef.current;
    if (!element || !shell) return;

    const canvas = new Canvas(element, {
      backgroundColor: '#ffffff',
      preserveObjectStacking: true,
      selection: true,
    });

    canvasRef.current = canvas;

    const resizeCanvas = () => {
      const { width, height } = shell.getBoundingClientRect();
      canvas.setDimensions({
        width: Math.max(width, 320),
        height: Math.max(height, 420),
      });
      canvas.requestRenderAll();
    };

    resizeCanvas();
    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(shell);

    canvas.on('mouse:down', handleMouseDown);
    canvas.on('mouse:move', handleMouseMove);
    canvas.on('mouse:up', handleMouseUp);
    canvas.on('path:created', saveHistory);
    canvas.on('object:modified', saveHistory);
    canvas.on('text:changed', saveHistory);

    initializeHistory(canvas);

    return () => {
      observer.disconnect();
      canvas.dispose();
      canvasRef.current = null;
    };
  }, [handleMouseDown, handleMouseMove, handleMouseUp, initializeHistory, saveHistory]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'SELECT') return;

      if (event.key === 'Delete' || event.key === 'Backspace') {
        const selected = canvas.getActiveObjects();
        if (!selected.length) return;

        selected.forEach((object) => canvas.remove(object));
        canvas.discardActiveObject();
        canvas.requestRenderAll();
        saveHistory();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saveHistory]);

  const handleUndo = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas) void undo(canvas);
  }, [undo]);

  const handleRedo = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas) void redo(canvas);
  }, [redo]);

  const handleClear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.getObjects().forEach((object) => canvas.remove(object));
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    saveHistory();
  }, [saveHistory]);

  const enhancedToolbar = isValidElement(toolbar)
    ? cloneElement(toolbar as ReactElement<Partial<ToolbarHistoryProps>>, {
        canUndo,
        canRedo,
        onUndo: handleUndo,
        onRedo: handleRedo,
        onClear: handleClear,
      })
    : toolbar;

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4">
      {enhancedToolbar}
      <div className="flex min-h-[68vh] flex-1 overflow-hidden rounded-[22px] border border-slate-200 bg-white p-2 shadow-board">
        <div ref={shellRef} className="min-h-[520px] w-full flex-1 overflow-hidden rounded-[18px] bg-white">
          <canvas ref={canvasElementRef} />
        </div>
      </div>
    </section>
  );
}

export default CanvasBoard;
