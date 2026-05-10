import type { Action } from '../../../server/config'

type ProfileAction = Extract<Action, { type: 'profile' }>

type Props = {
  value: ProfileAction
  onChange: (a: Action) => void
  disabled: boolean
  profiles: string[]
}

export function ProfileForm({ value, onChange, disabled, profiles }: Props) {
  return (
    <>
      <div className="form-field">
        <label className="form-label">Label (optional)</label>
        <input
          type="text"
          className="form-input"
          placeholder="e.g. Switch to gaming"
          value={value.label ?? ''}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, label: e.target.value })}
        />
      </div>
      <div className="form-field">
        <label className="form-label">Profile</label>
        {profiles.length === 0 ? (
          <p className="noop-msg">No profiles available</p>
        ) : (
          <select
            className="form-select"
            value={value.profile}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, profile: e.target.value })}
          >
            {profiles.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        )}
      </div>
    </>
  )
}
