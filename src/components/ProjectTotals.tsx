import type { Entry, Project } from '../db/schema'
import { entryDuration, formatShort } from '../lib/time'
import { Panel } from './Panel'

interface Props {
  entries: Entry[]
  projects: Project[]
  now: number
}

/**
 * The answer to the question the app exists for: how long each project has
 * taken. Totals cover every entry ever recorded, not just today.
 */
export function ProjectTotals({ entries, projects, now }: Props) {
  const byProject = new Map<string, number>()
  for (const entry of entries) {
    byProject.set(entry.projectId, (byProject.get(entry.projectId) ?? 0) + entryDuration(entry, now))
  }

  const rows = projects
    .map((project) => ({ project, total: byProject.get(project.id) ?? 0 }))
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total)

  const grand = rows.reduce((sum, row) => sum + row.total, 0)
  const largest = rows[0]?.total ?? 1

  return (
    <Panel
      title="Total por proyecto"
      aside={rows.length > 0 ? <span className="num text-sm">{formatShort(grand)}</span> : null}
    >
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-sm text-graphite">
          Todavía no hay tiempo medido. En cuanto frenes el primer cronómetro, acá vas a ver
          cuánto le dedicaste a cada proyecto.
        </p>
      ) : (
        <>
        <ul className="divide-y divide-rule">
          {rows.map(({ project, total }) => (
            <li key={project.id} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm font-medium">{project.name}</span>
                <span className="num shrink-0 text-sm">{formatShort(total)}</span>
              </div>
              <div className="mt-2 h-1 rounded-full bg-rule">
                <div
                  className="h-1 rounded-full"
                  style={{
                    width: `${Math.max(2, (total / largest) * 100)}%`,
                    backgroundColor: project.color,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
        {/* The panel beside this one shows today, so say plainly that this one
            does not, rather than letting the two be read as the same period. */}
        <p className="border-t border-rule px-4 py-2.5 text-xs text-graphite">
          Incluye todo lo registrado, no solo hoy.
        </p>
        </>
      )}
    </Panel>
  )
}
