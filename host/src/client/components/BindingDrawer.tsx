import { useEffect, useState } from 'react'
import { useSaveBinding } from '../queries/config'
import { BashForm } from './forms/BashForm'
import { KeypressForm } from './forms/KeypressForm'
import { ProfileForm } from './forms/ProfileForm'
import { NoopForm } from './forms/NoopForm'
import { CycleForm } from './forms/CycleForm'
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
  { type: 'profile-cycle', label: 'Cycle' },
]

function defaultAction(type: ActionType, profiles: string[]): Action {
  if (type === 'bash') return { type: 'bash', cmd: '' }
  if (type === 'keypress') return { type: 'keypress', keys: [] }
  if (type === 'profile') return { type: 'profile', profile: profiles[0] ?? '' }
  if (type === 'profile-cycle') return { type: 'profile-cycle', profiles: [] }
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
  if (action.type === 'profile-cycle') {
    return label
      ? { type: 'profile-cycle', label, profiles: action.profiles }
      : { type: 'profile-cycle', profiles: action.profiles }
  }
  return label ? { type: 'noop', label } : { type: 'noop' }
}

export function BindingDrawer({ buttonId, binding, config, profileName, onClose }: Props) {
  const profiles = Object.keys(config.profiles)

  const initialPressAction: Action = (binding.press as Action) ?? defaultAction('bash', profiles)
  const initialHoldAction: Action = (binding.hold as Action) ?? defaultAction('noop', profiles)

  const [slot, setSlot] = useState<'press' | 'hold'>('press')
  const [slotActions, setSlotActions] = useState<{ press: Action; hold: Action }>({
    press: initialPressAction,
    hold: initialHoldAction,
  })
  const save = useSaveBinding()

  const action = slotActions[slot]
  const actionType: ActionType = action.type as ActionType

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  function handleSlotChange(s: 'press' | 'hold') {
    setSlot(s)
  }

  function handleTabChange(type: ActionType) {
    setSlotActions((prev) => ({ ...prev, [slot]: defaultAction(type, profiles) }))
  }

  function handleActionChange(a: Action) {
    setSlotActions((prev) => ({ ...prev, [slot]: a as Action }))
  }

  function handleSave() {
    const newBinding: ButtonBinding = {
      ...binding,
      press: prepareAction(slotActions.press),
      hold: prepareAction(slotActions.hold),
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
          <div className="slot-toggle-row">
            <div className="slot-toggle" role="tablist" aria-label="Binding slot">
              {(['press', 'hold'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="tab"
                  aria-selected={slot === s}
                  className={`slot-tab${slot === s ? ' slot-tab-active' : ''}`}
                  disabled={isPending}
                  onClick={() => handleSlotChange(s)}
                >
                  {s === 'press' ? 'Press' : 'Hold'}
                </button>
              ))}
            </div>
            <span className="slot-hint" title="Hold = action fires after holding the button (threshold TBD)">
              ?
            </span>
          </div>

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
              onChange={handleActionChange}
              disabled={isPending}
            />
          )}
          {actionType === 'keypress' && (
            <KeypressForm
              value={action as Extract<Action, { type: 'keypress' }>}
              onChange={handleActionChange}
              disabled={isPending}
            />
          )}
          {actionType === 'profile' && (
            <ProfileForm
              value={action as Extract<Action, { type: 'profile' }>}
              onChange={handleActionChange}
              disabled={isPending}
              profiles={profiles}
            />
          )}
          {actionType === 'noop' && (
            <NoopForm
              value={action as Extract<Action, { type: 'noop' }>}
              onChange={handleActionChange}
              disabled={isPending}
            />
          )}
          {actionType === 'profile-cycle' && (
            <CycleForm
              value={action as Extract<Action, { type: 'profile-cycle' }>}
              onChange={handleActionChange}
              disabled={isPending}
              profiles={profiles}
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
