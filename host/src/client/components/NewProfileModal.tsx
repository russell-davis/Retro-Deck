import { useEffect, useRef, useState } from 'react'
import { useCreateProfile } from '../queries/status'

type Props = {
  profiles: string[]
  onClose: () => void
}

function validate(name: string, profiles: string[]): string | null {
  if (!name) return 'Name is required'
  if (name.includes('/')) return 'Name cannot contain slashes'
  if (profiles.includes(name)) return 'Profile already exists'
  return null
}

export function NewProfileModal({ profiles, onClose }: Props) {
  const [name, setName] = useState('')
  const create = useCreateProfile()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const trimmed = name.trim()
  const validationError = validate(trimmed, profiles)

  function handleCreate() {
    if (validationError || create.isPending) return
    create.mutate(trimmed, { onSuccess: onClose })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">New Profile</span>
          <button type="button" className="drawer-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="form-field">
            <label className="form-label">Profile name</label>
            <input
              ref={inputRef}
              type="text"
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
              }}
              disabled={create.isPending}
              placeholder="e.g. gaming"
            />
          </div>
          {trimmed && validationError && (
            <div className="error-inline">{validationError}</div>
          )}
          {create.isError && (
            <div className="error-inline">
              {create.error instanceof Error ? create.error.message : 'Create failed'}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={onClose}
            disabled={create.isPending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary btn-sm"
            onClick={handleCreate}
            disabled={!trimmed || !!validationError || create.isPending}
          >
            {create.isPending ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
