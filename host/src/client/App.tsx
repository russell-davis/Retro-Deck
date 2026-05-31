import { useState } from 'react'
import { ProfileSwitcher } from './components/ProfileSwitcher'
import { ButtonGrid } from './components/ButtonGrid'
import { EventLog } from './components/EventLog'
import { Toasts } from './components/Toasts'
import { Diagnostics } from './components/Diagnostics'
import { useEventStream } from './queries/events'

type Tab = 'deck' | 'diagnostics'

export function App() {
  const { events, connected } = useEventStream()
  const [tab, setTab] = useState<Tab>('deck')

  return (
    <main>
      <header className="app-head">
        <div>
          <h1>Retro Deck</h1>
          <p className="subtitle">Host daemon · port 7842</p>
        </div>
        <ProfileSwitcher />
      </header>

      <div className="view-tabs">
        <button
          className={`pill${tab === 'deck' ? ' pill-active' : ''}`}
          onClick={() => setTab('deck')}
        >
          Deck
        </button>
        <button
          className={`pill${tab === 'diagnostics' ? ' pill-active' : ''}`}
          onClick={() => setTab('diagnostics')}
        >
          Diagnostics
        </button>
      </div>

      {tab === 'deck' ? (
        <>
          <ButtonGrid events={events} />
          <EventLog events={events} connected={connected} />
        </>
      ) : (
        <Diagnostics />
      )}

      <Toasts events={events} />
    </main>
  )
}
