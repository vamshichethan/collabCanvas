# CollabCanvas

Frontend-only object-based whiteboard built with React, TypeScript, Tailwind CSS, and Fabric.js.

## Setup

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Folder Structure

```text
src/
  components/
    CanvasBoard.tsx
    ToolButton.tsx
    Toolbar.tsx
  hooks/
    useCanvasHistory.ts
  lib/
    whiteboardObjects.ts
  types.ts
  App.tsx
  main.tsx
  index.css
```

## Object-Based Editing

Fabric.js is used as the rendering and direct-manipulation layer only. The source of truth is a React state array of structured `WhiteboardObject` items. Each canvas item gets a unique `id` plus a normalized type:

```ts
type WhiteboardObject = {
  id: string;
  type: 'path' | 'rectangle' | 'circle' | 'line' | 'text';
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
```

The helpers in `src/lib/whiteboardObjects.ts` keep the boundary clear:

- `serializeCanvas()` converts Fabric objects into the board object model.
- `loadCanvasFromObjects()` renders structured objects back into Fabric.
- `createWhiteboardObject()` creates a structured object from a Fabric item.
- `updateWhiteboardObject()` updates one item in the React object array.
- `deleteWhiteboardObject()` removes an item from the React object array.

## Undo and Redo

Canvas history is stored locally as snapshots of the structured `WhiteboardObject[]` state. The first empty board state is captured when the canvas initializes. After drawing, adding shapes, editing text, moving, resizing, deleting, or clearing, the latest object array is pushed onto the undo stack.

Undo moves the current object snapshot to a redo stack and reloads the previous object array into Fabric. Redo does the reverse. Because history is based on object snapshots instead of Fabric JSON, the same model can later be sent across a network or persisted without depending on Fabric internals.

## Real-Time Readiness

The board now has a sync-friendly state model: create, update, and delete actions all resolve into plain JSON objects with stable IDs and timestamps. In the next phase, WebSocket messages can send object-level changes such as `create`, `update`, and `delete` instead of sending canvas pixels or Fabric-specific payloads.
