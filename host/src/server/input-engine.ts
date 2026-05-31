import type { InputConfig } from './config'

export type GestureKind = 'tap' | 'double-tap' | 'hold' | 'chord'

export type Gesture = {
  key: string
  kind: GestureKind
}

// Returns a cancel function. In production wire to setTimeout/clearTimeout.
// In tests wire to a synthetic clock that advances on demand so all thresholds
// can be exercised without real wall-clock delays.
export type ScheduleTimer = (delayMs: number, callback: () => void) => () => void

type PressState = {
  pressTime: number
  holdCancelFn: (() => void) | null
  inChord: boolean
  isSecondTap: boolean
}

type PendingChord = {
  ids: number[]
  startTime: number
  cancelTimerFn: () => void
}

type PendingDoubleTap = {
  cancelTimerFn: () => void
}

export class InputEngine {
  private pressed = new Map<number, PressState>()
  private pendingChord: PendingChord | null = null
  private pendingDoubleTap = new Map<number, PendingDoubleTap>()
  private thresholds: InputConfig
  private schedule: ScheduleTimer
  private onGesture: (g: Gesture) => void

  constructor(opts: {
    thresholds: InputConfig
    schedule: ScheduleTimer
    onGesture: (g: Gesture) => void
  }) {
    this.thresholds = opts.thresholds
    this.schedule = opts.schedule
    this.onGesture = opts.onGesture
  }

  press(id: number, nowMs: number): void {
    const dtp = this.pendingDoubleTap.get(id)
    if (dtp) {
      dtp.cancelTimerFn()
      this.pendingDoubleTap.delete(id)
      this.onGesture({ key: String(id), kind: 'double-tap' })
      this.pressed.set(id, { pressTime: nowMs, holdCancelFn: null, inChord: false, isSecondTap: true })
      return
    }

    const holdCancelFn = this.schedule(this.thresholds.holdMs, () => {
      const state = this.pressed.get(id)
      if (!state || state.inChord || state.isSecondTap) return
      this.onGesture({ key: String(id), kind: 'hold' })
      this.pressed.set(id, { ...state, holdCancelFn: null })
    })

    this.pressed.set(id, { pressTime: nowMs, holdCancelFn, inChord: false, isSecondTap: false })

    if (this.pendingChord && nowMs - this.pendingChord.startTime <= this.thresholds.chordWindowMs) {
      this.pendingChord.ids.push(id)
    } else {
      const cancelTimerFn = this.schedule(this.thresholds.chordWindowMs, () => {
        this.closeChordWindow()
      })
      this.pendingChord = { ids: [id], startTime: nowMs, cancelTimerFn }
    }
  }

  release(id: number, nowMs: number): void {
    const state = this.pressed.get(id)
    if (!state) return
    this.pressed.delete(id)

    const duration = nowMs - state.pressTime
    if (duration < this.thresholds.debounceFloorMs) return
    if (state.inChord || state.isSecondTap) return

    const holdFired = state.holdCancelFn === null
    state.holdCancelFn?.()
    if (holdFired) return

    if (this.pendingChord) {
      const idx = this.pendingChord.ids.indexOf(id)
      if (idx !== -1) {
        this.pendingChord.ids.splice(idx, 1)
        if (this.pendingChord.ids.length === 0) {
          this.pendingChord.cancelTimerFn()
          this.pendingChord = null
        }
      }
    }

    const cancelTimerFn = this.schedule(this.thresholds.doubleTapMs, () => {
      this.pendingDoubleTap.delete(id)
      this.onGesture({ key: String(id), kind: 'tap' })
    })
    this.pendingDoubleTap.set(id, { cancelTimerFn })
  }

  private closeChordWindow(): void {
    if (!this.pendingChord) return
    const { ids } = this.pendingChord
    this.pendingChord = null

    if (ids.length >= 2) {
      const key = ids.slice().sort((a, b) => a - b).join('+')
      this.onGesture({ key, kind: 'chord' })
      for (const id of ids) {
        const state = this.pressed.get(id)
        if (state) {
          state.holdCancelFn?.()
          this.pressed.set(id, { ...state, inChord: true, holdCancelFn: null })
        }
      }
    }
  }
}
