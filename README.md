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
    operationManager.ts
    permissionManager.ts
    roomManager.ts
    server.ts
    socketHandlers.ts
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

## Operation Log Design

The frontend opens rooms at `/room/:roomId`. Creating a room emits `room:create`; joining or reconnecting emits `room:join`. The backend keeps rooms and participants in `roomManager.ts`, permissions in `permissionManager.ts`, and ordered room operation logs in `operationManager.ts`.

Every whiteboard edit is submitted as `operation:submit`. The client sends the operation intent with `clientTimestamp`; the backend validates the user and room, assigns `serverTimestamp` and a monotonically increasing `sequenceNumber`, appends the operation to the room log, and rebuilds the active board state by replaying operations in sequence order.

Applied operations have this shape:

```ts
{
  opId: string;
  roomId: string;
  boardId: string;
  objectId: string;
  type: 'CREATE' | 'UPDATE' | 'DELETE';
  payload: WhiteboardObject | null;
  previousPayload?: WhiteboardObject | null;
  userId: string;
  clientTimestamp: number;
  serverTimestamp: number;
  sequenceNumber: number;
}
```

## Socket.IO Flow

The sender gets `operation:ack`. Other room users get `operation:applied`, so the sender does not receive duplicate operations for edits already applied optimistically. New users receive `board:full-sync` with the active board and latest sequence number.

Cursor presence uses throttled `cursor:move` events. Each client broadcasts pointer coordinates in canvas space, and other clients render those cursors with the sender name.

## Conflict Handling

The operation log is the authority. `CREATE` adds an object only when the `objectId` is not already active. `UPDATE` applies only when the object exists and is not deleted. `DELETE` soft-deletes the object by setting `deleted`, `deletedAt`, and `deletedBy`. If two users update the same object, the operation with the later server `sequenceNumber` wins because the board state is replayed in backend order.

## Reconnect Recovery

Clients keep `lastSeenSequenceNumber` in local storage per room. On reconnect they rejoin the room and emit `operation:missed-request` with that number. The backend responds with `operation:missed-response`, containing operations after the requested sequence. If a submitted optimistic operation is rejected, the client rolls back by applying the server-provided board state or requests a full recovery path.
