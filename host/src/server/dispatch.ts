import type { Action } from './config'
import { setActiveProfile, getConfig } from './config'

export async function dispatch(action: Action, buttonId: number) {
  switch (action.type) {
    case 'bash':
      console.log(`[dispatch] btn${buttonId} bash: ${action.cmd}`)
      Bun.spawn(['bash', '-c', action.cmd], { stdout: 'inherit', stderr: 'inherit' })
      break

    case 'keypress':
      console.log(
        `[dispatch] btn${buttonId} keypress: ${action.keys.join('+')} (not yet implemented)`,
      )
      break

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
