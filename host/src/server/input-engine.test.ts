import { test, expect } from 'bun:test'
import { InputEngine } from './input-engine'
import type { Gesture, ScheduleTimer } from './input-engine'

const THRESHOLDS = {
  holdMs: 500,
  doubleTapMs: 250,
  chordWindowMs: 40,
  debounceFloorMs: 20,
}

type TimerEntry = { fireAt: number; fn: () => void; cancelled: boolean }

function makeClock() {
  let now = 0
  const timers: TimerEntry[] = []

  const schedule: ScheduleTimer = (delayMs, fn) => {
    const entry: TimerEntry = { fireAt: now + delayMs, fn, cancelled: false }
    timers.push(entry)
    return () => { entry.cancelled = true }
  }

  function advance(ms: number) {
    now += ms
    const ready = timers
      .filter(e => !e.cancelled && e.fireAt <= now)
      .sort((a, b) => a.fireAt - b.fireAt)
    for (const e of ready) {
      if (!e.cancelled) e.fn()
    }
  }

  return { get now() { return now }, schedule, advance }
}

test('tap: short press emits tap on double-tap timeout', () => {
  const gestures: Gesture[] = []
  const clock = makeClock()
  const engine = new InputEngine({
    thresholds: THRESHOLDS,
    schedule: clock.schedule,
    onGesture: g => gestures.push(g),
  })

  engine.press(1, clock.now)
  clock.advance(THRESHOLDS.chordWindowMs + 1)  // chord window closes, single button
  engine.release(1, clock.now)
  clock.advance(THRESHOLDS.doubleTapMs + 1)    // double-tap window expires → tap

  expect(gestures).toHaveLength(1)
  expect(gestures[0]).toEqual({ key: '1', kind: 'tap' })
})

test('hold: long press emits hold, no tap on release', () => {
  const gestures: Gesture[] = []
  const clock = makeClock()
  const engine = new InputEngine({
    thresholds: THRESHOLDS,
    schedule: clock.schedule,
    onGesture: g => gestures.push(g),
  })

  engine.press(1, clock.now)
  clock.advance(THRESHOLDS.chordWindowMs + 1)
  clock.advance(THRESHOLDS.holdMs)             // hold timer fires
  engine.release(1, clock.now)

  expect(gestures).toHaveLength(1)
  expect(gestures[0]).toEqual({ key: '1', kind: 'hold' })
})

test('double-tap: two quick presses emit double-tap', () => {
  const gestures: Gesture[] = []
  const clock = makeClock()
  const engine = new InputEngine({
    thresholds: THRESHOLDS,
    schedule: clock.schedule,
    onGesture: g => gestures.push(g),
  })

  engine.press(1, clock.now)
  clock.advance(THRESHOLDS.chordWindowMs + 1)
  engine.release(1, clock.now)
  clock.advance(100)                           // within doubleTapMs=250
  engine.press(1, clock.now)                  // recognized as second tap → double-tap
  engine.release(1, clock.now)
  clock.advance(THRESHOLDS.doubleTapMs + 1)

  expect(gestures).toHaveLength(1)
  expect(gestures[0]).toEqual({ key: '1', kind: 'double-tap' })
})

test('chord: 1+3 within window fires single chord, no standalone 1 or 3', () => {
  const gestures: Gesture[] = []
  const clock = makeClock()
  const engine = new InputEngine({
    thresholds: THRESHOLDS,
    schedule: clock.schedule,
    onGesture: g => gestures.push(g),
  })

  engine.press(1, clock.now)
  clock.advance(20)                            // within chordWindowMs=40
  engine.press(3, clock.now)
  clock.advance(THRESHOLDS.chordWindowMs)      // chord window closes
  engine.release(1, clock.now)
  engine.release(3, clock.now)
  clock.advance(THRESHOLDS.doubleTapMs + 1)

  expect(gestures).toHaveLength(1)
  expect(gestures[0]).toEqual({ key: '1+3', kind: 'chord' })

  const standalone = gestures.filter(g => g.key === '1' || g.key === '3')
  expect(standalone).toHaveLength(0)
})

test('chord does not fire for buttons pressed outside window', () => {
  const gestures: Gesture[] = []
  const clock = makeClock()
  const engine = new InputEngine({
    thresholds: THRESHOLDS,
    schedule: clock.schedule,
    onGesture: g => gestures.push(g),
  })

  engine.press(1, clock.now)
  clock.advance(THRESHOLDS.chordWindowMs + 10) // window expires → solo
  engine.press(3, clock.now)
  clock.advance(THRESHOLDS.chordWindowMs + 1)
  engine.release(1, clock.now)
  engine.release(3, clock.now)
  clock.advance(THRESHOLDS.doubleTapMs + 1)

  expect(gestures.map(g => g.key)).not.toContain('1+3')
})
