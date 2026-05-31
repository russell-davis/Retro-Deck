#!/usr/bin/env bun
import { spawn, type ChildProcess } from 'node:child_process'
import { createInterface, type Interface as RLInterface } from 'node:readline'
import { appendFileSync } from 'node:fs'
import { $ } from 'bun'
import { resolveDataPort } from '../src/server/port'
import { DiagnosticsCore } from '../src/server/diagnostics'
import type { FirmwareMsg } from '../src/server/diagnostics'

const BUTTON_IDS = ['1', '2', '3', '4', '5', '6', '7', '8']
const routine = process.argv[2] ?? ''

type SerialCtx = {
  port: string
  send: (m: unknown) => void
  rl: RLInterface
  child: ChildProcess
}

async function withSerial(cb: (ctx: SerialCtx) => Promise<void>): Promise<void> {
  const port = await resolveDataPort()
  await $`stty -F ${port} raw -echo`.quiet()
  const child = spawn('cat', [port], { stdio: ['ignore', 'pipe', 'ignore'] })
  const rl = createInterface({ input: child.stdout! })
  const send = (m: unknown) => {
    try { appendFileSync(port, JSON.stringify(m) + '\n') } catch {}
  }
  try {
    await cb({ port, send, rl, child })
  } finally {
    rl.close()
    child.kill('SIGTERM')
  }
}

function parseMsg(raw: string): FirmwareMsg | null {
  try {
    const m = JSON.parse(raw.trim())
    return m && typeof m.type === 'string' ? (m as FirmwareMsg) : null
  } catch {
    return null
  }
}

async function runTap(n: number): Promise<void> {
  process.stderr.write(`Tap any button ${n} times...\n`)
  return withSerial(({ rl }) =>
    new Promise<void>((resolve) => {
      const core = new DiagnosticsCore()
      let presses = 0
      let done = false
      rl.on('line', (raw) => {
        if (done) return
        const m = parseMsg(raw)
        if (!m) return
        core.feed({ msg: m, arrivedAt: Date.now() })
        if (m.type !== 'button.press') return
        presses++
        process.stderr.write(`\r  ${presses}/${n} `)
        if (presses < n) return
        done = true
        process.stderr.write('\n')
        console.log(JSON.stringify({ routine: 'tap', n, ...core.summary() }, null, 2))
        resolve()
      })
    }),
  )
}

async function runHold(): Promise<void> {
  process.stderr.write('Press and hold a button, then release...\n')
  return withSerial(({ rl }) =>
    new Promise<void>((resolve) => {
      const core = new DiagnosticsCore()
      let heldId: string | null = null
      let done = false
      rl.on('line', (raw) => {
        if (done) return
        const m = parseMsg(raw)
        if (!m) return
        core.feed({ msg: m, arrivedAt: Date.now() })
        if (m.type === 'button.press' && heldId === null) {
          heldId = String(m.id)
          process.stderr.write(`  Holding button ${m.id}...\n`)
        } else if (m.type === 'button.release' && heldId !== null && String(m.id) === heldId) {
          done = true
          console.log(JSON.stringify({ routine: 'hold', ...core.summary() }, null, 2))
          resolve()
        }
      })
    }),
  )
}

async function runDoubleTap(): Promise<void> {
  process.stderr.write('Quickly tap the same button twice...\n')
  return withSerial(({ rl }) =>
    new Promise<void>((resolve) => {
      const core = new DiagnosticsCore()
      let presses = 0
      let done = false
      rl.on('line', (raw) => {
        if (done) return
        const m = parseMsg(raw)
        if (!m) return
        core.feed({ msg: m, arrivedAt: Date.now() })
        if (m.type !== 'button.press') return
        presses++
        process.stderr.write(`  tap ${presses}\n`)
        if (presses < 2) return
        done = true
        const s = core.summary()
        console.log(
          JSON.stringify({ routine: 'double-tap', interTapGapMs: s.gaps?.min ?? null, ...s }, null, 2),
        )
        resolve()
      })
    }),
  )
}

async function runRapidFire(secs: number): Promise<void> {
  process.stderr.write(`Mash a button as fast as possible for ${secs} seconds...\n`)
  return withSerial(({ rl }) =>
    new Promise<void>((resolve) => {
      const core = new DiagnosticsCore()
      let presses = 0
      let done = false
      rl.on('line', (raw) => {
        if (done) return
        const m = parseMsg(raw)
        if (!m) return
        core.feed({ msg: m, arrivedAt: Date.now() })
        if (m.type === 'button.press') {
          presses++
          process.stderr.write(`\r  presses: ${presses}`)
        }
      })
      setTimeout(() => {
        if (done) return
        done = true
        process.stderr.write('\n')
        console.log(JSON.stringify({ routine: 'rapid-fire', secs, presses, ...core.summary() }, null, 2))
        resolve()
      }, secs * 1000)
    }),
  )
}

