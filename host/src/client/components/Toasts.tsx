import { useEffect, useRef, useState } from 'react'
import type { LiveEvent } from '../queries/events'

type ActionResult = {
  type: 'action.result'
  buttonId: number
  slot: 'press' | 'hold'
  action: 'bash' | 'keypress' | 'profile' | 'noop'
  ok: boolean
  label?: string
  durationMs: number
  exitCode?: number
  stderrTail?: string
  message?: string
}

type Toast = {
  id: number
  result: ActionResult
  exiting: boolean
}

const MAX_TOASTS = 5
let toastCounter = 0

type Props = {
  events: LiveEvent[]
}

export function Toasts({ events }: Props) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const lastIdRef = useRef<number | null>(null)

  useEffect(() => {
    if (lastIdRef.current === null) {
      lastIdRef.current = events.length ? events[events.length - 1].id : 0
      return
    }

    for (const ev of events) {
      if (ev.id <= lastIdRef.current) continue
      lastIdRef.current = ev.id

      if (ev.data.type !== 'action.result') continue

      const result = ev.data as unknown as ActionResult
      const id = ++toastCounter
      const timeout = result.ok ? 3000 : 6000

      setToasts((prev) => {
        const next = [{ id, result, exiting: false }, ...prev]
        return next.length > MAX_TOASTS ? next.slice(0, MAX_TOASTS) : next
      })

      setTimeout(() => {
        setToasts((prev) =>
          prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)),
        )
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id))
        }, 300)
      }, timeout)
    }
  }, [events])

  function dismiss(id: number) {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)))
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 300)
  }

  if (toasts.length === 0) return null

  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map((toast) => {
        const body = toast.result.message ?? (!toast.result.ok ? toast.result.stderrTail : undefined)
        return (
          <div
            key={toast.id}
            className={`toast ${toast.result.ok ? 'toast-ok' : 'toast-error'}${toast.exiting ? ' toast-exit' : ''}`}
            onClick={() => dismiss(toast.id)}
            role="alert"
          >
            <div className="toast-head">
              <span className="toast-title">
                {toast.result.label ?? `Button ${toast.result.buttonId}`}
              </span>
              <span className={`btn-type type-${toast.result.action}`}>
                {toast.result.action}
              </span>
            </div>
            {body && <div className="toast-body">{body}</div>}
          </div>
        )
      })}
    </div>
  )
}
