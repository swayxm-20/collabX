# CollabX - Real-time Collaborative Editor (MVP)

A minimal but correct real-time collaborative web application demonstrating:
- **Real-time multi-user editing** with WebSockets
- **Offline-tolerant design** using CRDTs (Yjs)
- **Clean frontend–backend separation**

This MVP is designed to be small, stable, easy to run locally, and suitable for live demonstration during interviews.

## 🏗️ Architecture

### High-Level Flow

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   Client 1  │         │   Client 2  │         │   Client 3  │
│             │         │             │         │             │
│  ┌───────┐  │         │  ┌───────┐  │         │  ┌───────┐  │
│  │ Yjs   │  │         │  │ Yjs   │  │         │  │ Yjs   │  │
│  │ CRDT  │  │         │  │ CRDT  │  │         │  │ CRDT  │  │
│  └───┬───┘  │         │  └───┬───┘  │         │  └───┬───┘  │
│      │      │         │      │      │         │      │      │
└──────┼──────┘         └──────┼──────┘         └──────┼──────┘
       │                        │                        │
       │  Binary Updates        │                        │
       │  (Uint8Array)          │                        │
       └────────────────────────┼────────────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │   FastAPI Backend     │
                    │   WebSocket Relay     │
                    │                       │
                    │  Room: {doc_id}       │
                    │  Broadcast to all     │
                    │  (except sender)      │
                    └───────────────────────┘
```

### Key Components

1. **Frontend (React + TypeScript + Vite)**
   - Uses **Yjs** (CRDT library) for conflict-free replicated data types
   - Plain HTML `<textarea>` for simplicity
   - WebSocket client sends/receives binary CRDT updates
   - Local edits apply immediately (offline-tolerant)
   - Remote updates merge automatically via CRDT

2. **Backend (FastAPI)**
   - WebSocket endpoint: `/ws/{doc_id}`
   - Acts as a **stateless relay** - does NOT inspect or resolve conflicts
   - Broadcasts binary updates to all clients in the same room
   - One room per document ID

3. **CRDT (Conflict-free Replicated Data Type)**
   - **Yjs** handles all conflict resolution on the client
   - Edits are commutative and associative
   - State converges correctly even after network partitions
   - No server-side conflict resolution needed

### Data Flow

1. **Local Edit:**
   ```
   User types → textarea onChange → Yjs CRDT operation → 
   Yjs emits update → WebSocket sends binary → Backend broadcasts
   ```

2. **Remote Update:**
   ```
   WebSocket receives binary → Y.applyUpdate(ydoc, update) → 
   CRDT merges automatically → Yjs text changes → textarea updates
   ```

3. **Offline Edit:**
   ```
   User types → Yjs stores locally → (no network) → 
   On reconnect → Yjs syncs state → All clients converge
   ```

## 🚀 Quick Start

### Prerequisites

- Python 3.8+ with `pip`
- Node.js 16+ with `npm`

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Start the server:
   ```bash
   uvicorn main:app --reload
   ```

   The backend will run on `http://localhost:8000`

### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

   The frontend will run on `http://localhost:3000`

### Testing Real-time Collaboration

1. Open `http://localhost:3000` in your browser
2. Open the same URL in another browser tab (or window)
3. Type in one tab - you should see the text appear in the other tab in near real-time
4. Try disconnecting one tab (close WebSocket) and typing - edits are stored locally
5. Reconnect - the state should converge correctly

## 📁 Project Structure

```
collabx/
 ├── backend/
 │   ├── main.py              # FastAPI WebSocket server
 │   └── requirements.txt     # Python dependencies
 │
 ├── frontend/
 │   ├── index.html           # HTML entry point
 │   ├── package.json         # Node dependencies
 │   ├── vite.config.ts       # Vite configuration
 │   └── src/
 │       ├── main.tsx         # React entry point
 │       ├── App.tsx          # Main app component
 │       ├── Editor.tsx       # Collaborative editor component
 │       ├── socket.ts        # WebSocket client
 │       ├── App.css          # App styles
 │       ├── Editor.css       # Editor styles
 │       └── index.css        # Global styles
 │
 └── README.md                # This file
```

## 🔧 Technical Details

### WebSocket Protocol

- **Endpoint:** `ws://localhost:8000/ws/{doc_id}`
- **Message Format:** Binary (Uint8Array) - Yjs CRDT updates
- **Connection Lifecycle:**
  - Client connects → joins room
  - Client sends update → server broadcasts to all other clients in room
  - Client disconnects → removed from room

### CRDT Implementation

- **Library:** Yjs (`yjs` npm package)
- **Data Type:** `Y.Text` for text content
- **Update Encoding:** `Y.encodeStateAsUpdate()` and `Y.applyUpdate()`
- **Conflict Resolution:** Automatic via CRDT properties (commutativity, associativity)

### Offline Tolerance

- Yjs stores all operations locally
- Edits work without network connection
- On reconnection, Yjs syncs state using vector clocks
- All clients converge to the same state eventually

## 🎯 Design Decisions

### Why CRDTs?

- **No server-side conflict resolution needed** - reduces backend complexity
- **Offline-first** - edits work without network
- **Eventual consistency** - all clients converge to the same state
- **Scalable** - can add more clients without server logic changes

### Why Stateless Backend?

- **Simplicity** - backend is just a relay
- **No database needed** - reduces dependencies
- **Easy to understand** - clear separation of concerns
- **Future-proof** - can add Redis pub/sub later without changing client code

### Why Plain Textarea?

- **MVP focus** - demonstrates core collaboration without UI complexity
- **Easy to understand** - no rich text editor abstractions
- **Fast to implement** - focus on real-time sync, not formatting

## 🚧 Future Improvements

This MVP is intentionally minimal. Here are improvements for a production system:

### Infrastructure

- **Redis Pub/Sub** - Scale beyond single server
- **Persistent Storage** - Save documents to database (PostgreSQL, MongoDB)
- **Load Balancing** - Multiple backend instances
- **Nginx Reverse Proxy** - Production deployment

### Features

- **Authentication & Authorization** - User accounts, permissions
- **Cursor Awareness** - Show where other users are typing
- **Document History** - Version control, undo/redo
- **Rich Text Editor** - Formatting, images, tables (using Yjs rich text types)
- **Document Snapshotting** - Periodic snapshots for faster initial load
- **Presence Indicators** - Show who's online
- **Document List** - Browse and create documents

### Performance

- **Update Batching** - Batch rapid edits before sending
- **Compression** - Compress binary updates
- **Delta Updates** - Send only changes, not full state
- **CDN** - Serve static assets

### Developer Experience

- **Docker Compose** - One-command setup
- **TypeScript Strict Mode** - Better type safety
- **Unit Tests** - Test CRDT convergence
- **Integration Tests** - Test WebSocket flow
- **Error Handling** - Better error messages and recovery

## 📝 License

This is an MVP/demo project. Use as needed for learning and interviews.

## 🤝 Contributing

This is a minimal MVP. For production use, consider the "Future Improvements" section above.

---

**Built with:** React, TypeScript, Vite, Yjs, FastAPI, WebSockets

