/**
 * CollabX Editor Component
 * 
 * This component implements a real-time collaborative text editor using:
 * - Yjs (CRDT) for conflict-free replicated data types
 * - WebSocket for real-time synchronization
 * - Plain HTML textarea for simplicity
 * 
 * Architecture:
 * 1. Local edits → Yjs CRDT operations → WebSocket → Backend → Other clients
 * 2. Remote updates → WebSocket → Yjs applyUpdate → CRDT merge → UI update
 * 3. Offline edits are stored in Yjs and sync when connection is restored
 */

import { useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { CollabXSocket } from './socket'
import './Editor.css'

interface EditorProps {
  docId: string
}

export default function Editor({ docId }: EditorProps) {
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const ydocRef = useRef<Y.Doc | null>(null)
  const ytextRef = useRef<Y.Text | null>(null)
  const socketRef = useRef<CollabXSocket | null>(null)
  const isUpdatingFromRemoteRef = useRef(false)
  const isUpdatingFromLocalRef = useRef(false)
  // Custom origin object to identify local updates
  const LOCAL_ORIGIN = { source: 'local' }

  useEffect(() => {
    // Initialize Yjs document and text type
    const ydoc = new Y.Doc()
    const ytext = ydoc.getText('content')
    
    ydocRef.current = ydoc
    ytextRef.current = ytext

    // Initialize WebSocket connection
    const socket = new CollabXSocket(docId)
    socketRef.current = socket

    // Handle incoming remote updates
    socket.onMessage((update: Uint8Array) => {
      try {
        // Apply remote CRDT update to local Yjs document
        // This automatically merges with local state
        isUpdatingFromRemoteRef.current = true
        Y.applyUpdate(ydoc, update)
        isUpdatingFromRemoteRef.current = false

        // Update textarea with merged content
        updateTextareaFromYText()
      } catch (error) {
        console.error('[Editor] Error applying remote update:', error)
        isUpdatingFromRemoteRef.current = false
      }
    })

    // Listen to Yjs document updates (local and remote)
    // This handles both local edits and remote updates
    ydoc.on('update', (update: Uint8Array, origin: any) => {
      // Only send to server if this is a local update (not from remote)
      // We use a custom origin object to identify local updates
      if (origin === LOCAL_ORIGIN && socket.isConnected()) {
        // Send CRDT update to server for broadcasting
        socket.send(update)
      }
    })

    // Sync Yjs text content to textarea
    const updateTextareaFromYText = () => {
      if (textareaRef.current && !isUpdatingFromLocalRef.current) {
        const currentValue = textareaRef.current.value
        const ytextValue = ytext.toString()
        
        // Only update if different to avoid cursor jumping
        if (currentValue !== ytextValue) {
          const cursorPos = textareaRef.current.selectionStart
          textareaRef.current.value = ytextValue
          
          // Try to preserve cursor position (approximate)
          // In a production app, you'd use Yjs awareness for cursor positions
          const newCursorPos = Math.min(cursorPos, ytextValue.length)
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos)
        }
      }
    }

    // Initial sync from Yjs to textarea
    updateTextareaFromYText()

    // Listen to Yjs text changes
    ytext.observe(() => {
      updateTextareaFromYText()
    })

    // Connect to WebSocket
    socket
      .connect()
      .then(() => {
        setConnectionStatus('connected')
        
        // On first connection, send current document state
        // This helps new clients get the full document
        const state = Y.encodeStateAsUpdate(ydoc)
        if (state.length > 0) {
          socket.send(state)
        }
      })
      .catch((error) => {
        console.error('[Editor] Failed to connect:', error)
        setConnectionStatus('disconnected')
      })

    // Handle textarea input (local edits)
    const handleInput = (e: Event) => {
      const target = e.target as HTMLTextAreaElement
      const newValue = target.value
      const oldValue = ytext.toString()

      if (newValue !== oldValue && !isUpdatingFromRemoteRef.current) {
        // Use Yjs transaction to batch the update and mark it as local
        isUpdatingFromLocalRef.current = true
        
        ydoc.transact(() => {
          // Calculate the difference and apply to Yjs
          const oldLength = oldValue.length
          const newLength = newValue.length
          const cursorPos = target.selectionStart

          // Simple character-by-character diff
          // Find the first differing character
          let i = 0
          while (i < oldLength && i < newLength && oldValue[i] === newValue[i]) {
            i++
          }

          // Find the last matching character from the end
          let j = 0
          while (
            j < oldLength - i &&
            j < newLength - i &&
            oldValue[oldLength - 1 - j] === newValue[newLength - 1 - j]
          ) {
            j++
          }

          // Delete removed characters
          if (oldLength - i - j > 0) {
            ytext.delete(i, oldLength - i - j)
          }

          // Insert new characters
          if (newLength - i - j > 0) {
            ytext.insert(i, newValue.slice(i, newLength - j))
          }
        }, LOCAL_ORIGIN) // Mark this transaction as local
        
        isUpdatingFromLocalRef.current = false

        // Restore cursor position
        setTimeout(() => {
          if (textareaRef.current) {
            const cursorPos = target.selectionStart
            const newCursorPos = Math.min(cursorPos, newValue.length)
            textareaRef.current.setSelectionRange(newCursorPos, newCursorPos)
          }
        }, 0)
      }
    }

    const textarea = textareaRef.current
    if (textarea) {
      textarea.addEventListener('input', handleInput)
    }

    // Cleanup on unmount or docId change
    return () => {
      if (textarea) {
        textarea.removeEventListener('input', handleInput)
      }
      socket.disconnect()
      ydoc.destroy()
    }
  }, [docId])

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected':
        return '#4caf50'
      case 'connecting':
        return '#ff9800'
      case 'disconnected':
        return '#f44336'
    }
  }

  return (
    <div className="editor-container">
      <div className="editor-header">
        <div className="status-indicator">
          <span
            className="status-dot"
            style={{ backgroundColor: getStatusColor() }}
          ></span>
          <span className="status-text">
            {connectionStatus === 'connected'
              ? 'Connected'
              : connectionStatus === 'connecting'
              ? 'Connecting...'
              : 'Disconnected'}
          </span>
        </div>
        <div className="doc-id-display">Document: {docId}</div>
      </div>
      <textarea
        ref={textareaRef}
        className="editor-textarea"
        placeholder="Start typing... Your edits will sync in real-time with other users on the same document."
        spellCheck={false}
      />
      <div className="editor-footer">
        <p className="footer-note">
          💡 Tip: Open this page in multiple tabs with the same document ID to see
          real-time collaboration. Edits work offline and sync when reconnected.
        </p>
      </div>
    </div>
  )
}

