#!/usr/bin/env bun
// Deploy firmware + libraries to the CIRCUITPY drive.
//   bun run deploy           # mount (if needed), copy, sync, leave mounted
//   bun run deploy --eject   # ...then unmount when done
//
// The CIRCUITPY device is located by filesystem LABEL, never a hardcoded path.
import { $ } from 'bun'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

const REPO = join(import.meta.dir, '..', '..')
const eject = process.argv.includes('--eject')
const t0 = performance.now()

function fail(msg: string): never {
  console.error(`[deploy] ✗ ${msg}`)
  process.exit(1)
}

// 1. Locate CIRCUITPY by label.
let dev = ''
try {
  dev = (await $`blkid -L CIRCUITPY`.text()).trim()
} catch {
  /* blkid exits non-zero when the label isn't found */
}
if (!dev) fail('no block device labeled CIRCUITPY found — is the Pico plugged in and in CIRCUITPY mode?')
console.log(`[deploy] device: ${dev}`)

// 2. Ensure it's mounted; mount via udisksctl (no sudo, polkit-backed) if not.
async function mountpointOf(device: string): Promise<string> {
  try {
    const mp = (await $`findmnt -n -o TARGET ${device}`.text()).trim()
    return mp
  } catch {
    return ''
  }
}

let mp = await mountpointOf(dev)
if (!mp) {
  console.log('[deploy] mounting…')
  try {
    await $`udisksctl mount -b ${dev}`.quiet()
  } catch (e) {
    fail(`mount failed: ${(e as Error).message}`)
  }
  mp = await mountpointOf(dev)
}
if (!mp) fail('could not determine mountpoint after mount')
console.log(`[deploy] mountpoint: ${mp}`)

// 3. Copy firmware files + libraries.
const codePy = join(REPO, 'firmware', 'code.py')
const bootPy = join(REPO, 'firmware', 'boot.py')
const libDir = join(REPO, 'lib')
for (const p of [codePy, bootPy, libDir]) {
  if (!existsSync(p)) fail(`missing source: ${p}`)
}

console.log('[deploy] copying firmware/code.py, firmware/boot.py')
await $`cp ${codePy} ${join(mp, 'code.py')}`
await $`cp ${bootPy} ${join(mp, 'boot.py')}`

console.log('[deploy] syncing lib/')
await $`rsync -rt --delete ${libDir + '/'} ${join(mp, 'lib') + '/'}`

// 4. Flush.
await $`sync`

if (eject) {
  console.log('[deploy] ejecting…')
  try {
    await $`udisksctl unmount -b ${dev}`.quiet()
  } catch (e) {
    console.warn(`[deploy] unmount failed (files are synced anyway): ${(e as Error).message}`)
  }
}

const secs = ((performance.now() - t0) / 1000).toFixed(1)
console.log(`[deploy] ✓ done in ${secs}s — CircuitPython will auto-reload`)