async function runChord(): Promise<void> {
  process.stderr.write('Press two different buttons simultaneously...\n')
  return withSerial(({ rl }) =>
    new Promise<void>((resolve) => {
      const core = new DiagnosticsCore()
      const presses: Array<{ id: string; arrivedAt: number }> = []
      let done = false
      rl.on('line', (raw) => {
        if (done) return
        const m = parseMsg(raw)
        if (!m) return
        const arrivedAt = Date.now()
        core.feed({ msg: m, arrivedAt })
        if (m.type !== 'button.press') return
        const id = String(m.id)
        if (presses.some((p) => p.id === id)) return
        presses.push({ id, arrivedAt })
        process.stderr.write(`  button ${id} pressed\n`)
        if (presses.length < 2) return
        done = true
        const deltaMs = presses[1].arrivedAt - presses[0].arrivedAt
        console.log(
          JSON.stringify(
            {
              routine: 'chord',
              button1: presses[0].id,
              button2: presses[1].id,
              deltaMs,
              ...core.summary(),
            },
            null,
            2,
          ),
        )
        resolve()
      })
    }),
  )
}

async function runAllButtons(): Promise<void> {
  process.stderr.write('Press each of the 8 buttons in turn...\n')
  return withSerial(({ rl }) =>
    new Promise<void>((resolve) => {
      const core = new DiagnosticsCore()
      const seen = new Set<string>()
      let done = false

      const finish = () => {
        done = true
        const missing = BUTTON_IDS.filter((id) => !seen.has(id))
        console.log(
          JSON.stringify(
            {
              routine: 'all-buttons',
              seen: [...seen].sort(),
              missing,
              allSeen: missing.length === 0,
              ...core.summary(),
            },
            null,
            2,
          ),
        )
        resolve()
      }

      const timeout = setTimeout(() => { if (!done) finish() }, 60_000)

      rl.on('line', (raw) => {
        if (done) return
        const m = parseMsg(raw)
        if (!m) return
        core.feed({ msg: m, arrivedAt: Date.now() })
        if (m.type !== 'button.press') return
        seen.add(String(m.id))
        process.stderr.write(`  seen: ${[...seen].sort().join(', ')}\n`)
        if (BUTTON_IDS.every((id) => seen.has(id))) {
          clearTimeout(timeout)
          finish()
        }
      })
    }),
  )
}

async function runPingStress(n: number): Promise<void> {
  process.stderr.write(`Firing ${n} pings...\n`)
  return withSerial(({ send, rl }) =>
    new Promise<void>((resolve) => {
      const core = new DiagnosticsCore()
      let pongCount = 0
      let done = false

      rl.on('line', (raw) => {
        if (done) return
        const m = parseMsg(raw)
        if (!m) return
        core.feed({ msg: m, arrivedAt: Date.now() })
        if (m.type === 'pong') {
          pongCount++
          process.stderr.write(`\r  pongs: ${pongCount}/${n}`)
          if (pongCount >= n) {
            done = true
            process.stderr.write('\n')
            console.log(JSON.stringify({ routine: 'ping-stress', n, pongCount, ...core.summary() }, null, 2))
            resolve()
          }
        }
      })

      for (let i = 0; i < n; i++) {
        send({ type: 'ping', id: i + 1, ht: Date.now() })
      }

      setTimeout(() => {
        if (done) return
        done = true
        process.stderr.write('\n')
        console.log(
          JSON.stringify(
            { routine: 'ping-stress', n, pongCount, dropped: n - pongCount, ...core.summary() },
            null,
            2,
          ),
        )
        resolve()
      }, 5000)
    }),
  )
}

// Measures the host's fork-per-keystroke ceiling.
// Uses ydotool key 42:1 42:0 (left-shift press+release) — emits no character,
// safe to run regardless of focused window.
async function runForkBench(n: number): Promise<void> {
  process.stderr.write(`Measuring host fork ceiling: ${n} ydotool invocations...\n`)
  const times: number[] = []
  const start = Date.now()
  for (let i = 0; i < n; i++) {
    const t0 = Date.now()
    await $`ydotool key 42:1 42:0`.quiet()
    times.push(Date.now() - t0)
    process.stderr.write(`\r  ${i + 1}/${n}`)
  }
  process.stderr.write('\n')
  const totalMs = Date.now() - start
  let min = times[0], max = times[0], sum = 0
  for (const v of times) {
    if (v < min) min = v
    if (v > max) max = v
    sum += v
  }
  console.log(
    JSON.stringify(
      {
        routine: 'fork-bench',
        n,
        totalMs,
        invocationsPerSec: Math.round((n / totalMs) * 10000) / 10,
        perCallMs: { min, avg: Math.round(sum / times.length), max },
        note: 'ydotool key 42:1 42:0 — left-shift press+release, emits no character',
      },
      null,
      2,
    ),
  )
}

switch (routine) {
  case 'tap':
    await runTap(Number(process.argv[3] ?? 5))
    break
  case 'hold':
    await runHold()
    break
  case 'double-tap':
    await runDoubleTap()
    break
  case 'rapid-fire':
    await runRapidFire(Number(process.argv[3] ?? 5))
    break
  case 'chord':
    await runChord()
    break
  case 'all-buttons':
    await runAllButtons()
    break
  case 'ping-stress':
    await runPingStress(Number(process.argv[3] ?? 10))
    break
  case 'fork-bench':
    await runForkBench(Number(process.argv[3] ?? 20))
    break
  default:
    process.stderr.write(
      `Unknown routine: ${routine}\n` +
      'Usage: bun scripts/diag.ts <routine> [args]\n' +
      'Routines: tap [n]  hold  double-tap  rapid-fire [secs]  chord  all-buttons  ping-stress [n]  fork-bench [n]\n',
    )
    process.exit(1)
}
