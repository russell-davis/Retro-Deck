import { test, expect } from 'bun:test'
import { DiagnosticsCore, analyzeBatch } from './diagnostics'

test('drop and dup detection', () => {
  const core = new DiagnosticsCore()
  core.feed({ msg: { type: 'tick', t: 1000, seq: 1 }, arrivedAt: 1010 })
  core.feed({ msg: { type: 'tick', t: 1200, seq: 3 }, arrivedAt: 1210 })
  core.feed({ msg: { type: 'tick', t: 1400, seq: 3 }, arrivedAt: 1410 })
  const s = core.summary()
  expect(s.drops).toBe(1)
  expect(s.dups).toBe(1)
})

test('press-release duration', () => {
  const core = new DiagnosticsCore()
  core.feed({ msg: { type: 'button.press', id: 1, t: 0, seq: 1 }, arrivedAt: 1000 })
  core.feed({ msg: { type: 'button.release', id: 1, t: 200, seq: 2 }, arrivedAt: 1200 })
  const s = core.summary()
  expect(s.durations?.min).toBe(200)
  expect(s.durations?.max).toBe(200)
  expect(s.durations?.count).toBe(1)
  expect(s.buttons['1']?.pressCount).toBe(1)
  expect(s.buttons['1']?.releaseCount).toBe(1)
  expect(s.buttons['1']?.held).toBe(false)
})

test('latency offset jitter', () => {
  const core = new DiagnosticsCore()
  core.feed({ msg: { type: 'tick', t: 1000, seq: 1 }, arrivedAt: 1050 })
  core.feed({ msg: { type: 'tick', t: 2000, seq: 2 }, arrivedAt: 2060 })
  const s = core.summary()
  expect(s.latency?.min).toBe(50)
  expect(s.latency?.max).toBe(60)
  expect(s.latency?.jitter).toBe(10)
  expect(s.latency?.count).toBe(2)
})

test('analyzeBatch: ping RTT and multi-press gaps', () => {
  const s = analyzeBatch([
    { msg: { type: 'button.press', id: 2, t: 100, seq: 1 }, arrivedAt: 1000 },
    { msg: { type: 'button.release', id: 2, t: 400, seq: 2 }, arrivedAt: 1300 },
    { msg: { type: 'button.press', id: 2, t: 600, seq: 4 }, arrivedAt: 1600 },
    { msg: { type: 'button.release', id: 2, t: 700, seq: 5 }, arrivedAt: 1700 },
    { msg: { type: 'pong', id: 1, ht: 950, t: 0, seq: 6 }, arrivedAt: 1020 },
  ])
  expect(s.buttons['2']?.pressCount).toBe(2)
  expect(s.durations?.min).toBe(100)
  expect(s.durations?.max).toBe(300)
  expect(s.gaps?.count).toBe(1)
  expect(s.gaps?.min).toBe(600)
  expect(s.drops).toBe(1)
  expect(s.pingRtt?.min).toBe(70)
})
