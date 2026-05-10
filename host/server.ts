import index from './index.html'
import { api } from './src/server/api'
import { startSerial, stopSerial } from './src/server/serial'
import { dispatch } from './src/server/dispatch'
import { getConfig, normalizeBinding } from './src/server/config'

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

if (process.env.RETRO_DECK_DISABLE_SERIAL === '1') {
  console.log('[daemon] serial disabled (RETRO_DECK_DISABLE_SERIAL=1)')
} else {
  startSerial((msg) => {
    if (msg.type === 'ready') {
      console.log('[serial] device ready:', msg.version)
      return
    }
    if (msg.type !== 'button.press') return

    const id = msg.id as number
    const held = (msg.held as number[]) ?? []
    const cfg = getConfig()
    const profile = cfg.profiles[cfg.activeProfile]
    if (!profile) return

    const key =
      held.length > 0
        ? [...held, id].sort((a, b) => a - b).join('+')
        : String(id)

    const binding = normalizeBinding(profile.buttons[key])
    const action = binding.press
    if (action) dispatch(action, id, 'press')
    else console.log(`[daemon] btn${key} pressed — no action bound`)
  })
}

const shutdown = () => {
  stopSerial()
  server.stop()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
