import {
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { jsPDF } from 'jspdf';
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
import { createClientId } from '../lib/ids';
import {
  deleteWhiteboardObject,
  loadCanvasFromObjects,
  serializeCanvas,
  tagFabricObject,
  updateWhiteboardObject,
} from '../lib/whiteboardObjects';
import type {
  BoardOperation,
  ClientOperation,
  CursorPosition,
  DrawingSettings,
  ObjectComment,
  BoardJsonExport,
  ExportType,
  Tool,
  WhiteboardObject,
} from '../types';

type CanvasBoardProps = {
  activeTool: Tool;
  settings: DrawingSettings;
  toolbar: ReactNode;
  roomId?: string;
  userId?: string;
  userName?: string;
  initialObjects?: WhiteboardObject[] | null;
  remoteOperation?: BoardOperation | null;
  remoteCursors?: CursorPosition[];
  onLocalOperation?: (operation: ClientOperation) => void;
  onCursorMove?: (x: number, y: number) => void;
  readOnly?: boolean;
  comments?: ObjectComment[];
  onSelectedObjectChange?: (objectId: string | null) => void;
  boardTitle?: string;
  canExport?: boolean;
  onJsonExport?: (options: ExportOptions) => Promise<BoardJsonExport>;
  onRecordExport?: (exportType: ExportType) => Promise<void>;
  onExportError?: (message: string) => void;
  replayObjects?: WhiteboardObject[] | null;
  replayMode?: boolean;
};

type ToolbarHistoryProps = {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onExport: () => void;
};

type ExportOptions = {
  includeComments: boolean;
  includeAISummaries: boolean;
  includeDeleted: boolean;
  transparentBackground: boolean;
};

function CanvasBoard({
  activeTool,
  settings,
  toolbar,
  roomId,
  userId,
  userName,
  initialObjects,
  remoteOperation,
  remoteCursors = [],
  onLocalOperation,
  onCursorMove,
  readOnly = false,
  comments = [],
  onSelectedObjectChange,
  boardTitle = 'CollabCanvas Board',
  canExport = true,
  onJsonExport,
  onRecordExport,
  onExportError,
  replayObjects,
  replayMode = false,
}: CanvasBoardProps) {
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<Canvas | null>(null);
  const activeToolRef = useRef(activeTool);
  const settingsRef = useRef(settings);
  const objectsRef = useRef<WhiteboardObject[]>([]);
  const shapeRef = useRef<FabricObject | Line | null>(null);
  const originRef = useRef({ x: 0, y: 0 });
  const isDrawingShapeRef = useRef(false);
  const renderingFromStateRef = useRef(false);
  const [objects, setObjects] = useState<WhiteboardObject[]>([]);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exporting, setExporting] = useState<ExportType | null>(null);
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    includeComments: true,
    includeAISummaries: true,
    includeDeleted: false,
    transparentBackground: false,
  });
  const { canUndo, canRedo, initializeHistory, saveHistory, undo, redo } = useCanvasHistory();

  const emitOperations = useCallback(
    (previousObjects: WhiteboardObject[], nextObjects: WhiteboardObject[]) => {
      if (!roomId || !userId || !onLocalOperation) return;
      if (readOnly) return;

      const previousById = new Map(previousObjects.map((object) => [object.id, object]));
      const nextById = new Map(nextObjects.map((object) => [object.id, object]));
      const timestamp = Date.now();

      nextObjects.forEach((object) => {
        const previous = previousById.get(object.id);
        const changed = previous ? JSON.stringify(previous) !== JSON.stringify(object) : true;
        if (!changed) return;

        onLocalOperation({
          opId: createClientId('op'),
          roomId,
          boardId: roomId,
          objectId: object.id,
          type: previous ? 'UPDATE' : 'CREATE',
          payload: { ...object, createdBy: object.createdBy ?? userId, updatedAt: timestamp },
          previousPayload: previous ?? null,
          userId,
          clientTimestamp: timestamp,
        });
      });

      previousObjects.forEach((object) => {
        if (nextById.has(object.id)) return;

        onLocalOperation({
          opId: createClientId('op'),
          roomId,
          boardId: roomId,
          objectId: object.id,
          type: 'DELETE',
          payload: null,
          previousPayload: object,
          userId,
          clientTimestamp: timestamp,
        });
      });
    },
    [onLocalOperation, readOnly, roomId, userId],
  );

  const commitObjects = useCallback(
    (
      nextObjects: WhiteboardObject[],
      options: { addToHistory?: boolean; render?: boolean; emit?: boolean } = {},
    ) => {
      const previousObjects = objectsRef.current;
      objectsRef.current = nextObjects;
      setObjects(nextObjects);

      if (options.addToHistory ?? true) {
        saveHistory(nextObjects);
      }

      const canvas = canvasRef.current;
      if (options.render && canvas) {
        renderingFromStateRef.current = true;
        loadCanvasFromObjects(canvas, nextObjects);
        renderingFromStateRef.current = false;
      }

      if (options.emit ?? true) {
        emitOperations(previousObjects, nextObjects);
      }
    },
    [emitOperations, saveHistory],
  );

  const syncObjectsFromCanvas = useCallback(
    (options: { addToHistory?: boolean; emit?: boolean } = {}) => {
      const canvas = canvasRef.current;
      if (!canvas || renderingFromStateRef.current) return;

      const nextObjects = serializeCanvas(canvas);
      commitObjects(nextObjects, { addToHistory: options.addToHistory, emit: options.emit });
    },
    [commitObjects],
  );

  useEffect(() => {
    if (!initialObjects) return;
    objectsRef.current = initialObjects;
    setObjects(initialObjects);
    initializeHistory(initialObjects);

    const canvas = canvasRef.current;
    if (!canvas) return;

    renderingFromStateRef.current = true;
    loadCanvasFromObjects(canvas, initialObjects);
    renderingFromStateRef.current = false;
  }, [initialObjects, initializeHistory]);

  useEffect(() => {
    if (!remoteOperation || remoteOperation.userId === userId) return;
    if (replayMode) return;

    let nextObjects = objectsRef.current;
    if (remoteOperation.type === 'DELETE') {
      nextObjects = deleteWhiteboardObject(nextObjects, remoteOperation.objectId);
    } else if (remoteOperation.payload) {
      nextObjects = updateWhiteboardObject(nextObjects, remoteOperation.payload);
    }

    commitObjects(nextObjects, { addToHistory: false, render: true, emit: false });
  }, [commitObjects, remoteOperation, replayMode, userId]);

  useEffect(() => {
    if (!replayMode || !replayObjects) return;
    objectsRef.current = replayObjects;
    setObjects(replayObjects);

    const canvas = canvasRef.current;
    if (!canvas) return;

    renderingFromStateRef.current = true;
    loadCanvasFromObjects(canvas, replayObjects);
    canvas.discardActiveObject();
    renderingFromStateRef.current = false;
  }, [replayMode, replayObjects]);

  useEffect(() => {
    activeToolRef.current = activeTool;
    settingsRef.current = settings;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const freeDrawing = activeTool === 'pen' && !readOnly && !replayMode;
    canvas.isDrawingMode = freeDrawing;
    canvas.selection = activeTool === 'select' && !readOnly && !replayMode;
    canvas.defaultCursor =
      activeTool === 'text' ? 'text' : activeTool === 'eraser' ? 'not-allowed' : freeDrawing ? 'crosshair' : 'default';

    canvas.getObjects().forEach((object) => {
      object.selectable = activeTool === 'select' && !readOnly && !replayMode;
      object.evented = !readOnly && !replayMode && (activeTool === 'select' || activeTool === 'eraser');
    });

    if (freeDrawing) {
      const brush = new PencilBrush(canvas);
      brush.color = settings.color;
      brush.width = settings.strokeWidth;
      canvas.freeDrawingBrush = brush;
    }
  }, [activeTool, readOnly, replayMode, settings]);

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
      tagFabricObject(text, 'text');

      canvas.add(text);
      canvas.setActiveObject(text);
      canvas.requestRenderAll();
      text.enterEditing();
      text.selectAll();
      syncObjectsFromCanvas();
    },
    [syncObjectsFromCanvas],
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
      return tagFabricObject(new Rect({ ...common, width: 1, height: 1 }), 'rectangle');
    }

    if (tool === 'circle') {
      return tagFabricObject(new Circle({ ...common, radius: 1 }), 'circle');
    }

    if (tool === 'line') {
      return tagFabricObject(
        new Line([x, y, x, y], {
          stroke: settingsRef.current.color,
          strokeWidth: settingsRef.current.strokeWidth,
          selectable: false,
          evented: false,
        }),
        'line',
      );
    }

    return null;
  }, []);

  const eraseTarget = useCallback(
    (event: TPointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const target = canvas.findTarget(event);
      const targetId = target ? (target as FabricObject & { whiteboardId?: string }).whiteboardId : undefined;
      if (!target || !targetId) return;

      canvas.remove(target);
      canvas.discardActiveObject();
      canvas.requestRenderAll();

      const nextObjects = deleteWhiteboardObject(objectsRef.current, targetId);
      commitObjects(nextObjects);
    },
    [commitObjects],
  );

  const handleMouseDown = useCallback(
    (event: { e: TPointerEvent }) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const tool = activeToolRef.current;
      const pointer = canvas.getPointer(event.e);
      onCursorMove?.(pointer.x, pointer.y);
      if (readOnly || replayMode) return;

      if (tool === 'eraser') {
        eraseTarget(event.e);
        return;
      }

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
    [addText, createShape, eraseTarget, onCursorMove, readOnly, replayMode],
  );

  const handleMouseMove = useCallback(
    (event: { e: TPointerEvent }) => {
      const canvas = canvasRef.current;
      const shape = shapeRef.current;

      if (activeToolRef.current === 'eraser') {
        if (readOnly || replayMode) return;
        eraseTarget(event.e);
        return;
      }

      if (!canvas || !shape || !isDrawingShapeRef.current) return;

      const pointer = canvas.getPointer(event.e);
      onCursorMove?.(pointer.x, pointer.y);
      const origin = originRef.current;

      // Shape dimensions are normalized so dragging in any direction creates a valid object model.
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
    },
    [eraseTarget, onCursorMove, readOnly, replayMode],
  );

  const handleMouseUp = useCallback(() => {
    const canvas = canvasRef.current;
    const shape = shapeRef.current;
    if (!canvas || !shape || !isDrawingShapeRef.current) return;

    shape.set({ selectable: true, evented: true });
    shape.setCoords();
    shapeRef.current = null;
    isDrawingShapeRef.current = false;
    canvas.setActiveObject(shape);
    syncObjectsFromCanvas();
  }, [syncObjectsFromCanvas]);

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
    canvas.on('path:created', (event) => {
      if (event.path) tagFabricObject(event.path, 'path');
      syncObjectsFromCanvas();
    });
    canvas.on('object:modified', (event) => {
      if (!event.target) return;
      const updatedObject = serializeCanvas(canvas).find(
        (object) => object.id === (event.target as FabricObject & { whiteboardId?: string }).whiteboardId,
      );
      if (!updatedObject) return;

      const nextObjects = updateWhiteboardObject(objectsRef.current, updatedObject);
      commitObjects(nextObjects);
    });
    canvas.on('text:changed', () => syncObjectsFromCanvas());
    canvas.on('selection:created', (event) => {
      const target = event.selected?.[0];
      onSelectedObjectChange?.((target as FabricObject & { whiteboardId?: string } | undefined)?.whiteboardId ?? null);
    });
    canvas.on('selection:updated', (event) => {
      const target = event.selected?.[0];
      onSelectedObjectChange?.((target as FabricObject & { whiteboardId?: string } | undefined)?.whiteboardId ?? null);
    });
    canvas.on('selection:cleared', () => onSelectedObjectChange?.(null));

    initializeHistory([]);

    return () => {
      observer.disconnect();
      canvas.dispose();
      canvasRef.current = null;
    };
  }, [
    commitObjects,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    initializeHistory,
    onSelectedObjectChange,
    syncObjectsFromCanvas,
  ]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      if (replayMode) return;

      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'SELECT' || target?.tagName === 'TEXTAREA') return;

      if (event.key === 'Delete' || event.key === 'Backspace') {
        const selected = canvas.getActiveObjects();
        if (!selected.length) return;

        let nextObjects = objectsRef.current;
        selected.forEach((object) => {
          const objectId = (object as FabricObject & { whiteboardId?: string }).whiteboardId;
          canvas.remove(object);
          if (objectId) nextObjects = deleteWhiteboardObject(nextObjects, objectId);
        });
        canvas.discardActiveObject();
        canvas.requestRenderAll();
        commitObjects(nextObjects);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commitObjects, replayMode]);

  const handleUndo = useCallback(() => {
    const previousObjects = undo();
    if (previousObjects) commitObjects(previousObjects, { addToHistory: false, render: true });
  }, [commitObjects, undo]);

  const handleRedo = useCallback(() => {
    const nextObjects = redo();
    if (nextObjects) commitObjects(nextObjects, { addToHistory: false, render: true });
  }, [commitObjects, redo]);

  const handleClear = useCallback(() => {
    if (readOnly) return;
    commitObjects([], { render: true });
  }, [commitObjects, readOnly]);

  const exportCanvasImage = useCallback(
    (transparentBackground: boolean) => {
      const canvas = canvasRef.current;
      if (!canvas) throw new Error('Canvas is not ready');

      const previousBackground = canvas.backgroundColor;
      canvas.backgroundColor = transparentBackground ? 'rgba(255,255,255,0)' : '#ffffff';
      canvas.requestRenderAll();
      const dataUrl = canvas.toDataURL({
        format: 'png',
        multiplier: 2,
        enableRetinaScaling: true,
      });
      canvas.backgroundColor = previousBackground;
      canvas.requestRenderAll();
      return dataUrl;
    },
    [],
  );

  const downloadFile = useCallback((href: string, filename: string) => {
    const link = document.createElement('a');
    link.href = href;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }, []);

  const handleExport = useCallback(
    async (exportType: ExportType) => {
      if (!canExport) {
        onExportError?.('You do not have permission to export this board');
        return;
      }

      setExporting(exportType);
      try {
        const filenameBase = slugify(boardTitle || 'collabcanvas-board');
        if (exportType === 'PNG') {
          downloadFile(exportCanvasImage(exportOptions.transparentBackground), `${filenameBase}.png`);
        } else if (exportType === 'PDF') {
          const image = exportCanvasImage(false);
          const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
          const pageWidth = pdf.internal.pageSize.getWidth();
          const pageHeight = pdf.internal.pageSize.getHeight();
          const title = boardTitle || 'CollabCanvas Board';
          const timestamp = new Date().toLocaleString();
          pdf.setFontSize(14);
          pdf.text(title, 12, 12);
          pdf.setFontSize(9);
          pdf.text(`Exported ${timestamp}`, 12, 18);

          const imageProps = pdf.getImageProperties(image);
          const maxWidth = pageWidth - 24;
          const maxHeight = pageHeight - 30;
          const scale = Math.min(maxWidth / imageProps.width, maxHeight / imageProps.height);
          const width = imageProps.width * scale;
          const height = imageProps.height * scale;
          pdf.addImage(image, 'PNG', (pageWidth - width) / 2, 24, width, height);
          pdf.save(`${filenameBase}.pdf`);
        } else {
          if (!onJsonExport) throw new Error('JSON export is not available');
          const data = await onJsonExport(exportOptions);
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          downloadFile(url, `${filenameBase}.json`);
          URL.revokeObjectURL(url);
        }

        await onRecordExport?.(exportType);
        setShowExportModal(false);
      } catch (error) {
        onExportError?.(error instanceof Error ? error.message : 'Export failed');
      } finally {
        setExporting(null);
      }
    },
    [boardTitle, canExport, downloadFile, exportCanvasImage, exportOptions, onExportError, onJsonExport, onRecordExport],
  );

  const enhancedToolbar = isValidElement(toolbar)
    ? cloneElement(toolbar as ReactElement<Partial<ToolbarHistoryProps>>, {
        canUndo,
        canRedo,
        onUndo: handleUndo,
        onRedo: handleRedo,
        onClear: handleClear,
        onExport: () => setShowExportModal(true),
      })
    : toolbar;
  const commentCounts = comments.reduce<Record<string, number>>((counts, comment) => {
    if (!comment.resolved) counts[comment.objectId] = (counts[comment.objectId] ?? 0) + 1;
    return counts;
  }, {});

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-col gap-3">
        {enhancedToolbar}
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-sm font-medium text-slate-600">
            {objects.length} structured object{objects.length === 1 ? '' : 's'}
          </p>
          <button
            type="button"
            onClick={() => setShowDebugPanel((current) => !current)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            {showDebugPanel ? 'Hide JSON' : 'Show JSON'}
          </button>
        </div>
      </div>

      <div
        className={[
          'grid min-h-0 flex-1 gap-4',
          showDebugPanel ? 'xl:grid-cols-[minmax(0,1fr)_420px]' : 'grid-cols-1',
        ].join(' ')}
      >
        <div className="flex min-h-[68vh] overflow-hidden rounded-[22px] border border-slate-200 bg-white p-2 shadow-board">
          <div ref={shellRef} className="relative min-h-[520px] w-full flex-1 overflow-hidden rounded-[18px] bg-white">
            <canvas ref={canvasElementRef} />
            {remoteCursors.map((cursor) => (
              <div
                key={cursor.userId}
                className="pointer-events-none absolute z-10"
                style={{ transform: `translate(${cursor.x}px, ${cursor.y}px)` }}
              >
                <div className="h-3 w-3 rotate-45 rounded-sm bg-blue-600 shadow-sm" />
                <div className="mt-1 rounded-md bg-blue-600 px-2 py-1 text-xs font-semibold text-white shadow-sm">
                  {cursor.name}
                </div>
              </div>
            ))}
            {objects
              .filter((object) => !object.deleted && commentCounts[object.id])
              .map((object) => (
                <div
                  key={object.id}
                  className="pointer-events-none absolute z-10 rounded-full border border-amber-200 bg-amber-400 px-2 py-1 text-xs font-bold text-amber-950 shadow-sm"
                  style={{ transform: `translate(${Math.max(object.x + 10, 6)}px, ${Math.max(object.y + 10, 6)}px)` }}
                >
                  {commentCounts[object.id]}
                </div>
              ))}
          </div>
        </div>

        {showDebugPanel ? (
          <aside className="max-h-[68vh] overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 shadow-board">
            <div className="border-b border-white/10 px-4 py-3 text-sm font-semibold text-slate-100">
              Board Objects JSON
            </div>
            <pre className="h-full overflow-auto p-4 text-xs leading-relaxed text-emerald-100">
              {JSON.stringify(objects, null, 2)}
            </pre>
          </aside>
        ) : null}
      </div>
      {showExportModal ? (
        <ExportModal
          options={exportOptions}
          canExport={canExport}
          exporting={exporting}
          onOptionsChange={setExportOptions}
          onClose={() => setShowExportModal(false)}
          onExport={handleExport}
        />
      ) : null}
    </section>
  );
}

