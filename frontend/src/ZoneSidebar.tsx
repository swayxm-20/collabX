/**
 * ZoneSidebar Component
 * 
 * Displays Parallel Thought Zones (PTZ) in a sidebar.
 * Each zone is a parallel editable version that evolves independently.
 * 
 * CRDT Model:
 * - zones = Y.Map<zoneId, Y.Text>
 * - Each zone's content is a Y.Text CRDT for real-time collaboration
 * - All zones sync through the same Y.Doc update stream
 */

import { useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import './ZoneSidebar.css'

interface ZoneSidebarProps {
  zones: Y.Map<Y.Text>
  activeZoneId: string | null
  onZoneSelect: (zoneId: string) => void
}

export default function ZoneSidebar({ zones, activeZoneId, onZoneSelect }: ZoneSidebarProps) {
  const [zoneIds, setZoneIds] = useState<string[]>([])

  // Listen to zone map changes
  useEffect(() => {
    const updateZoneIds = () => {
      const ids: string[] = []
      zones.forEach((_, zoneId) => {
        ids.push(zoneId)
      })
      setZoneIds(ids.sort()) // Sort for consistent ordering
    }

    // Initial update
    updateZoneIds()

    // Listen to zone additions/deletions
    zones.observe(updateZoneIds)

    return () => {
      zones.unobserve(updateZoneIds)
    }
  }, [zones])

  if (zoneIds.length === 0) {
    return (
      <div className="zone-sidebar">
        <div className="zone-sidebar-header">
          <h3>Thought Zones</h3>
        </div>
        <div className="zone-sidebar-empty">
          <p>No zones yet.</p>
          <p className="hint">Select text and click "Create Thought Zone" to start.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="zone-sidebar">
      <div className="zone-sidebar-header">
        <h3>Thought Zones ({zoneIds.length})</h3>
      </div>
      <div className="zone-list">
        {zoneIds.map((zoneId) => (
          <ZoneItem
            key={zoneId}
            zoneId={zoneId}
            ytext={zones.get(zoneId)!}
            isActive={activeZoneId === zoneId}
            onSelect={() => onZoneSelect(zoneId)}
          />
        ))}
      </div>
    </div>
  )
}

interface ZoneItemProps {
  zoneId: string
  ytext: Y.Text
  isActive: boolean
  onSelect: () => void
}

function ZoneItem({ zoneId, ytext, isActive, onSelect }: ZoneItemProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isUpdatingFromYjsRef = useRef(false)
  const LOCAL_ORIGIN = { source: 'local-zone' }

  // Sync Yjs text to textarea
  useEffect(() => {
    const updateTextarea = () => {
      if (textareaRef.current && !isUpdatingFromYjsRef.current) {
        const currentValue = textareaRef.current.value
        const ytextValue = ytext.toString()

        if (currentValue !== ytextValue) {
          const cursorPos = textareaRef.current.selectionStart
          textareaRef.current.value = ytextValue
          const newCursorPos = Math.min(cursorPos, ytextValue.length)
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos)
        }
      }
    }

    // Initial sync
    updateTextarea()

    // Listen to Yjs changes
    ytext.observe(updateTextarea)

    return () => {
      ytext.unobserve(updateTextarea)
    }
  }, [ytext])

  // Handle textarea input (local edits to zone)
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const target = e.target
    const newValue = target.value
    const oldValue = ytext.toString()

    if (newValue !== oldValue) {
      isUpdatingFromYjsRef.current = true

      // Get the Y.Doc from the Y.Text
      const ydoc = ytext.doc

      ydoc.transact(() => {
        // Calculate diff (same logic as main editor)
        const oldLength = oldValue.length
        const newLength = newValue.length

        let i = 0
        while (i < oldLength && i < newLength && oldValue[i] === newValue[i]) {
          i++
        }

        let j = 0
        while (
          j < oldLength - i &&
          j < newLength - i &&
          oldValue[oldLength - 1 - j] === newValue[newLength - 1 - j]
        ) {
          j++
        }

        if (oldLength - i - j > 0) {
          ytext.delete(i, oldLength - i - j)
        }

        if (newLength - i - j > 0) {
          ytext.insert(i, newValue.slice(i, newLength - j))
        }
      }, LOCAL_ORIGIN)

      isUpdatingFromYjsRef.current = false

      // Restore cursor
      setTimeout(() => {
        if (textareaRef.current) {
          const cursorPos = target.selectionStart
          const newCursorPos = Math.min(cursorPos, newValue.length)
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos)
        }
      }, 0)
    }
  }

  return (
    <div className={`zone-item ${isActive ? 'active' : ''}`}>
      <div className="zone-header" onClick={onSelect}>
        <span className="zone-title">Zone {zoneId}</span>
        {isActive && <span className="zone-active-badge">Active</span>}
      </div>
      {isActive && (
        <textarea
          ref={textareaRef}
          className="zone-textarea"
          value={ytext.toString()}
          onChange={handleInput}
          placeholder="Edit this zone..."
          spellCheck={false}
        />
      )}
      {!isActive && (
        <div className="zone-preview">
          {ytext.toString().slice(0, 100)}
          {ytext.toString().length > 100 && '...'}
        </div>
      )}
    </div>
  )
}

