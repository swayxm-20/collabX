"""
CollabX Backend - WebSocket Relay Server

This backend acts as a simple relay for CRDT updates.
It does NOT inspect or resolve conflicts - that's handled by Yjs on the client.

Architecture:
- Each document has a room identified by doc_id
- Clients connect via WebSocket at /ws/{doc_id}
- Binary CRDT updates are broadcast to all other clients in the room
- No state is stored on the server (stateless relay)
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from typing import Dict, Set
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="CollabX Backend")

# In-memory storage for active connections per document
# Format: {doc_id: Set[WebSocket]}
rooms: Dict[str, Set[WebSocket]] = {}


def get_or_create_room(doc_id: str) -> Set[WebSocket]:
    """Get existing room or create a new one for the document."""
    if doc_id not in rooms:
        rooms[doc_id] = set()
    return rooms[doc_id]


def remove_connection(doc_id: str, websocket: WebSocket):
    """Remove a connection from a room and clean up empty rooms."""
    if doc_id in rooms:
        rooms[doc_id].discard(websocket)
        if len(rooms[doc_id]) == 0:
            del rooms[doc_id]
            logger.info(f"Room '{doc_id}' cleaned up (no active connections)")


@app.websocket("/ws/{doc_id}")
async def websocket_endpoint(websocket: WebSocket, doc_id: str):
    """
    WebSocket endpoint for real-time collaboration.
    
    Args:
        websocket: The WebSocket connection
        doc_id: Document identifier (used as room identifier)
    
    Behavior:
        - Accepts binary messages (CRDT updates as Uint8Array)
        - Broadcasts each update to all other clients in the same room
        - Does NOT send updates back to the sender (echo suppression)
    """
    await websocket.accept()
    room = get_or_create_room(doc_id)
    room.add(websocket)
    
    logger.info(f"Client connected to document '{doc_id}' (total clients: {len(room)})")
    
    try:
        while True:
            # Receive binary CRDT update
            data = await websocket.receive_bytes()
            
            # Broadcast to all other clients in the room (not back to sender)
            disconnected_clients = set()
            for client in room:
                if client != websocket:
                    try:
                        await client.send_bytes(data)
                    except Exception as e:
                        logger.warning(f"Failed to send to client: {e}")
                        disconnected_clients.add(client)
            
            # Clean up disconnected clients
            for client in disconnected_clients:
                room.discard(client)
                
    except WebSocketDisconnect:
        logger.info(f"Client disconnected from document '{doc_id}'")
    except Exception as e:
        logger.error(f"WebSocket error for document '{doc_id}': {e}")
    finally:
        # Clean up connection
        remove_connection(doc_id, websocket)
        logger.info(f"Client removed from document '{doc_id}' (remaining clients: {len(rooms.get(doc_id, set()))})")


@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "status": "CollabX Backend is running",
        "active_rooms": len(rooms),
        "total_connections": sum(len(clients) for clients in rooms.values())
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy"}

