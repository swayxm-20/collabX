/**
 * WebSocket client for CollabX
 * 
 * Handles connection to the backend WebSocket server and manages
 * the lifecycle of the connection (connect, reconnect, disconnect).
 * 
 * The socket sends and receives binary CRDT updates (Uint8Array).
 */

export type SocketMessageHandler = (data: Uint8Array) => void

export class CollabXSocket {
  private ws: WebSocket | null = null
  private url: string
  private docId: string
  private messageHandler: SocketMessageHandler | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000 // Start with 1 second
  private shouldReconnect = true
  private reconnectTimeoutId: number | null = null

  constructor(docId: string, backendUrl: string = 'ws://localhost:8000') {
    this.docId = docId
    this.url = `${backendUrl}/ws/${docId}`
  }

  /**
   * Connect to the WebSocket server
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url)

        this.ws.onopen = () => {
          console.log(`[Socket] Connected to document '${this.docId}'`)
          this.reconnectAttempts = 0
          this.reconnectDelay = 1000
          resolve()
        }

        this.ws.onmessage = (event) => {
          // Receive binary CRDT update
          if (event.data instanceof ArrayBuffer) {
            const data = new Uint8Array(event.data)
            if (this.messageHandler) {
              this.messageHandler(data)
            }
          } else if (event.data instanceof Blob) {
            // Handle Blob by converting to ArrayBuffer
            event.data.arrayBuffer().then((buffer) => {
              const data = new Uint8Array(buffer)
              if (this.messageHandler) {
                this.messageHandler(data)
              }
            })
          }
        }

        this.ws.onerror = (error) => {
          console.error(`[Socket] Error for document '${this.docId}':`, error)
          reject(error)
        }

        this.ws.onclose = () => {
          console.log(`[Socket] Disconnected from document '${this.docId}'`)
          this.ws = null

          // Attempt to reconnect if we should
          if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect()
          }
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Schedule a reconnection attempt with exponential backoff
   */
  private scheduleReconnect(): void {
    this.reconnectAttempts++
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      10000 // Max 10 seconds
    )

    console.log(
      `[Socket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`
    )

    this.reconnectTimeoutId = window.setTimeout(() => {
      this.connect().catch((error) => {
        console.error('[Socket] Reconnection failed:', error)
      })
    }, delay)
  }

  /**
   * Send a binary CRDT update to the server
   */
  send(data: Uint8Array): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data)
    } else {
      console.warn('[Socket] Cannot send: WebSocket is not open')
    }
  }

  /**
   * Set the handler for incoming messages
   */
  onMessage(handler: SocketMessageHandler): void {
    this.messageHandler = handler
  }

  /**
   * Disconnect from the server (no automatic reconnect)
   */
  disconnect(): void {
    this.shouldReconnect = false
    if (this.reconnectTimeoutId !== null) {
      clearTimeout(this.reconnectTimeoutId)
      this.reconnectTimeoutId = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  /**
   * Check if the socket is currently connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }
}

