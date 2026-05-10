import type { Action } from './config'
import { setActiveProfile, getConfig } from './config'
import { lookupToken, isModifier } from './keymap'

export async function dispatch(action: Action, buttonId: number) {
  switch (action.type) {
    case 'bash':
      console.log(`[dispatch] btn${buttonId} bash: ${action.cmd}`)
      Bun.spawn(['bash', '-c', action.cmd], { stdout: 'inherit', stderr: 'inherit' })
      break

    case 'keypress': {
      const codes: number[] = []
      let hasError = false
      for (const token of action.keys) {
        const code = lookupToken(token)
        if (code === undefined) {
          console.error(`[dispatch] btn${buttonId} keypress: unknown token "${token}" — skipping`)
          hasError = true
        } else {
          codes.push(code)
        }
      }
      if (hasError || codes.length === 0) break

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
      const pressExit = await pressProc.exited
      if (pressExit !== 0) {
        const stderr = await new Response(pressProc.stderr).text()
        console.error(
          `[dispatch] btn${buttonId} keypress: ydotool press failed (exit ${pressExit}): ${stderr.trim()}`,
        )
        break
      }

      await new Promise<void>(resolve => setTimeout(resolve, 30))

      const releaseProc = Bun.spawn(['ydotool', 'key', ...releaseArgs], {
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const releaseExit = await releaseProc.exited
      if (releaseExit !== 0) {
        const stderr = await new Response(releaseProc.stderr).text()
        console.error(
          `[dispatch] btn${buttonId} keypress: ydotool release failed (exit ${releaseExit}): ${stderr.trim()}`,
        )
      }
      break
    }

    case 'profile':
      if (getConfig().profiles[action.profile]) {
        console.log(`[dispatch] btn${buttonId} switch profile -> ${action.profile}`)
        setActiveProfile(action.profile)
      } else {
        console.warn(`[dispatch] btn${buttonId} unknown profile: ${action.profile}`)
      }
      break

    case 'noop':
      break
  }
}
