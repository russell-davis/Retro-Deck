import { useEffect, useRef, useState } from 'react'
import { useRenameProfile, useDeleteProfile } from '../queries/status'

type View = 'menu' | 'rename' | 'delete'

type Props = {
  name: string
  profiles: string[]
  onClose: () => void
}

function validateName(next: string, current: string, profiles: string[]): string | null {
  if (!next) return 'Name is required'
  if (next.includes('/')) return 'Name cannot contain slashes'
  if (next !== current && profiles.includes(next)) return 'Profile already exists'
  return null
}

export function ProfileMenu({ name, profiles, onClose }: Props) {
  const [view, setView] = useState<View>('menu')
  const [newName, setNewName] = useState(name)
  const rename = useRenameProfile()
  const del = useDeleteProfile()
  const renameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (view === 'menu') {
          onClose()
        } else {
          setView('menu')
          rename.reset()
          del.reset()
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [view, onClose, rename, del])

  useEffect(() => {
    if (view === 'rename') {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    }
  }, [view])

  const isOnly = profiles.length <= 1

  const trimmedName = newName.trim()
  const renameValidationError = validateName(trimmedName, name, profiles)

  function handleRename() {
    if (renameValidationError || trimmedName === name || rename.isPending) return
    rename.mutate({ from: name, to: trimmedName }, { onSuccess: onClose })
  }

  function handleDelete() {
    if (del.isPending) return
    del.mutate(name, { onSuccess: onClose })
  }

  if (view === 'rename') {
    return (
      <div className="profile-dropdown">
        <div className="profile-dropdown-body">
          <input
            ref={renameInputRef}
            type="text"
            className="form-input"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename()
            }}
            disabled={rename.isPending}
          />
          {trimmedName && trimmedName !== name && renameValidationError && (
            <div className="error-inline error-inline-sm">{renameValidationError}</div>
          )}
          {rename.isError && (
            <div className="error-inline error-inline-sm">
              {rename.error instanceof Error ? rename.error.message : 'Rename failed'}
            </div>
          )}
        </div>
        <div className="profile-dropdown-actions">
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => {
              setView('menu')
              rename.reset()
            }}
            disabled={rename.isPending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary btn-sm"
            onClick={handleRename}
            disabled={!trimmedName || !!renameValidationError || trimmedName === name || rename.isPending}
          >
            {rename.isPending ? 'Saving…' : 'Rename'}
          </button>
        </div>
      </div>
    )
  }

  if (view === 'delete') {
    return (
      <div className="profile-dropdown">
        <div className="profile-dropdown-body">
          <p className="profile-confirm-msg">
            Delete profile "{name}"? This cannot be undone.
          </p>
          {del.isError && (
            <div className="error-inline error-inline-sm">
              {del.error instanceof Error ? del.error.message : 'Delete failed'}
            </div>
          )}
        </div>
        <div className="profile-dropdown-actions">
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => {
              setView('menu')
              del.reset()
            }}
            disabled={del.isPending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-danger btn-sm"
            onClick={handleDelete}
            disabled={del.isPending}
          >
            {del.isPending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="profile-dropdown">
      <button
        type="button"
        className="profile-menu-item"
        onClick={() => {
          setNewName(name)
          setView('rename')
        }}
      >
        Rename
      </button>
      <button
        type="button"
        className="profile-menu-item profile-menu-item-danger"
        onClick={() => setView('delete')}
        disabled={isOnly}
        title={isOnly ? 'Cannot delete the only profile' : undefined}
      >
        Delete
      </button>
    </div>
  )
}
