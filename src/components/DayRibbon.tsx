import type { Entry, Project, Task } from '../db/schema'
import { dayBounds, formatDuration, isSameDay, ribbonSpan } from '../lib/time'

interface Props {
  entries: Entry[]
  projects: Project[]
  tasks: Task[]
  /** The day being drawn, which is not always the day it is now. */
  day: number
  now: number
}

const TICKS = [0, 3, 6, 9, 12, 15, 18, 21]

/**
 * The day drawn as a single 24 hour bar, each stretch of work a segment in its
 * project's colour. A list of rows tells you what you did; this tells you the
 * shape of the day, gaps included.
 */
export function DayRibbon({ entries, projects, tasks, day, now }: Props) {
  const { start, end } = dayBounds(day)
  const viewingToday = isSameDay(day, now)
  const nowOffset = ((now - start) / (end - start)) * 100

  return (
    <section aria-label="Tu día en horas">
      <div className="relative h-14 overflow-hidden rounded-lg border border-rule bg-card">
        {TICKS.map((hour) => (
          <div
            key={hour}
            aria-hidden
            className="absolute inset-y-0 border-l border-rule"
            style={{ left: `${(hour / 24) * 100}%` }}
          />
        ))}

        {entries.map((entry) => {
          const { left, width } = ribbonSpan(entry, day, now)
          if (width <= 0) return null
          const project = projects.find((p) => p.id === entry.projectId)
          const task = tasks.find((t) => t.id === entry.taskId)
          return (
            <div
              key={entry.id}
              title={`${task?.name ?? 'Tarea'} · ${project?.name ?? ''} · ${formatDuration(
                (entry.endedAt ?? now) - entry.startedAt,
              )}`}
              className="absolute inset-y-2 rounded-sm"
              style={{
                left: `${left}%`,
                width: `max(2px, ${width}%)`,
                backgroundColor: project?.color ?? '#475569',
                opacity: entry.running ? 1 : 0.85,
              }}
            />
          )
        })}

        {/* The marker says where the current moment sits, so it belongs only
            on the day that is actually happening. */}
        {viewingToday && (
          <div
            aria-hidden
            className="absolute inset-y-0 w-px bg-ink"
            style={{ left: `${nowOffset}%` }}
          />
        )}
      </div>

      {/* Each label is pinned to the gridline it names, not spread evenly, so
          the hour scale stays readable as an actual axis. */}
      <div className="relative mt-1.5 h-4">
        {[...TICKS, 24].map((hour) => (
          <span
            key={hour}
            className="num absolute text-[11px] text-graphite"
            style={{
              left: `${(hour / 24) * 100}%`,
              transform: hour === 0 ? 'none' : hour === 24 ? 'translateX(-100%)' : 'translateX(-50%)',
            }}
          >
            {String(hour).padStart(2, '0')}
          </span>
        ))}
      </div>
    </section>
  )
}
