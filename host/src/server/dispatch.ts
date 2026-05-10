import type { Action } from './config'
import { setActiveProfile, getConfig } from './config'
import { lookupToken, isModifier } from './keymap'
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

      const modifiers = codes.filter(c => isModifier(c))
      const nonModifiers = codes.filter(c => !isModifier(c))
      const ordered = [...modifiers, ...nonModifiers]

      const pressArgs = ordered.map(c => `${c}:1`)
      const releaseArgs = [...ordered].reverse().map(c => `${c}:0`)

      console.log(
        `[dispatch] btn${buttonId} keypress: ydotool key ${[...pressArgs, ...releaseArgs].join(' ')}`,
      )

      const pressProc = Bun.spawn(['ydotool', 'key', ...pressArgs], {
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const [pressExitRaw, pressStderr] = await Promise.all([
        pressProc.exited,
        new Response(pressProc.stderr).text(),
      ])
      const pressExit = typeof pressExitRaw === 'number' ? pressExitRaw : -1

      if (pressExit !== 0) {
        const stderrTail = pressStderr.slice(-200)
        console.error(
          `[dispatch] btn${buttonId} keypress: ydotool press failed (exit ${pressExit}): ${stderrTail.trim()}`,
        )
        emit({
          type: 'action.result',
          buttonId,
          slot,
          action: 'keypress',
          ok: false,
          label: action.label,
          durationMs: Math.round(performance.now() - t0),
          exitCode: pressExit,
          stderrTail: stderrTail || undefined,
          message: `ydotool press failed (exit ${pressExit})`,
        })
        break
      }

      await new Promise<void>(resolve => setTimeout(resolve, 30))

      const releaseProc = Bun.spawn(['ydotool', 'key', ...releaseArgs], {
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const [releaseExitRaw, releaseStderr] = await Promise.all([
        releaseProc.exited,
        new Response(releaseProc.stderr).text(),
      ])
      const releaseExit = typeof releaseExitRaw === 'number' ? releaseExitRaw : -1

      if (releaseExit !== 0) {
        const stderrTail = releaseStderr.slice(-200)
        console.error(
          `[dispatch] btn${buttonId} keypress: ydotool release failed (exit ${releaseExit}): ${stderrTail.trim()}`,
        )
        emit({
          type: 'action.result',
          buttonId,
          slot,
          action: 'keypress',
          ok: false,
          label: action.label,
          durationMs: Math.round(performance.now() - t0),
          exitCode: releaseExit,
          stderrTail: stderrTail || undefined,
          message: `ydotool release failed (exit ${releaseExit})`,
        })
        break
      }

      const keysStr = action.keys.map(k => k.toLowerCase()).join('+')
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
  }
}
