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
npm run prisma:generate
npm run prisma:migrate
npm run seed
npm run dev
```

The backend runs at `http://localhost:5000`.

## Environment

Root `.env`:

```bash
VITE_SOCKET_URL=http://localhost:5000
VITE_API_URL=http://localhost:5000
```

Backend `.env`:

```bash
DATABASE_URL=""
FRONTEND_URL="http://localhost:5173"
CLIENT_ORIGIN="http://localhost:5173"
PORT=5000
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
  prisma/
    schema.prisma
    seed.ts
  src/
    apiRoutes.ts
    operationManager.ts
    persistenceManager.ts
    permissionMiddleware.ts
    permissionManager.ts
    prisma.ts
    roleGuards.ts
    roomManager.ts
    roomSettingsService.ts
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
  deleted?: boolean;
  deletedAt?: number;
  deletedBy?: string;
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

## Database Persistence

PostgreSQL with Prisma is the source of truth. In-memory room and board state is only a cache for active Socket.IO sessions. Accepted operations are saved in a transaction with the board `currentState` and `lastSequenceNumber`, so server restarts can restore the board from the database.

Prisma models live in `backend/prisma/schema.prisma`:

- `User`
- `Room`
- `Board`
- `Participant`
- `DrawingOperation`
- `BoardSnapshot`
- `BoardVersion`
- `Comment`
- `ChatMessage`

Use Neon PostgreSQL or Supabase PostgreSQL by putting the connection string in `backend/.env` as `DATABASE_URL`.

## API Routes

- `POST /api/rooms` creates a persisted room, board, owner participant, and invite code.
- `GET /api/rooms/:roomId` returns room details, boards, and participants.
- `POST /api/rooms/:roomId/join` persists participant membership.
- `PATCH /api/rooms/:roomId/settings` updates public/private, viewer comments, and board lock settings.
- `POST /api/rooms/:roomId/regenerate-invite` regenerates the invite code.
- `POST /api/rooms/:roomId/participants` invites a participant.
- `PATCH /api/rooms/:roomId/participants/:userId` changes a participant role.
- `DELETE /api/rooms/:roomId/participants/:userId` removes a participant.
- `POST /api/rooms/:roomId/transfer-owner` transfers ownership.
- `GET /api/boards/:boardId` returns the persisted board state and latest sequence.
- `GET /api/boards/:boardId/versions` lists named versions.
- `POST /api/boards/:boardId/versions` creates a named version from the current board state.
- `POST /api/boards/:boardId/restore/:versionId` restores a named version and records a snapshot.
- `GET /api/boards/:boardId/snapshots` lists autosave and restore snapshots.

## Snapshots And Versions

Autosave snapshots are created every 25 accepted drawing operations. Each snapshot stores the full board state, sequence number, creation time, and creator. Named versions are user-created snapshots with a display name. Restoring a version updates `Board.currentState`, advances the board sequence, and creates a restore snapshot.

## Role-Based Permissions

Permissions are centralized in `backend/src/permissionManager.ts`, `backend/src/roleGuards.ts`, and `backend/src/permissionMiddleware.ts`. The backend never trusts the frontend role; every REST mutation and Socket.IO drawing operation checks the persisted `Participant.role` in PostgreSQL.

- `OWNER`: can draw, edit, delete, comment, invite, change roles, update room settings, create/restore versions, and transfer ownership.
- `EDITOR`: can draw, edit objects, delete own objects, comment, and create versions.
- `VIEWER`: can view the board, move cursors, read chat, and comment only when `allowViewerComments` is enabled.

Viewer mode is enforced twice: the frontend disables drawing controls and passes `readOnly` into the board, while the backend still rejects viewer drawing operations through `operation:submit`. Editors are also blocked from role changes, room settings changes, and version restores. If `lockBoardEditing` is enabled, only owners can keep editing.
