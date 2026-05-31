import { readdirSync } from 'node:fs'
import { $ } from 'bun'

// The Pico exposes two USB CDC interfaces that SHARE a serial number:
//   interface 00 = console/REPL  (no protocol data)
//   interface 02 = data          (our JSON line protocol)
// A serial-only udev rule can't tell them apart, so /dev/retrodeck may land on
// the console port. We resolve the data port directly by interface number, and
// re-resolve on every reconnect so a re-enumeration (new ttyACM number after a
// CircuitPython reload) is handled automatically.

const VENDOR_ID = '239a'
const PRODUCT_ID = '80f4'
const DATA_INTERFACE = '02'

async function propsOf(dev: string): Promise<Record<string, string>> {
  try {
    const out = await $`udevadm info -q property -n ${dev}`.text()
    const props: Record<string, string> = {}
    for (const line of out.split('\n')) {
      const i = line.indexOf('=')
      if (i > 0) props[line.slice(0, i)] = line.slice(i + 1)
    }
    return props
  } catch {
    return {}
  }
}

// Returns the best-guess data-port device path. Honors RETRO_DECK_PORT if set.
// Falls back to /dev/retrodeck when nothing matches (e.g. udevadm unavailable).
export async function resolveDataPort(): Promise<string> {
  if (process.env.RETRO_DECK_PORT) return process.env.RETRO_DECK_PORT

  let devs: string[] = []
  try {
    devs = readdirSync('/dev')
      .filter((d) => d.startsWith('ttyACM'))
      .map((d) => `/dev/${d}`)
  } catch {
    /* /dev unreadable — fall through to symlink */
  }

  const matches: { dev: string; n: number }[] = []
  for (const dev of devs) {
    const p = await propsOf(dev)
    if (
      p.ID_VENDOR_ID === VENDOR_ID &&
      p.ID_MODEL_ID === PRODUCT_ID &&
      p.ID_USB_INTERFACE_NUM === DATA_INTERFACE
    ) {
      matches.push({ dev, n: Number(dev.replace('/dev/ttyACM', '')) || 0 })
    }
  }

  if (matches.length) {
    // Newest enumeration wins — after a reload the live port is the highest ACM.
    matches.sort((a, b) => b.n - a.n)
    return matches[0].dev
  }

  return '/dev/retrodeck'
}
