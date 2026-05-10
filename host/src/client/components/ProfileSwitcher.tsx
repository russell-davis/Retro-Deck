import { useEffect, useRef, useState } from 'react'
import { useStatus, useActivateProfile } from '../queries/status'
import { ProfileMenu } from './ProfileMenu'
import { NewProfileModal } from './NewProfileModal'

export function ProfileSwitcher() {
  const status = useStatus()
  const activate = useActivateProfile()
  const [menuOpen, setMenuOpen] = useState(false)
  const [newModalOpen, setNewModalOpen] = useState(false)
  const kebabWrapRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (kebabWrapRef.current && !kebabWrapRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  if (status.isLoading) return <div className="profile-row muted">Loading profiles…</div>
  if (status.isError || !status.data)
    return <div className="profile-row error">Daemon unreachable</div>

  const { activeProfile, profiles } = status.data

  return (
    <div className="profile-row">
      <span className="profile-label">Profile</span>
      <div className="profile-pills">
        {profiles.map((name) => {
          const active = name === activeProfile
          if (active) {
            return (
              <span key={name} className="pill-wrapper">
                <button
                  type="button"
                  className="pill pill-active"
                  disabled
                >
                  {name}
                </button>
                <span className="pill-kebab-wrap" ref={kebabWrapRef}>
                  <button
                    type="button"
                    className="pill-kebab"
                    onClick={() => setMenuOpen((v) => !v)}
                    aria-label="Profile options"
                    aria-expanded={menuOpen}
                  >
                    ⋯
                  </button>
                  {menuOpen && (
                    <ProfileMenu
                      name={name}
                      profiles={profiles}
                      onClose={() => setMenuOpen(false)}
                    />
                  )}
                </span>
              </span>
            )
          }
          return (
            <button
              key={name}
              type="button"
              className="pill"
              disabled={activate.isPending}
              onClick={() => activate.mutate(name)}
            >
              {name}
            </button>
          )
        })}
        <button
          type="button"
          className="pill pill-add"
          onClick={() => setNewModalOpen(true)}
          disabled={activate.isPending}
          aria-label="Add profile"
        >
          +
        </button>
      </div>
      {activate.isError && <span className="error">switch failed</span>}
      {newModalOpen && (
        <NewProfileModal profiles={profiles} onClose={() => setNewModalOpen(false)} />
      )}
    </div>
  )
}
