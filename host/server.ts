import index from './index.html'
import { api } from './src/server/api'
import { startSerial, stopSerial } from './src/server/serial'
import { dispatch } from './src/server/dispatch'
import { releaseAllModifiers } from './src/server/keyboard'
import { getConfig, normalizeBinding } from './src/server/config'
import { InputEngine } from './src/server/input-engine'

const port = Number(process.env.PORT ?? 7842)
const hostname = process.env.HOST ?? 'localhost'

const server = Bun.serve({
  port,
  hostname,
  idleTimeout: 0,
  routes: {
    '/api/*': (req) => api.fetch(req),
    '/': index,
  },
  development: { hmr: true, console: true },
  fetch() {
    return new Response('Not found', { status: 404 })
  },
})

console.log(`[daemon] http://${server.hostname}:${server.port}`)

// Clear any modifier the kernel still thinks is held from a previously-crashed
// run, so we never inherit a stuck-key "hijack" on startup.
releaseAllModifiers().catch(() => {})

function makeEngine() {
  const thresholds = getConfig().input
  return new InputEngine({
    thresholds,
    schedule: (delayMs, fn) => {
      const id = setTimeout(fn, delayMs)
      return () => clearTimeout(id)
    },
    onGesture: ({ key, kind }) => {
      const cfg = getConfig()
      const profile = cfg.profiles[cfg.activeProfile]
      if (!profile) return
      const binding = normalizeBinding(profile.buttons[key])
      const slot = kind === 'hold' ? 'hold' : 'press'
      const action = binding[slot]
      if (action) {
        const primaryId = Number(key.split('+')[0]) || 0
        dispatch(action, primaryId, slot)
      } else {
        console.log(`[daemon] btn${key} ${kind} — no action bound`)
      }
    },
  })
}

let engine = makeEngine()

if (process.env.RETRO_DECK_DISABLE_SERIAL === '1') {
  console.log('[daemon] serial disabled (RETRO_DECK_DISABLE_SERIAL=1)')
} else {
  startSerial((msg) => {
    if (msg.type === 'ready') {
      console.log('[serial] device ready:', msg.version)
      engine = makeEngine()
      return
    }
    if (msg.type === 'button.press') {
      engine.press(msg.id as number, Date.now())
      return
    }
    if (msg.type === 'button.release') {
      engine.release(msg.id as number, Date.now())
    }
  })
}

const shutdown = () => {
  stopSerial()
  server.stop()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
