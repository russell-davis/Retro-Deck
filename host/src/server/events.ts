type Listener = (event: object) => void
const listeners = new Set<Listener>()

export function emit(event: object) {
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
