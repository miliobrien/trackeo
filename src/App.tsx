import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { listEntries, listProjects, listTasks } from './db/repo'
import { dayBounds, entryDuration, formatDuration, startedOn, sumEntries } from './lib/time'
import { requestPersistentStorage } from './lib/storage'
import { useNow } from './hooks/useNow'
import { useSync } from './sync/useSync'
import { AccountBar } from './components/AccountBar'
import { DayNav } from './components/DayNav'
import { BackupControls } from './components/BackupControls'
import { DayRibbon } from './components/DayRibbon'
import { EntryList } from './components/EntryList'
import { ProjectTotals } from './components/ProjectTotals'
import { ProjectsPanel } from './components/ProjectsPanel'
import { TimerBar } from './components/TimerBar'
import dotLogo from './assets/dot-logo.svg'

export default function App() {
  const projects = useLiveQuery(listProjects, [], [])
  const tasks = useLiveQuery(listTasks, [], [])
  const entries = useLiveQuery(listEntries, [], [])
  const sync = useSync()

  const running = entries.find((entry) => entry.running === 1)
  const now = useNow()

  // Null means "whatever day it is right now", so an app left open overnight
  // rolls into the new day on its own instead of stranding you on yesterday.
  // Navigating pins a day; Volver a hoy releases it.
  const [pinnedDay, setPinnedDay] = useState<number | null>(null)
  const day = pinnedDay ?? dayBounds(now).start

  const visible = entries.filter((entry) => startedOn(entry, day))

  // Mirror the running clock in the tab title, so it is readable from another
  // window without switching to this one.
  useEffect(() => {
    document.title = running ? `${formatDuration(entryDuration(running, now))} · Trackeo` : 'Trackeo'
  }, [running, now])

  // Asks the browser not to evict this history when the disk runs low.
  useEffect(() => {
    void requestPersistentStorage()
  }, [])

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="flex items-center gap-3">
          <img src={dotLogo} alt="DOT" className="h-5 w-auto" />
          <span aria-hidden className="h-4 w-px bg-rule" />
          <h1 className="text-sm font-semibold tracking-[0.14em] uppercase">Trackeo</h1>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <AccountBar
            status={sync.status}
            error={sync.error}
            email={sync.email}
            signIn={sync.signIn}
            signOut={sync.signOut}
          />
          <BackupControls />
        </div>
      </header>

      <TimerBar projects={projects} tasks={tasks} running={running} now={now} />

      <div className="mt-8">
        <DayNav
          day={day}
          now={now}
          total={sumEntries(visible, now)}
          onChange={setPinnedDay}
          onToday={() => setPinnedDay(null)}
        />
        <DayRibbon entries={visible} projects={projects} tasks={tasks} day={day} now={now} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <EntryList entries={visible} projects={projects} tasks={tasks} day={day} now={now} />
        <ProjectTotals entries={entries} projects={projects} day={day} now={now} />
      </div>

      <div className="mt-6">
        <ProjectsPanel
          projects={projects}
          tasks={tasks}
          entries={entries}
          now={now}
          onPickDay={setPinnedDay}
        />
      </div>
    </div>
  )
}
