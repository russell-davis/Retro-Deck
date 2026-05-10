import type { Action } from '../../../server/config'

type NoopAction = Extract<Action, { type: 'noop' }>

type Props = {
  value: NoopAction
  onChange: (a: Action) => void
  disabled: boolean
}

export function NoopForm({ value, onChange, disabled }: Props) {
  return (
    <>
      <div className="form-field">
        <label className="form-label">Label (optional)</label>
        <input
          type="text"
          className="form-input"
          placeholder="e.g. Reserved"
          value={value.label ?? ''}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, label: e.target.value })}
        />
      </div>
      <p className="noop-msg">This button does nothing when pressed.</p>
    </>
  )
}
