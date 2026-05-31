import type { Action } from './config'
import { setActiveProfile, getConfig } from './config'
import { lookupToken } from './keymap'
import { emitChord } from './keyboard'
import { emit } from './events'

export async function dispatch(action: Action, buttonId: number, slot: 'press' | 'hold') {
  switch (action.type) {
    case 'bash': {
      const t0 = performance.now()
      console.log(`[dispatch] btn${buttonId} bash: ${action.cmd}`)
      const child = Bun.spawn(['bash', '-c', action.cmd], { stdout: 'pipe', stderr: 'pipe' })

      new Response(child.stdout).text().then(out => {
        if (out.trim()) console.log(`[dispatch] btn${buttonId} bash stdout:\n${out.trim()}`)
      }).catch(() => {})

      const [exitRaw, stderrRaw] = await Promise.all([
        child.exited,
        new Response(child.stderr).text(),
      ])
      const exitCode = typeof exitRaw === 'number' ? exitRaw : -1
      const ok = exitCode === 0
      const stderrTail = stderrRaw.slice(-200)

      emit({
        type: 'action.result',
        buttonId,
        slot,
        action: 'bash',
        ok,
        label: action.label,
        durationMs: Math.round(performance.now() - t0),
        exitCode,
        stderrTail: !ok && stderrTail ? stderrTail : undefined,
      })
      break
    }

    case 'keypress': {
      const t0 = performance.now()
      const codes: number[] = []
      const unknownTokens: string[] = []

      for (const token of action.keys) {
        const code = lookupToken(token)
        if (code === undefined) {
          console.error(`[dispatch] btn${buttonId} keypress: unknown token "${token}" — skipping`)
          unknownTokens.push(token)
        } else {
          codes.push(code)
        }
      }

      if (unknownTokens.length > 0 || codes.length === 0) {
        const message =
          unknownTokens.length > 0
            ? `unknown token${unknownTokens.length > 1 ? 's' : ''}: ${unknownTokens.map(t => `'${t}'`).join(', ')}`
            : 'no valid key tokens'
        emit({
          type: 'action.result',
          buttonId,
          slot,
          action: 'keypress',
          ok: false,
          label: action.label,
          durationMs: Math.round(performance.now() - t0),
          message,
        })
        break
      }

      // Single atomic ydotool invocation: press + release happen in one process
      // so a modifier can never be left stuck "down" between two processes.
      const res = await emitChord(codes)
      const keysStr = action.keys.map(k => k.toLowerCase()).join('+')
      console.log(`[dispatch] btn${buttonId} keypress: ${keysStr} (exit ${res.exitCode})`)

      if (!res.ok) {
        console.error(
          `[dispatch] btn${buttonId} keypress: ydotool failed (exit ${res.exitCode}): ${res.stderr.trim()}`,
        )
        emit({
          type: 'action.result',
          buttonId,
          slot,
          action: 'keypress',
          ok: false,
          label: action.label,
          durationMs: Math.round(performance.now() - t0),
          exitCode: res.exitCode,
          stderrTail: res.stderr || undefined,
          message: `ydotool failed (exit ${res.exitCode})`,
        })
        break
      }

      emit({
        type: 'action.result',
        buttonId,
        slot,
        action: 'keypress',
        ok: true,
        label: action.label,
        durationMs: Math.round(performance.now() - t0),
        exitCode: 0,
        message: `emitted ${keysStr}`,
      })
      break
    }

    case 'profile': {
      const t0 = performance.now()
      if (getConfig().profiles[action.profile]) {
        console.log(`[dispatch] btn${buttonId} switch profile -> ${action.profile}`)
        setActiveProfile(action.profile)
        emit({
          type: 'action.result',
          buttonId,
          slot,
          action: 'profile',
          ok: true,
          label: action.label,
          durationMs: Math.round(performance.now() - t0),
          message: `switched -> ${action.profile}`,
        })
      } else {
        console.warn(`[dispatch] btn${buttonId} unknown profile: ${action.profile}`)
        emit({
          type: 'action.result',
          buttonId,
          slot,
          action: 'profile',
          ok: false,
          label: action.label,
          durationMs: Math.round(performance.now() - t0),
          message: `unknown profile: ${action.profile}`,
        })
      }
      break
    }

    case 'noop': {
      const t0 = performance.now()
      emit({
        type: 'action.result',
        buttonId,
        slot,
        action: 'noop',
        ok: true,
        label: action.label,
        durationMs: Math.round(performance.now() - t0),
      })
      break
    }

    case 'profile-cycle': {
      const t0 = performance.now()
      const cfg = getConfig()
      const fromProfile = cfg.activeProfile

      // Resolve profiles: use provided list or all profiles in config order
      const allProfiles = Object.keys(cfg.profiles)
      const resolved = action.profiles.length > 0 ? action.profiles : allProfiles

      // Filter to only profiles that actually exist
      const valid = resolved.filter(p => p in cfg.profiles)

      if (valid.length < 2) {
        console.warn(`[dispatch] btn${buttonId} profile-cycle: needs ≥2 valid profiles, got ${valid.length}`)
        emit({
          type: 'action.result',
          buttonId,
          slot,
          action: 'profile-cycle',
          ok: false,
          label: action.label,
          durationMs: Math.round(performance.now() - t0),
          message: 'cycle needs ≥2 profiles',
        })
        break
      }

      // Find current profile index in valid list
      const i = valid.indexOf(fromProfile)
      const next = valid[(i + 1) % valid.length]

      console.log(`[dispatch] btn${buttonId} profile-cycle: ${fromProfile} → ${next}`)
      setActiveProfile(next)

      emit({
        type: 'action.result',
        buttonId,
        slot,
        action: 'profile-cycle',
        ok: true,
        label: action.label,
        durationMs: Math.round(performance.now() - t0),
        message: `${fromProfile} → ${next}`,
      })
      break
    }
  }
}
