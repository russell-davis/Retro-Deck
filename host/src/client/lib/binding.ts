import type { Action, ButtonBinding, Config } from '../../server/config'

export function normalizeBinding(raw: Action | ButtonBinding | undefined): ButtonBinding {
  if (!raw) return {}
  if (typeof raw === 'object' && 'type' in raw) return { press: raw }
  return raw
}

export function actionSummary(action: Action | undefined): string {
  if (!action) return '—'
  if (action.type === 'bash') return action.cmd
  if (action.type === 'keypress') return action.keys.join(' + ')
  if (action.type === 'profile') return `→ ${action.profile}`
  const t = action.type as string
  if (t === 'profile-cycle') {
    const profiles = (action as Record<string, unknown>).profiles as string[]
    if (profiles.length === 0) return '⟳ all profiles'
    return '⟳ ' + profiles.join(' · ')
  }
  return 'noop'
}

export function setBinding(
  config: Config,
  profileName: string,
  id: string,
  binding: ButtonBinding,
): Config {
  const profile = config.profiles[profileName]
  if (!profile) return config
  return {
    ...config,
    profiles: {
      ...config.profiles,
      [profileName]: {
        ...profile,
        buttons: {
          ...profile.buttons,
          [id]: binding,
        },
      },
    },
  }
}

export const BUTTON_IDS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const
export type ButtonId = (typeof BUTTON_IDS)[number]
