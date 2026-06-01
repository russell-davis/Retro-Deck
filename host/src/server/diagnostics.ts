export type FirmwareMsg = Record<string, unknown> & { type: string }

export type DiagRecord = {
  msg: FirmwareMsg
  arrivedAt: number
}

export type TriStats = {
  min: number
  avg: number
  max: number
  count: number
}

export type DiagSummary = {
  buttons: Record<string, { pressCount: number; releaseCount: number; held: boolean }>
  gaps: TriStats | null
  durations: TriStats | null
  drops: number
  dups: number
  latency: (TriStats & { jitter: number }) | null
  throughput: { eventsPerSec: number; windowMs: number; totalEvents: number } | null
  pingRtt: TriStats | null
  captureMs: number
}

function tri(arr: number[]): TriStats | null {
  if (!arr.length) return null
  let min = arr[0], max = arr[0], sum = 0
  for (const v of arr) {
    if (v < min) min = v
    if (v > max) max = v
    sum += v
  }
  return { min, avg: Math.round(sum / arr.length), max, count: arr.length }
}

export class DiagnosticsCore {
  private _buttons = new Map<string, { pressCount: number; releaseCount: number; held: boolean }>()
  private _pressAt = new Map<string, number>()
  private _pressTimes: number[] = []
  private _durations: number[] = []
  private _gaps: number[] = []
  private _drops = 0
  private _dups = 0
  private _lastSeq: number | null = null
  // arrivedAt - msg.t series. Device and host clocks are independent so this
  // raw offset is meaningless in absolute terms; its variation (jitter = max-min)
  // reveals delivery consistency without requiring clock synchronisation.
  private _offsets: number[] = []
  private _rtts: number[] = []
  private _startAt: number | null = null
  private _lastAt: number | null = null
  private _count = 0

  feed({ msg, arrivedAt }: DiagRecord): void {
    if (this._startAt === null) this._startAt = arrivedAt
    this._lastAt = arrivedAt
    this._count++

    if (typeof msg.seq === 'number') {
      if (this._lastSeq !== null) {
        if (msg.seq === this._lastSeq) this._dups++
        else if (msg.seq > this._lastSeq + 1) this._drops += msg.seq - this._lastSeq - 1
      }
      this._lastSeq = msg.seq
    }

    // Only device-originated messages carry a device-monotonic `t`. The daemon's
    // SSE keepalive ({type:'ping', t:Date.now()}) uses a host clock, so mixing it
    // into the offset series would wreck the jitter metric.
    if (typeof msg.t === 'number' && msg.type !== 'ping') {
      this._offsets.push(arrivedAt - (msg.t as number))
    }

    const id = String(msg.id)

    if (msg.type === 'button.press') {
      const b = this._buttons.get(id) ?? { pressCount: 0, releaseCount: 0, held: false }
      b.pressCount++
      b.held = true
      this._buttons.set(id, b)
      if (this._pressTimes.length > 0) {
        this._gaps.push(arrivedAt - this._pressTimes[this._pressTimes.length - 1])
      }
      this._pressTimes.push(arrivedAt)
      this._pressAt.set(id, arrivedAt)
    }

    if (msg.type === 'button.release') {
      const b = this._buttons.get(id) ?? { pressCount: 0, releaseCount: 0, held: false }
      b.releaseCount++
      b.held = false
      this._buttons.set(id, b)
      const pressedAt = this._pressAt.get(id)
      if (pressedAt !== undefined) {
        this._durations.push(arrivedAt - pressedAt)
        this._pressAt.delete(id)
      }
    }

    if (msg.type === 'pong' && typeof msg.ht === 'number') {
      // Prefer the daemon-stamped rtt (measured at serial-read, free of SSE/render
      // delay). Fall back to arrivedAt-ht for the CLI's direct-serial path.
      this._rtts.push(typeof msg.rtt === 'number' ? (msg.rtt as number) : arrivedAt - (msg.ht as number))
    }
  }

  summary(): DiagSummary {
    const buttons: DiagSummary['buttons'] = {}
    for (const [id, b] of this._buttons) buttons[id] = { ...b }

    const windowMs =
      this._startAt !== null && this._lastAt !== null ? this._lastAt - this._startAt : 0

    const latencyBase = tri(this._offsets)
    const latency = latencyBase
      ? { ...latencyBase, jitter: latencyBase.max - latencyBase.min }
      : null

    const throughput =
      this._count > 0 && windowMs > 0
        ? {
            eventsPerSec: Math.round((this._count / windowMs) * 10000) / 10,
            windowMs,
            totalEvents: this._count,
          }
        : null

    return {
      buttons,
      gaps: tri(this._gaps),
      durations: tri(this._durations),
      drops: this._drops,
      dups: this._dups,
      latency,
      throughput,
      pingRtt: tri(this._rtts),
      captureMs: windowMs,
    }
  }

  reset(): void {
    this._buttons.clear()
    this._pressAt.clear()
    this._pressTimes = []
    this._durations = []
    this._gaps = []
    this._drops = 0
    this._dups = 0
    this._lastSeq = null
    this._offsets = []
    this._rtts = []
    this._startAt = null
    this._lastAt = null
    this._count = 0
  }
}

export function analyzeBatch(records: DiagRecord[]): DiagSummary {
  const core = new DiagnosticsCore()
  for (const r of records) core.feed(r)
  return core.summary()
}
