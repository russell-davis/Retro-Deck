#!/usr/bin/env bun
// One-shot device probe: validates the instrumented firmware over serial without
// needing button presses. Reads the stream, measures ping RTT, enables a
// heartbeat to check tick cadence + sequence-number continuity, then prints a
// JSON summary. Usage: bun scripts/diag-probe.ts [durationMs]
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { appendFileSync } from 'node:fs'
import { $ } from 'bun'
import { resolveDataPort } from '../src/server/port'

const PORT = await resolveDataPort()
const DURATION = Number(process.argv[2] ?? 6000)

function send(msg: unknown) {
  try {
    appendFileSync(PORT, JSON.stringify(msg) + '\n')
  } catch (e) {
    console.error('[probe] write failed:', (e as Error).message)
  }
}

await $`stty -F ${PORT} raw -echo`.quiet()
const child = spawn('cat', [PORT], { stdio: ['ignore', 'pipe', 'ignore'] })
const rl = createInterface({ input: child.stdout! })

let ready: Record<string, unknown> | null = null
let lastSeq: number | null = null
let drops = 0
let dups = 0
let jsonLines = 0
let nonJsonLines = 0
const ticks: number[] = []
const types: Record<string, number> = {}
let rtt: number | null = null
const sampleNonJson: string[] = []

rl.on('line', (raw) => {
  const line = raw.trim()
  if (!line) return
  let m: { type?: string; step?: string; seq?: number; ht?: number } | null = null
  try {
    m = JSON.parse(line)
  } catch {
    nonJsonLines++
    if (sampleNonJson.length < 3) sampleNonJson.push(line.slice(0, 60))
    return
  }
  if (!m || typeof m !== 'object') return
  jsonLines++
  if (typeof m.seq === 'number') {
    if (lastSeq !== null) {
      if (m.seq === lastSeq) dups++
      else if (m.seq > lastSeq + 1) drops += m.seq - lastSeq - 1
    }
    lastSeq = m.seq
  }
  const key = m.type ?? m.step ?? '?'
  types[key] = (types[key] ?? 0) + 1
  if (m.type === 'ready') ready = m
  if (m.type === 'pong' && typeof m.ht === 'number') rtt = Date.now() - m.ht
  if (m.type === 'tick') ticks.push(Date.now())
})

// After the device has settled: measure RTT, then turn on a 200ms heartbeat.
setTimeout(() => send({ type: 'ping', id: 1, ht: Date.now() }), 1500)
setTimeout(() => send({ type: 'config', heartbeat_ms: 200 }), 1800)

await new Promise((r) => setTimeout(r, DURATION))
send({ type: 'config', heartbeat_ms: 0 }) // leave the device quiet again
await new Promise((r) => setTimeout(r, 100))
child.kill('SIGTERM')

const gaps = ticks.slice(1).map((t, i) => t - ticks[i])
const avgGap = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null
const minGap = gaps.length ? Math.min(...gaps) : null
const maxGap = gaps.length ? Math.max(...gaps) : null

console.log(
  JSON.stringify(
    {
      port: PORT,
      portCarriesJson: jsonLines > 0 && nonJsonLines === 0,
      jsonLines,
      nonJsonLines,
      sampleNonJson,
      ready,
      types,
      seqDrops: drops,
      seqDups: dups,
      pingRttMs: rtt,
      ticks: ticks.length,
      tickGapMs: { avg: avgGap, min: minGap, max: maxGap },
    },
    null,
    2,
  ),
)
