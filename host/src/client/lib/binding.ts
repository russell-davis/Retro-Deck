import type { Action, ButtonBinding } from '../../server/config'

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
  return 'noop'
}

export const BUTTON_IDS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const
export type ButtonId = (typeof BUTTON_IDS)[number]
