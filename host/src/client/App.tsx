import { ProfileSwitcher } from './components/ProfileSwitcher'
import { ButtonGrid } from './components/ButtonGrid'
import { EventLog } from './components/EventLog'
import { useEventStream } from './queries/events'

export function App() {
  const { events, connected } = useEventStream()

  return (
    <main>
      <header className="app-head">
        <div>
          <h1>Retro Deck</h1>
          <p className="subtitle">Host daemon · port 7842</p>
        </div>
        <ProfileSwitcher />
      </header>

      <ButtonGrid events={events} />

      <EventLog events={events} connected={connected} />
    </main>
  )
}
