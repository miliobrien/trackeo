import { useState } from 'react'
import type { Entry, Project } from '../db/schema'
import {
  entryDuration,
  formatShort,
  formatWeekRange,
  startedInWeek,
  weekBounds,
  weekdayIndex,
} from '../lib/time'
import { Panel } from './Panel'

interface Props {
  entries: Entry[]
  projects: Project[]
  /** The day chosen in the date bar; the week shown is the one it falls in. */
  day: number
  now: number
}

type Period = 'week' | 'all'

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

/**
 * How long each project has taken, per week by default.
 *
 * An all-time total grows forever and stops meaning anything; a week is a unit
 * you can act on. The week shown is the one the date bar is on, so it starts
 * empty every Monday without anything being erased, and older weeks are one
 * arrow away. Nothing is ever reset in the data: "Histórico" keeps the total.
 */
export function ProjectTotals({ entries, projects, day, now }: Props) {
  const [period, setPeriod] = useState<Period>('week')

  const inPeriod = period === 'week' ? entries.filter((e) => startedInWeek(e, day)) : entries
  const byProject = new Map<string, { total: number; days: number[] }>()
  for (const entry of inPeriod) {
    const row = byProject.get(entry.projectId) ?? { total: 0, days: [0, 0, 0, 0, 0, 0, 0] }
    const spent = entryDuration(entry, now)
    row.total += spent
    row.days[weekdayIndex(entry.startedAt)] += spent
    byProject.set(entry.projectId, row)
  }

  const rows = projects
    .map((project) => ({ project, ...(byProject.get(project.id) ?? { total: 0, days: [] }) }))
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total)

  const grand = rows.reduce((sum, row) => sum + row.total, 0)
  const largest = rows[0]?.total ?? 1
  const busiestDay = Math.max(1, ...rows.flatMap((row) => row.days))

  const { start } = weekBounds(day)
  const thisWeek = start === weekBounds(now).start
  const todayIndex = thisWeek ? weekdayIndex(now) : -1

  const tabs = (
    <div className="flex items-center gap-3">
      <div className="flex rounded-md border border-rule p-0.5 text-[11px]" role="tablist">
        {(['week', 'all'] as const).map((option) => (
          <button
            key={option}
            role="tab"
            aria-selected={period === option}
            onClick={() => setPeriod(option)}
            className={`rounded px-2 py-0.5 ${
              period === option ? 'bg-ink text-paper' : 'text-graphite hover:text-ink'
            }`}
          >
            {option === 'week' ? 'Semana' : 'Histórico'}
          </button>
        ))}
      </div>
      {rows.length > 0 && <span className="num text-sm">{formatShort(grand)}</span>}
    </div>
  )

  return (
    <Panel title="Por proyecto" aside={tabs}>
      <p className="border-b border-rule px-4 py-2 text-xs text-graphite">
        {period === 'week'
          ? `${thisWeek ? 'Esta semana' : 'Semana'} · ${formatWeekRange(day, now)}`
          : 'Todo lo registrado desde el primer día'}
      </p>

      {rows.length === 0 ? (
        <p className="px-4 py-8 text-sm text-graphite">
          {period === 'week'
            ? thisWeek
              ? 'Esta semana todavía no mediste nada. Lo que registres desde el lunes se suma acá.'
              : 'Esa semana no quedó nada registrado.'
            : 'Todavía no hay tiempo medido.'}
        </p>
      ) : (
        <ul className="divide-y divide-rule">
          {rows.map(({ project, total, days }) => (
            <li key={project.id} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm font-medium">{project.name}</span>
                <span className="num shrink-0 text-sm">{formatShort(total)}</span>
              </div>

              {period === 'week' ? (
                // One cell per weekday, filled in proportion to the busiest day
                // of the week across all projects, so cells compare honestly.
                <div className="mt-2 grid grid-cols-7 gap-1">
                  {days.map((spent, index) => (
                    <div
                      key={index}
                      title={`${WEEKDAYS[index]}: ${formatShort(spent)}`}
                      className="flex flex-col items-center gap-1"
                    >
                      <div className="relative h-6 w-full overflow-hidden rounded-sm bg-rule/60">
                        <div
                          className="absolute inset-x-0 bottom-0 rounded-sm"
                          style={{
                            height: spent > 0 ? `${Math.max(8, (spent / busiestDay) * 100)}%` : 0,
                            backgroundColor: project.color,
                          }}
                        />
                      </div>
                      <span
                        className={`num text-[10px] ${index === todayIndex ? 'font-semibold text-ink' : 'text-graphite'}`}
                      >
                        {WEEKDAYS[index]}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-2 h-1 rounded-full bg-rule">
                  <div
                    className="h-1 rounded-full"
                    style={{
                      width: `${Math.max(2, (total / largest) * 100)}%`,
                      backgroundColor: project.color,
                    }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
