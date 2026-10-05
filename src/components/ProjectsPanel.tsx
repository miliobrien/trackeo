import { useState } from 'react'
import type { Entry, Project, Task } from '../db/schema'
import {
  entryDuration,
  formatDayName,
  formatDuration,
  formatShort,
  formatTimeOfDay,
  groupByDay,
  isSameDay,
  relativeDayWord,
  sumEntries,
} from '../lib/time'
import { Panel } from './Panel'

interface Props {
  projects: Project[]
  tasks: Task[]
  entries: Entry[]
  now: number
  /** Sends the date bar to a day, so a line in the history opens that day. */
  onPickDay: (day: number) => void
}

/**
 * Every project as a folder you can open: closed it answers how much, opened
 * it answers when. The day by day history is what the weekly panel cannot
 * show, and it is the only place a project's whole life is visible at once.
 */
export function ProjectsPanel({ projects, tasks, entries, now, onPickDay }: Props) {
  const [open, setOpen] = useState<string | null>(null)

  const folders = projects
    .map((project) => {
      const own = entries.filter((entry) => entry.projectId === project.id)
      return { project, own, total: sumEntries(own, now), days: groupByDay(own, now) }
    })
    .sort((a, b) => b.total - a.total)

  if (folders.length === 0) {
    return (
      <Panel title="Proyectos">
        <p className="px-4 py-8 text-sm text-graphite">
          Todavía no creaste ningún proyecto. El primero sale del campo de arriba.
        </p>
      </Panel>
    )
  }

  return (
    <Panel title="Proyectos" aside={<span className="text-xs text-graphite">{folders.length}</span>}>
      <ul className="divide-y divide-rule">
        {folders.map(({ project, total, days }) => {
          const expanded = open === project.id
          const last = days[0]?.day

          return (
            <li key={project.id}>
              <button
                onClick={() => setOpen(expanded ? null : project.id)}
                aria-expanded={expanded}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-paper"
              >
                <span
                  aria-hidden
                  className={`text-xs text-graphite transition-transform ${expanded ? 'rotate-90' : ''}`}
                >
                  ▸
                </span>
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: project.color }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {project.name}
                    {project.archived === 1 && (
                      <span className="ml-2 text-xs font-normal text-graphite">archivado</span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-graphite">
                    {days.length === 0
                      ? 'Sin tiempo medido'
                      : `${days.length} ${days.length === 1 ? 'día' : 'días'} · último ${
                          relativeDayWord(last, now)?.toLowerCase() ?? formatDayName(last, now)
                        }`}
                  </span>
                </span>
                <span className="num shrink-0 text-sm">{formatShort(total)}</span>
              </button>

              {expanded && days.length > 0 && (
                // Capped and scrollable: a project worked on for months would
                // otherwise push everything else off the screen.
                <ul className="max-h-80 overflow-y-auto border-t border-rule bg-paper">
                  {days.map(({ day, total: dayTotal, entries: ofDay }) => (
                    <li key={day} className="border-b border-rule last:border-b-0 px-4 py-2.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <button
                          onClick={() => onPickDay(day)}
                          title="Ver ese día arriba"
                          className="truncate text-xs font-medium underline-offset-4 hover:underline"
                        >
                          {isSameDay(day, now) ? 'Hoy' : formatDayName(day, now)}
                        </button>
                        <span className="num shrink-0 text-xs">{formatShort(dayTotal)}</span>
                      </div>
                      <ul className="mt-1 space-y-0.5">
                        {ofDay.map((entry) => (
                          <li key={entry.id} className="flex items-baseline justify-between gap-3">
                            <span className="truncate text-xs text-graphite">
                              {tasks.find((t) => t.id === entry.taskId)?.name ?? 'Tarea borrada'}
                            </span>
                            <span className="num shrink-0 text-[11px] text-graphite">
                              {formatTimeOfDay(entry.startedAt)}–
                              {entry.endedAt === null ? 'ahora' : formatTimeOfDay(entry.endedAt)}
                              <span className="ml-2 text-ink">
                                {formatDuration(entryDuration(entry, now))}
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}
