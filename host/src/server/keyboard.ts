import { isModifier } from './keymap'

// All modifier evdev codes we might ever emit (left + right variants).
// Used by releaseAllModifiers() to clear any key the kernel thinks is held.
const ALL_MODIFIERS = [
  29, // leftctrl
  97, // rightctrl
  42, // leftshift
  54, // rightshift
  56, // leftalt
  100, // rightalt
  125, // leftmeta (super)
  126, // rightmeta
]

export type YdotoolResult = { ok: boolean; exitCode: number; stderr: string }

async function runYdotool(keyArgs: string[]): Promise<YdotoolResult> {
  const proc = Bun.spawn(['ydotool', 'key', ...keyArgs], { stdout: 'pipe', stderr: 'pipe' })
  const [exitRaw, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()])
  const exitCode = typeof exitRaw === 'number' ? exitRaw : -1
  return { ok: exitCode === 0, exitCode, stderr: stderr.slice(-200) }
}

// Press and release a chord in a SINGLE ydotool invocation. Doing both halves in
// one process means a modifier can never be stranded "down" between two separate
// processes — the root cause of the system-wide keyboard hijack. Modifiers press
// first and release last (reverse order), wrapping the non-modifier keys.
export async function emitChord(codes: number[]): Promise<YdotoolResult> {
  const modifiers = codes.filter((c) => isModifier(c))
  const nonModifiers = codes.filter((c) => !isModifier(c))
  const ordered = [...modifiers, ...nonModifiers]
  const press = ordered.map((c) => `${c}:1`)
  const release = [...ordered].reverse().map((c) => `${c}:0`)
  return runYdotool([...press, ...release])
}

// Best-effort: tell the kernel every modifier is up. Safe to call on startup to
// clear state leaked by a previously-crashed run, and as a manual panic.
export async function releaseAllModifiers(): Promise<YdotoolResult> {
  return runYdotool(ALL_MODIFIERS.map((c) => `${c}:0`))
}
