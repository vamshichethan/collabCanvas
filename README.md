# CollabCanvas

Room-based collaborative whiteboard built with React, TypeScript, Tailwind CSS, Fabric.js, Node.js, Express, and Socket.IO.

## Frontend Setup

```bash
npm install
npm run dev
```

The frontend runs at `http://localhost:5173`.

## Backend Setup

```bash
cd backend
npm install
npm run dev
```

The backend runs at `http://localhost:4000`.

## Environment

Root `.env`:

```bash
VITE_SOCKET_URL=http://localhost:4000
```

Backend `.env`:

```bash
PORT=4000
CLIENT_ORIGIN=http://localhost:5173
```

## Build Commands

```bash
npm run build
cd backend
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
    useRoomCollaboration.ts
  lib/
    ids.ts
    room.ts
    whiteboardObjects.ts
  types.ts
  App.tsx
  main.tsx
  index.css
backend/
  src/
    roomManager.ts
    server.ts
    types.ts
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

## Real-Time Collaboration

The board has a sync-friendly state model: create, update, and delete actions all resolve into plain JSON objects with stable IDs and timestamps. Socket.IO sends object-level operations instead of pixels or Fabric-specific payloads.

## Socket.IO Flow

The frontend opens rooms at `/room/:roomId`. Creating a room emits `room:create`; joining or reconnecting emits `room:join`. The backend keeps an in-memory room map with participants and the latest board state per room. On join, the server sends `board:sync` to the joining socket and emits `room:participants` to the room.

Whiteboard edits emit `board:operation` with this shape:

```ts
{
  opId: string;
  roomId: string;
  objectId: string;
  type: 'CREATE' | 'UPDATE' | 'DELETE';
  payload: WhiteboardObject;
  userId: string;
  timestamp: number;
}
```

The server applies the operation to the room board state and broadcasts it with `socket.to(roomId)`, so the sender does not receive a duplicate operation. Remote clients merge the operation into their `WhiteboardObject[]` state and re-render Fabric from that object model.

Cursor presence uses throttled `cursor:move` events. Each client broadcasts pointer coordinates in canvas space, and other clients render those cursors with the sender name.
