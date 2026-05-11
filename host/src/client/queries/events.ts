import { useEffect, useState } from 'react'

export type LiveEvent = { id: number; t: number; data: Record<string, unknown> }

const MAX = 100

export function useEventStream() {
  const [events, setEvents] = useState<LiveEvent[]>([])
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const es = new EventSource('/api/events')
    let nextId = 1

    es.onopen = () => setConnected(true)
    es.onerror = () => setConnected(false)
    es.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data) as Record<string, unknown>
        setEvents((prev) => {
          const next = [...prev, { id: nextId++, t: Date.now(), data }]
          return next.length > MAX ? next.slice(-MAX) : next
        })
      } catch {}
    }

    return () => {
      es.close()
      setConnected(false)
    }
  }, [])

  return { events, connected }
}
