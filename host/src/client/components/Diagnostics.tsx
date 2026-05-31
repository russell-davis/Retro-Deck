import { useEffect, useRef, useState } from 'react'
import { useEventStream } from '../queries/events'
import { DiagnosticsCore } from '../../server/diagnostics'
import type { FirmwareMsg, DiagSummary } from '../../server/diagnostics'

type TimelineRow = {
  id: number
  hostT: number
  type: string
  btnId?: unknown
  seq?: number
  rtt?: number
}

const TIMELINE_TYPES = new Set(['button.press', 'button.release', 'pong', 'tick'])

function fmtTime(t: number) {
  const d = new Date(t)
  return d.toLocaleTimeString([], { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0')
}

function num(n: number | null | undefined, unit = 'ms'): string {
  return n == null ? '—' : `${n}${unit}`
}

function StatCard({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`stat-card${warn ? ' stat-card-warn' : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  )
}

export function Diagnostics() {
  const { events, connected } = useEventStream()
  const coreRef = useRef(new DiagnosticsCore())
  const lastIdRef = useRef(0)
  const rowCounter = useRef(0)
  const [summary, setSummary] = useState<DiagSummary>(() => coreRef.current.summary())
  const [timeline, setTimeline] = useState<TimelineRow[]>([])

  useEffect(() => {
    let changed = false
    const newRows: TimelineRow[] = []

    for (const e of events) {
      if (e.id <= lastIdRef.current) continue
      lastIdRef.current = e.id
      const msg = e.data as Record<string, unknown>
      if (typeof msg.type !== 'string') continue
      coreRef.current.feed({ msg: msg as FirmwareMsg, arrivedAt: e.t })
      changed = true
      if (TIMELINE_TYPES.has(msg.type)) {
        const rtt =
          msg.type === 'pong' && typeof msg.ht === 'number' ? e.t - (msg.ht as number) : undefined
        newRows.push({
          id: ++rowCounter.current,
          hostT: e.t,
          type: msg.type,
          btnId: msg.id,
          seq: typeof msg.seq === 'number' ? (msg.seq as number) : undefined,
          rtt,
        })
      }
    }

    if (!changed) return
    setSummary(coreRef.current.summary())
    if (newRows.length > 0) {
      setTimeline((prev) => {
        const next = [...prev, ...newRows]
        return next.length > 40 ? next.slice(-40) : next
      })
    }
  }, [events])

  function handleReset() {
    coreRef.current.reset()
    lastIdRef.current = 0
    setSummary(coreRef.current.summary())
    setTimeline([])
  }

  const s = summary

  return (
    <div className="diag-panel">
      <div className="diag-header">
        <div className="diag-header-left">
          <h2 className="diag-title">Diagnostics</h2>
          <span className={`dot ${connected ? 'dot-on' : 'dot-off'}`} />
        </div>
        <button className="btn-secondary btn-sm" onClick={handleReset}>
          Reset
        </button>
      </div>

      <div className="diag-stats">
        <StatCard label="Drops" value={String(s.drops)} warn={s.drops > 0} />
        <StatCard label="Dups" value={String(s.dups)} warn={s.dups > 0} />
        <StatCard label="Events/sec" value={s.throughput ? String(s.throughput.eventsPerSec) : '—'} />
        <StatCard label="Jitter" value={s.latency ? `${s.latency.jitter}ms` : '—'} />
        <StatCard label="Ping RTT avg" value={num(s.pingRtt?.avg)} />
        <StatCard label="Gap avg" value={num(s.gaps?.avg)} />
        <StatCard label="Duration avg" value={num(s.durations?.avg)} />
      </div>

      {s.latency && (
        <div className="diag-row-detail">
          <span className="stat-label">Latency offset</span>
          <span className="diag-detail-val">
            min {s.latency.min}ms · avg {s.latency.avg}ms · max {s.latency.max}ms
          </span>
        </div>
      )}

      {s.pingRtt && (
        <div className="diag-row-detail">
          <span className="stat-label">Ping RTT</span>
          <span className="diag-detail-val">
            min {s.pingRtt.min}ms · avg {s.pingRtt.avg}ms · max {s.pingRtt.max}ms
          </span>
        </div>
      )}

      <section className="card diag-timeline-card">
        <div className="event-log-head">
          <h2>Event timeline</h2>
          <span className="diag-count">{s.throughput?.totalEvents ?? 0} total</span>
        </div>
        {timeline.length === 0 ? (
          <p className="muted">No events yet — press a button or run ping-stress.</p>
        ) : (
          <ul className="diag-timeline">
            {[...timeline].reverse().map((row) => (
              <li key={row.id} className="diag-row">
                <span className="event-time">{fmtTime(row.hostT)}</span>
                <span
                  className={`diag-type-chip diag-type-${row.type.replace(/\./g, '-')}`}
                >
                  {row.type}
                </span>
                {row.btnId != null && (
                  <span className="diag-meta">btn {String(row.btnId)}</span>
                )}
                {row.seq != null && <span className="diag-meta">seq {row.seq}</span>}
                {row.rtt != null && <span className="diag-meta">{row.rtt}ms RTT</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
