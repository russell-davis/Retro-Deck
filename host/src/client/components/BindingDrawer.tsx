import { useEffect, useState } from 'react'
import { useSaveBinding } from '../queries/config'
import { BashForm } from './forms/BashForm'
import { KeypressForm } from './forms/KeypressForm'
import { ProfileForm } from './forms/ProfileForm'
import { NoopForm } from './forms/NoopForm'
import type { Action, ButtonBinding, Config } from '../../server/config'

type ActionType = Action['type']

type Props = {
  buttonId: string
  binding: ButtonBinding
  config: Config
  profileName: string
  onClose: () => void
}

const TABS: { type: ActionType; label: string }[] = [
  { type: 'bash', label: 'Bash' },
  { type: 'keypress', label: 'Keypress' },
  { type: 'profile', label: 'Profile' },
  { type: 'noop', label: 'Noop' },
]

function defaultAction(type: ActionType, profiles: string[]): Action {
  if (type === 'bash') return { type: 'bash', cmd: '' }
  if (type === 'keypress') return { type: 'keypress', keys: [] }
  if (type === 'profile') return { type: 'profile', profile: profiles[0] ?? '' }
  return { type: 'noop' }
}

function isValid(action: Action): boolean {
  if (action.type === 'bash') return action.cmd.trim().length > 0
  if (action.type === 'keypress') return action.keys.length > 0
  if (action.type === 'profile') return action.profile.length > 0
  return true
}

function prepareAction(action: Action): Action {
  const label = action.label?.trim() || undefined
  if (action.type === 'bash') {
    return label ? { type: 'bash', label, cmd: action.cmd } : { type: 'bash', cmd: action.cmd }
  }
  if (action.type === 'keypress') {
    return label
      ? { type: 'keypress', label, keys: action.keys }
      : { type: 'keypress', keys: action.keys }
  }
  if (action.type === 'profile') {
    return label
      ? { type: 'profile', label, profile: action.profile }
      : { type: 'profile', profile: action.profile }
  }
  return label ? { type: 'noop', label } : { type: 'noop' }
}

export function BindingDrawer({ buttonId, binding, config, profileName, onClose }: Props) {
  const profiles = Object.keys(config.profiles)
  const initialType: ActionType = binding.press?.type ?? 'bash'
  const initialAction: Action = binding.press ?? defaultAction(initialType, profiles)

  const [actionType, setActionType] = useState<ActionType>(initialType)
  const [action, setAction] = useState<Action>(initialAction)
  const save = useSaveBinding()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  function handleTabChange(type: ActionType) {
    setActionType(type)
    setAction(defaultAction(type, profiles))
  }

  function handleSave() {
    const newBinding: ButtonBinding = {
      ...binding,
      press: prepareAction(action),
    }
    save.mutate({ config, profileName, id: buttonId, binding: newBinding }, { onSuccess: onClose })
  }

  const valid = isValid(action)
  const isPending = save.isPending

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <span className="drawer-title">Edit Button #{buttonId}</span>
          <button type="button" className="drawer-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="drawer-body">
          <div className="type-tabs" role="tablist">
            {TABS.map((tab) => (
              <button
                key={tab.type}
                type="button"
                role="tab"
                aria-selected={actionType === tab.type}
                className={`type-tab${actionType === tab.type ? ' tab-active' : ''}`}
                disabled={isPending}
                onClick={() => handleTabChange(tab.type)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {actionType === 'bash' && (
            <BashForm
              value={action as Extract<Action, { type: 'bash' }>}
              onChange={setAction}
              disabled={isPending}
            />
          )}
          {actionType === 'keypress' && (
            <KeypressForm
              value={action as Extract<Action, { type: 'keypress' }>}
              onChange={setAction}
              disabled={isPending}
            />
          )}
          {actionType === 'profile' && (
            <ProfileForm
              value={action as Extract<Action, { type: 'profile' }>}
              onChange={setAction}
              disabled={isPending}
              profiles={profiles}
            />
          )}
          {actionType === 'noop' && (
            <NoopForm
              value={action as Extract<Action, { type: 'noop' }>}
              onChange={setAction}
              disabled={isPending}
            />
          )}

          {save.isError && (
            <div className="error-inline">
              {save.error instanceof Error ? save.error.message : 'Save failed'}
            </div>
          )}
        </div>

        <div className="drawer-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={isPending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSave}
            disabled={!valid || isPending}
          >
            {isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
