import type { LiveEvent } from '../queries/events'

type Props = {
  events: LiveEvent[]
  connected: boolean
}

function fmtTime(t: number) {
  const d = new Date(t)
  return d.toLocaleTimeString([], { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0')
}

function summarize(data: Record<string, unknown>) {
  const type = String(data.type ?? 'event')
  if (type === 'ping') return null
  if (type === 'button.press' || type === 'button.hold' || type === 'button.release') {
    const id = data.id ?? '?'
    const dur = data.duration_ms ? ` (${data.duration_ms}ms)` : ''
    return `${type} #${id}${dur}`
  }
  if (type === 'config.reload') return 'config.reload'
  if (type === 'device.connected') return `device.connected (${data.port ?? ''})`
  if (type === 'device.disconnected') return 'device.disconnected'
  return type
}

export function EventLog({ events, connected }: Props) {
  const visible = events.filter((e) => summarize(e.data as Record<string, unknown>) !== null).slice(-30).reverse()

  return (
    <section className="card event-log">
      <div className="event-log-head">
        <h2>Live events</h2>
        <span className={`dot ${connected ? 'dot-on' : 'dot-off'}`} />
      </div>
      {visible.length === 0 ? (
        <p className="muted">No events yet — press a button.</p>
      ) : (
        <ul>
          {visible.map((e) => (
            <li key={e.id}>
              <span className="event-time">{fmtTime(e.t)}</span>
              <span className="event-text">{summarize(e.data as Record<string, unknown>)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
