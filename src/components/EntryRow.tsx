import { useEffect, useState } from 'react'
import type { Entry, Project, Task } from '../db/schema'
import { deleteEntry, resumeTask, updateEntryTimes } from '../db/repo'
import {
  entryDuration,
  formatDuration,
  formatTimeOfDay,
  overlaps,
  resolveEnd,
  toTimeInput,
  withTimeOfDay,
} from '../lib/time'

interface Props {
  entry: Entry
  project: Project | undefined
  task: Task | undefined
  /** The rest of the day, so a correction can point out a block it runs into. */
  others: Entry[]
  tasks: Task[]
  now: number
}

const timeField =
  'num h-7 rounded-md border border-rule bg-card px-1.5 text-xs outline-none focus:border-ink'

export function EntryRow({ entry, project, task, others, tasks, now }: Props) {
  const [mode, setMode] = useState<'view' | 'edit' | 'delete'>('view')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  // Deleting cannot be undone, so the button asks once. The question withdraws
  // itself after a few seconds rather than on blur: a blur handler fires on
  // mouse-down and takes the button away before the confirming click lands.
  useEffect(() => {
    if (mode !== 'delete') return
    const id = window.setTimeout(() => setMode('view'), 4000)
    return () => window.clearTimeout(id)
  }, [mode])

  function edit() {
    setFrom(toTimeInput(entry.startedAt))
    setTo(entry.endedAt === null ? '' : toTimeInput(entry.endedAt))
    setProblem(null)
    setMode('edit')
  }

  // Both times are read against the day the block started on, and an end that
  // lands before its start is taken as a block that ran past midnight.
  const startedAt = mode === 'edit' ? withTimeOfDay(entry.startedAt, from) : entry.startedAt
  const rawEnd = entry.endedAt === null ? null : withTimeOfDay(entry.startedAt, to)
  const endedAt = startedAt !== null && rawEnd !== null ? resolveEnd(startedAt, rawEnd) : rawEnd
  const valid = startedAt !== null && (entry.endedAt === null || endedAt !== null)
  const preview = valid ? entryDuration({ ...entry, startedAt: startedAt!, endedAt }, now) : null

  // Not an error: two blocks over the same hour are sometimes what happened.
  // But the totals count that hour twice, so it should not pass unnoticed.
  const clashes =
    mode === 'edit' && valid
      ? others.filter((other) => overlaps({ startedAt: startedAt!, endedAt }, other, now))
      : []

  async function save() {
    if (!valid) {
      setProblem('Poné una hora válida, tipo 09:30')
      return
    }
    try {
      await updateEntryTimes(entry.id, startedAt!, endedAt)
      setMode('view')
      setProblem(null)
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : 'No se pudo guardar')
    }
  }

  return (
    <li className="group px-4 py-3">
      <div className="flex items-center gap-3">
        {/* The whole name is the "keep going" control. Its dot turns into a play
            mark on hover, so the affordance costs no room in the row. A block
            that is already running has nothing to resume. */}
        <button
          type="button"
          onClick={() => void resumeTask(entry.taskId)}
          disabled={entry.running === 1 || !task || mode === 'edit'}
          title={entry.running ? 'Esta tarea está en curso' : 'Seguir con esta tarea'}
          aria-label={`Seguir con ${task?.name ?? 'esta tarea'}`}
          className="group/resume flex min-w-0 flex-1 items-center gap-3 rounded-md text-left disabled:cursor-default"
        >
          <span className="relative flex size-3 shrink-0 items-center justify-center">
            <span
              aria-hidden
              className="size-2.5 rounded-full group-enabled/resume:group-hover/resume:opacity-0"
              style={{ backgroundColor: project?.color ?? '#475569' }}
            />
            <svg
              aria-hidden
              viewBox="0 0 10 10"
              className="absolute size-3 opacity-0 group-enabled/resume:group-hover/resume:opacity-100"
            >
              <path d="M2 1 L9 5 L2 9 Z" fill={project?.color ?? '#475569'} />
            </svg>
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium group-enabled/resume:group-hover/resume:underline group-enabled/resume:group-hover/resume:underline-offset-4">
              {task?.name ?? 'Tarea borrada'}
            </span>
            <span className="block truncate text-xs text-graphite">
              {project?.name ?? 'Sin proyecto'}
            </span>
          </span>
        </button>

        {mode !== 'edit' && (
          <button
            onClick={edit}
            title="Corregir los horarios"
            className="num hidden text-xs text-graphite underline-offset-4 hover:text-ink hover:underline sm:block"
          >
            {formatTimeOfDay(entry.startedAt)}–
            {entry.endedAt === null ? 'ahora' : formatTimeOfDay(entry.endedAt)}
          </button>
        )}


        <span
          className={`num w-20 text-right text-sm ${entry.running && mode !== 'edit' ? 'text-live' : ''}`}
        >
          {formatDuration(preview ?? entryDuration(entry, now))}
        </span>

        {mode === 'edit' ? null : mode === 'delete' ? (
          <button
            autoFocus
            onClick={() => {
              setMode('view')
              void deleteEntry(entry.id)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setMode('view')
            }}
            className="rounded-md bg-ink px-2 py-1 text-xs whitespace-nowrap text-paper"
          >
            Borrar
          </button>
        ) : (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
            <button
              onClick={edit}
              aria-label={`Corregir horarios de ${task?.name ?? 'el bloque'}`}
              className="rounded-md px-1.5 py-1 text-xs text-graphite hover:text-ink sm:hidden"
            >
              Editar
            </button>
            <button
              onClick={() => setMode('delete')}
              aria-label={`Borrar ${task?.name ?? 'el bloque'}`}
              className="rounded-md px-2 py-1 text-xs text-graphite hover:text-ink"
            >
              ×
            </button>
          </div>
        )}
      </div>

      {/* The editor takes its own line. Sharing the row would squeeze the task
          name down to nothing on a panel this narrow. */}
      {mode === 'edit' && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-[22px]">
          <input
            autoFocus
            type="time"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            aria-label="Hora de inicio"
            className={timeField}
          />
          <span className="text-xs text-graphite">a</span>
          {entry.endedAt === null ? (
            <span className="num text-xs text-live">ahora</span>
          ) : (
            <input
              type="time"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              aria-label="Hora de fin"
              className={timeField}
            />
          )}
          <button
            onClick={() => void save()}
            className="ml-auto rounded-md bg-ink px-2.5 py-1 text-xs text-paper"
          >
            Guardar
          </button>
          <button onClick={() => setMode('view')} className="text-xs text-graphite hover:text-ink">
            Cancelar
          </button>
        </div>
      )}

      {problem && <p className="mt-1.5 pl-[22px] text-xs text-ink">{problem}</p>}

      {clashes.length > 0 && !problem && (
        <p className="mt-1.5 pl-[22px] text-xs text-graphite">
          Se pisa con{' '}
          {clashes
            .map((other) => tasks.find((t) => t.id === other.taskId)?.name ?? 'otro bloque')
            .join(', ')}
          . Esas horas van a contarse dos veces.
        </p>
      )}
    </li>
  )
}
