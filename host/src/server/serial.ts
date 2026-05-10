import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { $ } from 'bun'
import { emit } from './events'

const PORT = process.env.RETRO_DECK_PORT ?? '/dev/retrodeck'

export type SerialMessage = Record<string, unknown> & { type: string }
type MessageHandler = (msg: SerialMessage) => void

let stopped = false
let activeChild: ReturnType<typeof spawn> | null = null

export function stopSerial() {
  stopped = true
  activeChild?.kill('SIGTERM')
}

export async function startSerial(onMessage: MessageHandler) {
  while (!stopped) {
    try {
      await $`stty -F ${PORT} raw -echo`.quiet()
      console.log(`[serial] opened ${PORT}`)
      emit({ type: 'device.connected', port: PORT })

      const child = spawn('cat', [PORT], { stdio: ['ignore', 'pipe', 'ignore'] })
      activeChild = child
      const rl = createInterface({ input: child.stdout! })

      for await (const line of rl) {
        if (!line.trim()) continue
        try {
          const msg = JSON.parse(line)
          if (msg?.type) {
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
