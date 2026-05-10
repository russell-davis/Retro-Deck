import { useStatus, useActivateProfile } from '../queries/status'

export function ProfileSwitcher() {
  const status = useStatus()
  const activate = useActivateProfile()

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
          return (
            <button
              key={name}
              type="button"
              className={`pill ${active ? 'pill-active' : ''}`}
              disabled={active || activate.isPending}
              onClick={() => activate.mutate(name)}
            >
              {name}
            </button>
          )
        })}
      </div>
      {activate.isError && <span className="error">switch failed</span>}
    </div>
  )
}
