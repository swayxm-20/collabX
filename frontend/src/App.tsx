import { useState } from 'react'
import Editor from './Editor'
import './App.css'

function App() {
  // Simple document ID - in a real app, this would come from URL params or routing
  const [docId, setDocId] = useState('default-doc')
  const [inputDocId, setInputDocId] = useState('default-doc')

  const handleDocIdChange = () => {
    if (inputDocId.trim()) {
      setDocId(inputDocId.trim())
    }
  }

  return (
    <div className="app">
      <div className="app-header">
        <h1>CollabX</h1>
        <p className="subtitle">Real-time Collaborative Editor (MVP)</p>
        <div className="doc-id-control">
          <label htmlFor="doc-id-input">Document ID:</label>
          <input
            id="doc-id-input"
            type="text"
            value={inputDocId}
            onChange={(e) => setInputDocId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleDocIdChange()}
            placeholder="Enter document ID"
          />
          <button onClick={handleDocIdChange}>Load Document</button>
        </div>
        <p className="info">
          Open multiple tabs with the same document ID to see real-time collaboration.
          Edits are synchronized using CRDTs (Yjs) and work offline.
        </p>
      </div>
      <Editor docId={docId} />
    </div>
  )
}

export default App

