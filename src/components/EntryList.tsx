import type { Entry, Project, Task } from '../db/schema'
import { formatDayName, isSameDay } from '../lib/time'
import { EntryRow } from './EntryRow'
import { Panel } from './Panel'

interface Props {
  entries: Entry[]
  projects: Project[]
  tasks: Task[]
  day: number
  now: number
}

export function EntryList({ entries, projects, tasks, day, now }: Props) {
  const ordered = [...entries].sort((a, b) => b.startedAt - a.startedAt)
  const viewingToday = isSameDay(day, now)
  const title = viewingToday ? 'Hoy' : formatDayName(day, now)

  if (ordered.length === 0) {
    return (
      <Panel title={title}>
        <p className="px-4 py-8 text-sm text-graphite">
          {viewingToday
            ? 'Escribí una tarea arriba y apretá Empezar. Lo que midas va a aparecer acá.'
            : 'Este día no quedó registrado. Podés mirar otro con las flechas de arriba.'}
        </p>
      </Panel>
    )
  }

  return (
    <Panel title={title}>
      <ul className="divide-y divide-rule">
        {ordered.map((entry) => (
          <EntryRow
            key={entry.id}
            entry={entry}
            project={projects.find((p) => p.id === entry.projectId)}
            task={tasks.find((t) => t.id === entry.taskId)}
            others={ordered.filter((other) => other.id !== entry.id)}
            tasks={tasks}
            now={now}
          />
        ))}
      </ul>
      <p className="border-t border-rule px-4 py-2.5 text-xs text-graphite">
        Tocá un horario para corregirlo.
      </p>
    </Panel>
  )
}
