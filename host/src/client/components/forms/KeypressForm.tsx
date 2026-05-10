import { useEffect, useState } from 'react'
import type { Action } from '../../../server/config'

type KeypressAction = Extract<Action, { type: 'keypress' }>

type Props = {
  value: KeypressAction
  onChange: (a: Action) => void
  disabled: boolean
}

function keysFromEvent(e: KeyboardEvent): string[] {
  const keys: string[] = []
  if (e.ctrlKey) keys.push('ctrl')
  if (e.shiftKey) keys.push('shift')
  if (e.altKey) keys.push('alt')
  if (e.metaKey) keys.push('super')

  const modifiers = ['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'NumLock', 'ScrollLock']
  if (!modifiers.includes(e.key)) {
    const keyMap: Record<string, string> = {
      ' ': 'space',
      Enter: 'enter',
      Escape: 'esc',
      Backspace: 'backspace',
      Delete: 'delete',
      Tab: 'tab',
      ArrowLeft: 'left',
      ArrowRight: 'right',
      ArrowUp: 'up',
      ArrowDown: 'down',
      Home: 'home',
      End: 'end',
      PageUp: 'pageup',
      PageDown: 'pagedown',
      F1: 'f1', F2: 'f2', F3: 'f3', F4: 'f4',
      F5: 'f5', F6: 'f6', F7: 'f7', F8: 'f8',
      F9: 'f9', F10: 'f10', F11: 'f11', F12: 'f12',
    }
    const mapped = keyMap[e.key] ?? e.key.toLowerCase()
    keys.push(mapped)
  }
  return keys
}

export function KeypressForm({ value, onChange, disabled }: Props) {
  const [capturing, setCapturing] = useState(false)

  useEffect(() => {
    if (!capturing || disabled) return

    const MODIFIER_KEYS = ['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'NumLock', 'ScrollLock']

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCapturing(false)
        return
      }
      // Wait for a non-modifier key to commit the full combo
      if (MODIFIER_KEYS.includes(e.key)) return
      e.preventDefault()
      const keys = keysFromEvent(e)
      if (keys.length > 0) {
        onChange({ ...value, keys })
        setCapturing(false)
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [capturing, disabled, value, onChange])

  useEffect(() => {
    if (disabled) setCapturing(false)
  }, [disabled])

  return (
    <>
      <div className="form-field">
        <label className="form-label">Label (optional)</label>
        <input
          type="text"
          className="form-input"
          placeholder="e.g. Reload browser"
          value={value.label ?? ''}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, label: e.target.value })}
        />
      </div>
      <div className="form-field">
        <label className="form-label">Key combo</label>
        <div className={`key-chips${capturing ? ' capturing' : ''}`}>
          {value.keys.length === 0 && !capturing && (
            <span className="key-empty">No keys set</span>
          )}
          {capturing && <span className="capture-hint">Press your key combo…</span>}
          {!capturing &&
            value.keys.map((k, i) => (
              <span key={i} className="key-chip">
                {k}
              </span>
            ))}
        </div>
        <div className="key-actions">
          <button
            type="button"
            className="btn-secondary btn-sm"
            disabled={disabled}
            onClick={() => setCapturing((c) => !c)}
          >
            {capturing ? 'Cancel capture' : 'Capture'}
          </button>
          {value.keys.length > 0 && !capturing && (
            <button
              type="button"
              className="btn-secondary btn-sm"
              disabled={disabled}
              onClick={() => onChange({ ...value, keys: [] })}
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </>
  )
}
