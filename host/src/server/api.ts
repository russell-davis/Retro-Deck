import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import {
  getConfig,
  saveConfig,
  setActiveProfile,
  normalizeBinding,
  createProfile,
  renameProfile,
  deleteProfile,
  type Config,
} from './config'
import { dispatch } from './dispatch'
import { onEvent } from './events'

export const api = new Hono()
  .basePath('/api')
  .get('/status', (c) => {
    const cfg = getConfig()
    return c.json({
      ok: true as const,
      activeProfile: cfg.activeProfile,
      profiles: Object.keys(cfg.profiles),
    })
  })
  .get('/config', (c) => c.json(getConfig()))
  .put('/config', async (c) => {
    try {
      const body = (await c.req.json()) as Config
      saveConfig(body)
      return c.json({ ok: true as const })
    } catch (e) {
      return c.json({ ok: false as const, error: String(e) }, 400)
    }
  })
  .post('/fire/:id/:slot', (c) => {
    const id = c.req.param('id')
    const slot = c.req.param('slot')
    if (slot !== 'press' && slot !== 'hold') {
      return c.json({ ok: false as const, error: 'slot must be press or hold' }, 400)
    }
    const cfg = getConfig()
    const profile = cfg.profiles[cfg.activeProfile]
    if (!profile) return c.json({ ok: false as const, error: 'no active profile' }, 404)
    const binding = normalizeBinding(profile.buttons[id])
    const action = binding[slot]
    if (!action) return c.json({ ok: false as const, error: `${slot} not bound` }, 404)
    console.log(`[api] test-fire btn${id} ${slot}: ${action.type}`)
    dispatch(action, Number(id) || 0, slot)
    return c.json({ ok: true as const })
  })
  .post('/profiles', async (c) => {
    const body = (await c.req.json()) as { name?: unknown }
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name || name.includes('/')) {
      return c.json({ ok: false as const, error: 'invalid profile name' }, 400)
    }
    if (getConfig().profiles[name]) {
      return c.json({ ok: false as const, error: `profile "${name}" already exists` }, 400)
    }
    try {
      createProfile(name)
      return c.json({ ok: true as const, profile: name })
    } catch (e) {
      return c.json({ ok: false as const, error: String(e) }, 400)
    }
  })
  .put('/profiles/:name', async (c) => {
    const oldName = c.req.param('name')
    const body = (await c.req.json()) as { name?: unknown }
    const newName = typeof body.name === 'string' ? body.name.trim() : ''
    const cfg = getConfig()
    if (!cfg.profiles[oldName]) {
      return c.json({ ok: false as const, error: `profile "${oldName}" not found` }, 404)
    }
    if (!newName || newName.includes('/')) {
      return c.json({ ok: false as const, error: 'invalid profile name' }, 400)
    }
    if (oldName === newName) {
      return c.json({ ok: true as const, from: oldName, to: newName, note: 'no-op' })
    }
    if (cfg.profiles[newName]) {
      return c.json({ ok: false as const, error: `profile "${newName}" already exists` }, 400)
    }
    try {
      renameProfile(oldName, newName)
      return c.json({ ok: true as const, from: oldName, to: newName })
    } catch (e) {
      return c.json({ ok: false as const, error: String(e) }, 400)
    }
  })
  .delete('/profiles/:name', (c) => {
    const name = c.req.param('name')
    const cfg = getConfig()
    if (!cfg.profiles[name]) {
      return c.json({ ok: false as const, error: `profile "${name}" not found` }, 404)
    }
    if (Object.keys(cfg.profiles).length === 1) {
      return c.json({ ok: false as const, error: 'cannot delete the last profile' }, 400)
    }
    if (cfg.activeProfile === name) {
      return c.json(
        { ok: false as const, error: 'cannot delete the active profile — switch first' },
        400,
      )
    }
    try {
      deleteProfile(name)
      return c.json({ ok: true as const, deleted: name })
    } catch (e) {
      return c.json({ ok: false as const, error: String(e) }, 400)
    }
  })
  .post('/profile/:name', (c) => {
    const name = c.req.param('name')
    const cfg = getConfig()
    if (!cfg.profiles[name]) return c.json({ ok: false as const, error: 'profile not found' }, 404)
    setActiveProfile(name)
    return c.json({ ok: true as const, activeProfile: name })
  })
  .get('/events', (c) =>
    streamSSE(c, async (stream) => {
      let id = 0
      const queue: object[] = []
      let resolveWaiter: (() => void) | null = null

      const off = onEvent((event) => {
        queue.push(event)
        resolveWaiter?.()
        resolveWaiter = null
      })

      stream.onAbort(() => {
        off()
        resolveWaiter?.()
        resolveWaiter = null
      })

      const pingInterval = setInterval(() => {
        queue.push({ type: 'ping', t: Date.now() })
        resolveWaiter?.()
        resolveWaiter = null
      }, 15_000)

      try {
        while (!stream.closed && !stream.aborted) {
          if (queue.length === 0) {
            await new Promise<void>((resolve) => {
              resolveWaiter = resolve
            })
            continue
          }
          const event = queue.shift()!
          await stream.writeSSE({ id: String(id++), data: JSON.stringify(event) })
        }
      } finally {
        clearInterval(pingInterval)
        off()
      }
    }),
  )

export type Api = typeof api
