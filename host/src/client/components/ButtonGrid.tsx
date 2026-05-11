import { useEffect, useRef, useState } from 'react'
import { useConfig } from '../queries/config'
import { useStatus } from '../queries/status'
import { ButtonCard } from './ButtonCard'
import { BindingDrawer } from './BindingDrawer'
import { normalizeBinding, BUTTON_IDS } from '../lib/binding'
import type { Config } from '../../server/config'
import type { LiveEvent } from '../queries/events'

type Props = {
  events: LiveEvent[]
}

const HIGHLIGHT_MS = 250

export function ButtonGrid({ events }: Props) {
  const status = useStatus()
  const config = useConfig()
  const [hot, setHot] = useState<Record<string, boolean>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const lastSeen = useRef(0)

  useEffect(() => {
    for (const e of events) {
      if (e.id <= lastSeen.current) continue
      lastSeen.current = e.id
      const data = e.data as { type?: string; id?: number | string }
      if (data.type === 'button.press' || data.type === 'button.hold') {
        const id = String(data.id)
        const existing = timers.current.get(id)
        if (existing) clearTimeout(existing)
        setHot((prev) => (prev[id] ? prev : { ...prev, [id]: true }))
        const t = setTimeout(() => {
          timers.current.delete(id)
          setHot((prev) => {
            if (!prev[id]) return prev
            const next = { ...prev }
            delete next[id]
            return next
          })
        }, HIGHLIGHT_MS)
        timers.current.set(id, t)
      } else if (data.type === 'button.release') {
        const id = String(data.id)
        const existing = timers.current.get(id)
        if (existing) clearTimeout(existing)
        timers.current.delete(id)
        setHot((prev) => {
          if (!prev[id]) return prev
          const next = { ...prev }
          delete next[id]
          return next
        })
      }
    }
  }, [events])

  useEffect(() => {
    const t = timers.current
    return () => {
      for (const timer of t.values()) clearTimeout(timer)
      t.clear()
    }
  }, [])

  if (config.isLoading || status.isLoading) return <div className="muted">Loading config…</div>
  if (config.isError || !config.data) return <div className="error">Failed to load config.</div>
  if (!status.data) return null

  const profile = config.data.profiles[status.data.activeProfile]
  if (!profile) return <div className="error">Active profile missing in config.</div>

  return (
    <>
      <div className="btn-grid">
        {BUTTON_IDS.map((id) => {
          const binding = normalizeBinding(profile.buttons[id])
          return (
            <ButtonCard
              key={id}
              id={id}
              binding={binding}
              highlighted={!!hot[id]}
              onEdit={() => setEditingId(id)}
            />
          )
        })}
      </div>
      {editingId !== null && (
        <BindingDrawer
          buttonId={editingId}
          binding={normalizeBinding(profile.buttons[editingId])}
          config={config.data as Config}
          profileName={status.data.activeProfile}
          onClose={() => setEditingId(null)}
        />
      )}
    </>
  )
}
