import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { appendFileSync } from 'node:fs'
import { $ } from 'bun'
import { emit, onEvent } from './events'
import { getConfig } from './config'
import { resolveDataPort } from './port'

// Resolved (and re-resolved) per connection in startSerial; the data-port device
// path can change when the Pico re-enumerates after a reload.
let PORT = process.env.RETRO_DECK_PORT ?? '/dev/retrodeck'

let deviceConnected = false

function sendSerial(msg: object) {
  if (!deviceConnected) return
  try {
    appendFileSync(PORT, JSON.stringify(msg) + '\n')
  } catch {}
}

onEvent((event) => {
  const ev = event as { type: string; action?: string; ok?: boolean; label?: string; message?: string }
  if (ev.type === 'device.connected') {
    deviceConnected = true
    sendSerial({ type: 'display', line1: getConfig().activeProfile, line2: 'ready' })
  } else if (ev.type === 'device.disconnected') {
    deviceConnected = false
  } else if (ev.type === 'action.result' && ev.action !== 'noop') {
    const line2 = (ev.label ?? ev.message ?? ev.action ?? '').slice(0, 20)
    sendSerial({ type: 'display', line1: getConfig().activeProfile, line2 })
  }
})

export type SerialMessage = Record<string, unknown> & { type: string }
type MessageHandler = (msg: SerialMessage) => void

let stopped = false
let activeChild: ReturnType<typeof spawn> | null = null

// Periodically ping the device so the diagnostics UI can show live round-trip
// latency. The firmware echoes our `ht` back in its pong; the host measures RTT
// from it. Quiet otherwise — one small frame per second.
let pingTimer: ReturnType<typeof setInterval> | null = null
let pingId = 0

function startPing() {
  if (pingTimer) return
  pingTimer = setInterval(() => {
    if (deviceConnected) sendSerial({ type: 'ping', id: ++pingId, ht: Date.now() })
  }, 1000)
}

export function stopSerial() {
  stopped = true
  if (pingTimer) {
    clearInterval(pingTimer)
    pingTimer = null
  }
  activeChild?.kill('SIGTERM')
}

export async function startSerial(onMessage: MessageHandler) {
  while (!stopped) {
    try {
      PORT = await resolveDataPort()
      await $`stty -F ${PORT} raw -echo`.quiet()
      console.log(`[serial] opened ${PORT}`)
      emit({ type: 'device.connected', port: PORT })
      startPing()

      const child = spawn('cat', [PORT], { stdio: ['ignore', 'pipe', 'ignore'] })
      activeChild = child
      const rl = createInterface({ input: child.stdout! })

      for await (const line of rl) {
        if (!line.trim()) continue
        try {
          const msg = JSON.parse(line)
          if (msg?.type) {
            // Stamp true round-trip latency at serial-read time. Measuring here
            // (not in the browser) keeps RTT free of SSE/render delay.
            if (msg.type === 'pong' && typeof msg.ht === 'number') {
              msg.rtt = Date.now() - msg.ht
            }
            emit(msg)
            onMessage(msg as SerialMessage)
          }
        } catch {}
      }

      activeChild = null
      console.log('[serial] stream ended — reconnecting in 2s')
      emit({ type: 'device.disconnected' })
    } catch (e) {
      activeChild = null
      console.error('[serial] error:', (e as Error).message)
      emit({ type: 'device.disconnected', error: String(e) })
    }
    if (!stopped) await Bun.sleep(2000)
  }
}
