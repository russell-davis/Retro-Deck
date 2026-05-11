type Listener = (event: object) => void
const listeners = new Set<Listener>()

type ActionResult = {
  type: 'action.result'
  buttonId: number
  slot: string
  action: string
  ok: boolean
  label?: string
  message?: string
}

function notifyDesktop(ev: ActionResult) {
  const summary = ev.label ?? `Button ${ev.buttonId}`
  const body = ev.message ?? ''
  const urgency = ev.ok ? 'low' : 'normal'
  const expire = ev.ok ? '3000' : '6000'
  Bun.spawn(
    ['notify-send', '--app-name=retro-deck', `--urgency=${urgency}`, `--expire-time=${expire}`, summary, body],
    { stdout: 'ignore', stderr: 'ignore' },
  )
}

export function emit(event: object) {
  const ev = event as ActionResult
  if (ev.type === 'action.result') notifyDesktop(ev)

  listeners.forEach((l) => {
    try {
      l(event)
    } catch {}
  })
}

export function onEvent(listener: Listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
