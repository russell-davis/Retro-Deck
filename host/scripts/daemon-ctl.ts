#!/usr/bin/env bun
import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  openSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

const HOME = process.env.HOME!
const RUNTIME_DIR = process.env.XDG_RUNTIME_DIR ?? `/run/user/${process.getuid?.() ?? 1000}`
const STATE_DIR = process.env.XDG_STATE_HOME ?? `${HOME}/.local/state`

const PID_FILE = join(RUNTIME_DIR, 'retro-deck.pid')
const LOG_FILE = join(STATE_DIR, 'retro-deck', 'daemon.log')
const SERVER_TS = resolve(import.meta.dir, '..', 'server.ts')

const readPid = (): number | null => {
  try {
    const pid = Number(readFileSync(PID_FILE, 'utf8').trim())
    return Number.isFinite(pid) && pid > 0 ? pid : null
  } catch {
    return null
  }
}

const isAlive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function start({ hot }: { hot: boolean }) {
  const existing = readPid()
  if (existing && isAlive(existing)) {
    console.log(`already running (pid ${existing})`)
    return
  }
  if (existing) unlinkSync(PID_FILE)

  mkdirSync(dirname(LOG_FILE), { recursive: true })
  mkdirSync(dirname(PID_FILE), { recursive: true })
  const fd = openSync(LOG_FILE, 'a')

  const args = hot ? ['--hot', SERVER_TS] : [SERVER_TS]
  const child = spawn('bun', args, {
    detached: true,
    stdio: ['ignore', fd, fd],
  })
  child.unref()

  if (!child.pid) {
    console.error('failed to spawn')
    process.exit(1)
  }
  writeFileSync(PID_FILE, String(child.pid))
  console.log(`started (pid ${child.pid}, ${hot ? 'hot' : 'cold'} mode)`)
  console.log(`log: ${LOG_FILE}`)
}

async function stop() {
  const pid = readPid()
  if (!pid) {
    console.log('not running')
    return
  }
  if (!isAlive(pid)) {
    try { unlinkSync(PID_FILE) } catch {}
    console.log('not running (cleared stale pidfile)')
    return
  }
  process.kill(pid, 'SIGTERM')
  for (let i = 0; i < 50; i++) {
    if (!isAlive(pid)) break
    await sleep(100)
  }
  if (isAlive(pid)) {
    console.warn('did not exit on SIGTERM after 5s — sending SIGKILL')
    process.kill(pid, 'SIGKILL')
  }
  try { unlinkSync(PID_FILE) } catch {}
  console.log(`stopped (pid ${pid})`)
}

async function status() {
  const pid = readPid()
  if (!pid) {
    console.log('not running')
    return
  }
  if (!isAlive(pid)) {
    console.log(`stale pidfile (pid ${pid} dead)`)
    return
  }
  const port = process.env.PORT ?? '7842'
  let api = false
  try {
    const res = await fetch(`http://localhost:${port}/api/status`, {
      signal: AbortSignal.timeout(500),
    })
    api = res.ok
  } catch {}
  console.log(`running (pid ${pid})`)
  console.log(`port ${port}: ${api ? 'reachable' : 'unreachable'}`)
  console.log(`log:  ${LOG_FILE}`)
}

function logs(follow: boolean) {
  if (!existsSync(LOG_FILE)) {
    console.log('no log yet')
    return
  }
  if (follow) {
    spawn('tail', ['-f', '-n', '50', LOG_FILE], { stdio: 'inherit' })
  } else {
    const out = spawnSync('tail', ['-n', '50', LOG_FILE])
    process.stdout.write(out.stdout)
  }
}

const cmd = process.argv[2]
const flag = process.argv[3]
const hot = flag !== '--no-hot'

switch (cmd) {
  case 'start':
    await start({ hot })
    break
  case 'stop':
    await stop()
    break
  case 'restart':
    await stop()
    await start({ hot })
    break
  case 'status':
    await status()
    break
  case 'logs':
    logs(flag === '-f')
    break
  default:
    console.log('usage: bun scripts/daemon-ctl.ts <start|stop|restart|status|logs> [--no-hot|-f]')
    process.exit(1)
}
