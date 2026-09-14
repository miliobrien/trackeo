import { useState } from 'react'
import type { Entry, Project, Task } from '../db/schema'
import { startTimer, stopTimer } from '../db/repo'
import { entryDuration, splitClock } from '../lib/time'
import { ProjectPicker } from './ProjectPicker'

interface Props {
  projects: Project[]
  tasks: Task[]
  running: Entry | undefined
  now: number
}

export function TimerBar({ projects, tasks, running, now }: Props) {
  const [taskName, setTaskName] = useState('')
  const [chosenProject, setChosenProject] = useState('')

  const runningTask = running ? tasks.find((t) => t.id === running.taskId) : undefined

  // Falls back to the first available project rather than remembering a choice
  // that no longer exists, which is what happens the moment a project is
  // archived or the very first time the app opens with an empty selection.
  const usable = projects.filter((p) => p.archived === 0)
  const projectId = usable.some((p) => p.id === chosenProject)
    ? chosenProject
    : (usable[0]?.id ?? '')

  // While a timer runs, the row mirrors what is being tracked rather than a
  // half-typed draft, so the two can never disagree.
  const shownName = running ? (runningTask?.name ?? '') : taskName
  const shownProject = running ? running.projectId : projectId
  const elapsed = running ? entryDuration(running, now) : 0
  const { lead, seconds } = splitClock(elapsed)

  const canStart = taskName.trim().length > 0 && projectId !== ''

  async function toggle() {
    if (running) {
      await stopTimer()
      return
    }
    if (!canStart) return
    await startTimer(taskName, projectId)
    setTaskName('')
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    void toggle()
  }

  // Suggest what was tracked recently in this project, newest first.
  const suggestions = tasks
    .filter((t) => t.projectId === shownProject)
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
    .slice(0, 12)

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-rule bg-card p-5 shadow-[0_1px_2px_rgba(20,24,31,0.04)]"
    >
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={shownName}
          onChange={(e) => setTaskName(e.target.value)}
          // Typing a name and hitting Enter is the whole interaction, so it is
          // wired explicitly rather than left to the form's implicit submit.
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            void toggle()
          }}
          readOnly={Boolean(running)}
          list="recent-tasks"
          placeholder="¿En qué estás trabajando?"
          aria-label="Nombre de la tarea"
          // Full width on a phone, where the project picker takes the row
          // below it; sharing the row would leave the name unreadably narrow.
          className="h-10 w-full min-w-0 basis-full rounded-md border border-rule bg-card px-3 text-[15px] outline-none placeholder:text-graphite/60 focus:border-ink read-only:border-transparent read-only:bg-transparent read-only:px-0 read-only:font-medium sm:w-auto sm:flex-1 sm:basis-0"
        />
        <datalist id="recent-tasks">
          {suggestions.map((task) => (
            <option key={task.id} value={task.name} />
          ))}
        </datalist>

        <ProjectPicker
          projects={projects}
          value={shownProject}
          onChange={setChosenProject}
          disabled={Boolean(running)}
        />
      </div>

      <div className="mt-5 flex items-end justify-between gap-4">
        <div>
          <div className="num text-[clamp(2.75rem,9vw,4rem)] leading-none font-medium tracking-tight">
            {lead}
            <span className="text-graphite">:{seconds}</span>
          </div>
          <p className="mt-2 h-4 text-xs text-graphite">
            {running ? (
              <span className="inline-flex items-center gap-1.5 text-live">
                <span className="size-1.5 rounded-full bg-live" aria-hidden />
                En curso
              </span>
            ) : (
              'Detenido'
            )}
          </p>
        </div>

        <button
          type="submit"
          disabled={!running && !canStart}
          className={
            running
              ? 'h-12 rounded-lg bg-live px-7 text-[15px] font-medium text-white'
              : 'h-12 rounded-lg bg-ink px-7 text-[15px] font-medium text-paper disabled:bg-rule disabled:text-graphite'
          }
        >
          {running ? 'Frenar' : 'Empezar'}
        </button>
      </div>
    </form>
  )
}
