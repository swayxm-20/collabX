/**
 * CollabX Editor Component
 * 
 * This component implements a real-time collaborative text editor using:
 * - Yjs (CRDT) for conflict-free replicated data types
 * - WebSocket for real-time synchronization
 * - Plain HTML textarea for simplicity
 * - Parallel Thought Zones (PTZ) for independent parallel editing
 * 
 * Architecture:
 * 1. Local edits → Yjs CRDT operations → WebSocket → Backend → Other clients
 * 2. Remote updates → WebSocket → Yjs applyUpdate → CRDT merge → UI update
 * 3. Offline edits are stored in Yjs and sync when connection is restored
 * 
 * CRDT Model:
 * - mainText: Y.Text (main document content)
 * - zones: Y.Map<zoneId, Y.Text> (parallel thought zones)
 * All zones sync through the same Y.Doc update stream
 */

import { useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { CollabXSocket } from './socket'
import ZoneSidebar from './ZoneSidebar'
import './Editor.css'

interface EditorProps {
  docId: string
}

export default function Editor({ docId }: EditorProps) {
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const [selectedText, setSelectedText] = useState<string>('')
  const [selectionStart, setSelectionStart] = useState<number>(0)
  const [selectionEnd, setSelectionEnd] = useState<number>(0)
  const [activeZoneId, setActiveZoneId] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const ydocRef = useRef<Y.Doc | null>(null)
  const ytextRef = useRef<Y.Text | null>(null)
  const zonesRef = useRef<Y.Map<Y.Text> | null>(null)
  const socketRef = useRef<CollabXSocket | null>(null)
  const isUpdatingFromRemoteRef = useRef(false)
  const isUpdatingFromLocalRef = useRef(false)
  // Custom origin object to identify local updates
  const LOCAL_ORIGIN = { source: 'local' }

  useEffect(() => {
    // Initialize Yjs document and text type
    const ydoc = new Y.Doc()
    const ytext = ydoc.getText('content')
    
    // Initialize zones map for Parallel Thought Zones
    // zones = Y.Map<zoneId, Y.Text>
    // Each zone is a Y.Text CRDT that syncs independently
    const zones = ydoc.getMap<Y.Text>('zones')
    
    ydocRef.current = ydoc
    ytextRef.current = ytext
    zonesRef.current = zones

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

    // Handle text selection for Thought Zone creation
    const handleSelection = () => {
      const textarea = textareaRef.current
      if (textarea) {
        const start = textarea.selectionStart
        const end = textarea.selectionEnd
        setSelectionStart(start)
        setSelectionEnd(end)
        
        if (start !== end) {
          const selected = ytext.toString().slice(start, end)
          setSelectedText(selected)
        } else {
          setSelectedText('')
        }
      }
    }

    const textarea = textareaRef.current
    if (textarea) {
      textarea.addEventListener('input', handleInput)
      textarea.addEventListener('select', handleSelection)
      textarea.addEventListener('mouseup', handleSelection)
      textarea.addEventListener('keyup', handleSelection)
    }

    // Cleanup on unmount or docId change
    return () => {
      if (textarea) {
        textarea.removeEventListener('input', handleInput)
        textarea.removeEventListener('select', handleSelection)
        textarea.removeEventListener('mouseup', handleSelection)
        textarea.removeEventListener('keyup', handleSelection)
      }
      socket.disconnect()
      ydoc.destroy()
    }
  }, [docId])

  // Create a new Thought Zone from selected text
  const createThoughtZone = () => {
    if (!selectedText || !ytextRef.current || !zonesRef.current) {
      return
    }

    const ydoc = ydocRef.current!
    const ytext = ytextRef.current!
    const zones = zonesRef.current!

    // Generate unique zone ID
    const zoneId = `zone-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    ydoc.transact(() => {
      // Create new Y.Text for this zone
      const zoneText = new Y.Text()
      zoneText.insert(0, selectedText)

      // Add zone to zones map
      zones.set(zoneId, zoneText)

      // Remove selected text from main document
      ytext.delete(selectionStart, selectionEnd - selectionStart)
    }, LOCAL_ORIGIN)

    // Clear selection
    const newCursorPos = selectionStart
    setSelectedText('')
    setSelectionStart(0)
    setSelectionEnd(0)
    if (textareaRef.current) {
      textareaRef.current.setSelectionRange(newCursorPos, newCursorPos)
    }

    // Set as active zone
    setActiveZoneId(zoneId)
  }

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
    <div className="editor-layout">
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
        <div className="editor-toolbar">
          <button
            className="create-zone-button"
            onClick={createThoughtZone}
            disabled={!selectedText || selectedText.trim().length === 0}
            title={selectedText ? `Create zone from: "${selectedText.slice(0, 30)}..."` : 'Select text to create a Thought Zone'}
          >
            {selectedText ? `Create Thought Zone (${selectedText.length} chars)` : 'Select text to create zone'}
          </button>
        </div>
        <textarea
          ref={textareaRef}
          className="editor-textarea"
          placeholder="Start typing... Your edits will sync in real-time with other users on the same document. Select text and click 'Create Thought Zone' to create parallel versions."
          spellCheck={false}
        />
        <div className="editor-footer">
          <p className="footer-note">
            💡 Tip: Select text and click "Create Thought Zone" to fork it into parallel editable versions.
            Open multiple tabs to see real-time collaboration in both main document and zones.
          </p>
        </div>
      </div>
      {zonesRef.current && (
        <ZoneSidebar
          zones={zonesRef.current}
          activeZoneId={activeZoneId}
          onZoneSelect={setActiveZoneId}
        />
      )}
    </div>
  )
}

