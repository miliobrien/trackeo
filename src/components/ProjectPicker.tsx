import { useState } from 'react'
import type { Project } from '../db/schema'
import { createProject } from '../db/repo'

interface Props {
  projects: Project[]
  value: string
  onChange: (projectId: string) => void
  disabled?: boolean
}

/** Chooses the project for the next timer, and creates one without leaving the row. */
export function ProjectPicker({ projects, value, onChange, disabled }: Props) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const active = projects.filter((p) => p.archived === 0)
  const selected = active.find((p) => p.id === value)

  async function add() {
    if (!name.trim()) return
    const id = await createProject(name)
    setName('')
    setAdding(false)
    onChange(id)
  }

  // This sits inside the timer's own form, and a form cannot contain another
  // form, so the row is plain markup: the buttons never submit, and Enter is
  // caught here before it reaches the timer.
  if (adding || active.length === 0) {
    return (
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void add()
            }
            if (e.key === 'Escape' && active.length > 0) setAdding(false)
          }}
          placeholder="Nombre del proyecto"
          className="h-10 w-48 rounded-md border border-rule bg-card px-3 text-sm outline-none placeholder:text-graphite/60 focus:border-ink"
        />
        <button
          type="button"
          onClick={() => void add()}
          className="h-10 rounded-md bg-ink px-3 text-sm font-medium text-paper disabled:opacity-40"
          disabled={!name.trim()}
        >
          Crear
        </button>
        {active.length > 0 && (
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="h-10 px-2 text-sm text-graphite hover:text-ink"
          >
            Cancelar
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: selected?.color ?? 'transparent' }}
      />
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Proyecto"
        className="h-10 rounded-md border border-rule bg-card px-2 text-sm outline-none focus:border-ink disabled:text-graphite"
      >
        {active.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => setAdding(true)}
        disabled={disabled}
        title="Nuevo proyecto"
        className="size-10 rounded-md border border-rule text-graphite hover:border-ink hover:text-ink disabled:opacity-40"
      >
        +
      </button>
    </div>
  )
}
