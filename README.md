# CollabCanvas

Frontend-only whiteboard base built with React, TypeScript, Tailwind CSS, and Fabric.js.

## Setup

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Phase 1 Structure

```text
src/
  components/
    CanvasBoard.tsx
    ToolButton.tsx
    Toolbar.tsx
  hooks/
    useCanvasHistory.ts
  types.ts
  App.tsx
  main.tsx
  index.css
```

## Undo and Redo

Canvas history is stored locally as serialized Fabric.js JSON. The first empty canvas state is captured when the canvas initializes. After drawing, adding shapes, editing text, moving, resizing, deleting, or clearing, the latest canvas JSON is pushed onto the undo stack.

Undo moves the current state to a redo stack and reloads the previous JSON snapshot into Fabric. Redo does the reverse. While a snapshot is being restored, history recording is paused so loading an old state does not create a duplicate new state.