export default CanvasBoard;

function ExportModal({
  options,
  canExport,
  exporting,
  onOptionsChange,
  onClose,
  onExport,
}: {
  options: ExportOptions;
  canExport: boolean;
  exporting: ExportType | null;
  onOptionsChange: (options: ExportOptions) => void;
  onClose: () => void;
  onExport: (exportType: ExportType) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-board">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Export board</h2>
            <p className="mt-1 text-sm text-slate-500">Download the current canvas or the saved structured board state.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="mt-4 grid gap-2">
          <Toggle
            label="Transparent PNG background"
            checked={options.transparentBackground}
            onChange={(checked) => onOptionsChange({ ...options, transparentBackground: checked })}
          />
          <Toggle
            label="Include comments in JSON"
            checked={options.includeComments}
            onChange={(checked) => onOptionsChange({ ...options, includeComments: checked })}
          />
          <Toggle
            label="Include AI summaries in JSON"
            checked={options.includeAISummaries}
            onChange={(checked) => onOptionsChange({ ...options, includeAISummaries: checked })}
          />
          <Toggle
            label="Include deleted/history objects"
            checked={options.includeDeleted}
            onChange={(checked) => onOptionsChange({ ...options, includeDeleted: checked })}
          />
        </div>

        {!canExport ? <p className="mt-3 text-sm font-semibold text-red-600">You do not have permission to export this board.</p> : null}

        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          {(['PNG', 'PDF', 'JSON'] as ExportType[]).map((type) => (
            <button
              key={type}
              type="button"
              disabled={!canExport || exporting !== null}
              onClick={() => onExport(type)}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {exporting === type ? 'Exporting...' : `Export ${type}`}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
      {label}
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="accent-blue-600" />
    </label>
  );
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'collabcanvas-board';
