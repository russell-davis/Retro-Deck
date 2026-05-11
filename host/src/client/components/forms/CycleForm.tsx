import type { Action } from '../../../server/config'

type ProfileCycleAction = Extract<Action, { type: 'profile-cycle' }>

type Props = {
  value: ProfileCycleAction
  onChange: (a: Action) => void
  disabled: boolean
  profiles: string[]
}

export function CycleForm({ value, onChange, disabled, profiles }: Props) {
  const remaining = profiles.filter((p) => !value.profiles.includes(p))

  function removeProfile(index: number) {
    const next = value.profiles.filter((_, i) => i !== index)
    onChange({ ...value, profiles: next } as Action)
  }

  function addProfile(name: string) {
    if (!name) return
    const next = [...value.profiles, name]
    onChange({ ...value, profiles: next } as Action)
  }

  function clearAll() {
    onChange({ ...value, profiles: [] } as Action)
  }

  return (
    <>
      <div className="form-field">
        <label className="form-label">Label (optional)</label>
        <input
          type="text"
          className="form-input"
          placeholder="e.g. Next profile"
          value={value.label ?? ''}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, label: e.target.value } as Action)}
        />
      </div>
      <div className="form-field">
        <label className="form-label">
          Profiles in cycle{' '}
          <span className="form-hint">(empty = all profiles in config order)</span>
        </label>
        <div className="cycle-chips">
          {value.profiles.length === 0 && (
            <span className="cycle-empty">All profiles in config order</span>
          )}
          {value.profiles.map((p, i) => (
            <span key={i} className="cycle-chip">
              {p}
              <button
                type="button"
                className="cycle-chip-remove"
                disabled={disabled}
                onClick={() => removeProfile(i)}
                aria-label={`Remove ${p}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        {remaining.length > 0 && (
          <div className="cycle-add-row">
            <span className="cycle-add-label">Add profile:</span>
            <select
              className="form-select cycle-add-select"
              value=""
              disabled={disabled}
              onChange={(e) => {
                const name = e.target.value
                if (name) {
                  addProfile(name)
                  e.target.value = ''
                }
              }}
            >
              <option value="">select…</option>
              {remaining.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="cycle-actions">
          <button
            type="button"
            className="btn-secondary btn-sm"
            disabled={disabled || value.profiles.length === 0}
            onClick={clearAll}
          >
            Clear all
          </button>
        </div>
      </div>
    </>
  )
}
