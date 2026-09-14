import type { Entry, Project, Task } from '../db/schema'

/**
 * Translation between the local shape and the Postgres shape.
 *
 * Locally every instant is epoch milliseconds, because that is the only form
 * that cannot drift with time zones. Postgres stores `timestamptz`, so the
 * rows stay readable in the Supabase table editor. ISO strings carry
 * milliseconds exactly, so the round trip is lossless.
 */
const iso = (ms: number) => new Date(ms).toISOString()
const isoOrNull = (ms: number | null) => (ms === null ? null : iso(ms))
const msOf = (value: string) => Date.parse(value)
const msOrNull = (value: string | null) => (value === null ? null : Date.parse(value))

/** Local rows arrive from the server already agreed with it, so never dirty. */
const clean = { dirty: 0 } as const

export type ProjectRow = {
  id: string
  user_id: string
  name: string
  color: string
  archived: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type TaskRow = {
  id: string
  user_id: string
  project_id: string
  name: string
  created_at: string
  last_used_at: string
  updated_at: string
  deleted_at: string | null
}

export type EntryRow = {
  id: string
  user_id: string
  task_id: string
  project_id: string
  started_at: string
  ended_at: string | null
  updated_at: string
  deleted_at: string | null
}

export const toProjectRow = (p: Project, userId: string): ProjectRow => ({
  id: p.id,
  user_id: userId,
  name: p.name,
  color: p.color,
  archived: p.archived === 1,
  created_at: iso(p.createdAt),
  updated_at: iso(p.updatedAt),
  deleted_at: isoOrNull(p.deletedAt),
})

export const fromProjectRow = (r: ProjectRow): Project => ({
  id: r.id,
  name: r.name,
  color: r.color,
  archived: r.archived ? 1 : 0,
  createdAt: msOf(r.created_at),
  updatedAt: msOf(r.updated_at),
  deletedAt: msOrNull(r.deleted_at),
  ...clean,
})

export const toTaskRow = (t: Task, userId: string): TaskRow => ({
  id: t.id,
  user_id: userId,
  project_id: t.projectId,
  name: t.name,
  created_at: iso(t.createdAt),
  last_used_at: iso(t.lastUsedAt),
  updated_at: iso(t.updatedAt),
  deleted_at: isoOrNull(t.deletedAt),
})

export const fromTaskRow = (r: TaskRow): Task => ({
  id: r.id,
  projectId: r.project_id,
  name: r.name,
  createdAt: msOf(r.created_at),
  lastUsedAt: msOf(r.last_used_at),
  updatedAt: msOf(r.updated_at),
  deletedAt: msOrNull(r.deleted_at),
  ...clean,
})

export const toEntryRow = (e: Entry, userId: string): EntryRow => ({
  id: e.id,
  user_id: userId,
  task_id: e.taskId,
  project_id: e.projectId,
  started_at: iso(e.startedAt),
  ended_at: isoOrNull(e.endedAt),
  updated_at: iso(e.updatedAt),
  deleted_at: isoOrNull(e.deletedAt),
})

export const fromEntryRow = (r: EntryRow): Entry => ({
  id: r.id,
  taskId: r.task_id,
  projectId: r.project_id,
  startedAt: msOf(r.started_at),
  endedAt: msOrNull(r.ended_at),
  // An entry with no end is the one still running, on whichever device opened
  // it. That is what makes the timer follow you from the laptop to the phone.
  running: r.ended_at === null && r.deleted_at === null ? 1 : 0,
  updatedAt: msOf(r.updated_at),
  deletedAt: msOrNull(r.deleted_at),
  ...clean,
})
