import type { Action } from '../../../server/config'

type BashAction = Extract<Action, { type: 'bash' }>

type Props = {
  value: BashAction
  onChange: (a: Action) => void
  disabled: boolean
}

export function BashForm({ value, onChange, disabled }: Props) {
  return (
    <>
      <div className="form-field">
        <label className="form-label">Label (optional)</label>
        <input
          type="text"
          className="form-input"
          placeholder="e.g. Open terminal"
          value={value.label ?? ''}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, label: e.target.value })}
        />
      </div>
      <div className="form-field">
        <label className="form-label">Command</label>
        <textarea
          className="form-textarea"
          placeholder="e.g. notify-send 'hello'"
          value={value.cmd}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, cmd: e.target.value })}
        />
      </div>
    </>
  )
}
