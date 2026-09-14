import Dexie, { type EntityTable } from 'dexie'

/**
 * Fields every synced row carries.
 *
 * `updatedAt` is stamped by whichever device wrote the row and decides which
 * of two competing versions wins. `deletedAt` marks a row as removed without
 * dropping it, so the deletion reaches the other device instead of the row
 * coming back on the next pull. `dirty` marks a local change that the server
 * has not accepted yet.
 */
export interface Synced {
  updatedAt: number
  deletedAt: number | null
  dirty: 0 | 1
}

/** A client. Groups tasks, and is the unit the totals are reported against. */
export interface Project extends Synced {
  id: string
  name: string
  color: string
  /** 0/1 rather than boolean: IndexedDB cannot index a boolean. */
  archived: 0 | 1
  createdAt: number
}

/** A named piece of work inside a project. Reused across days. */
export interface Task extends Synced {
  id: string
  projectId: string
  name: string
  createdAt: number
  /** Drives the "recent tasks" suggestions, newest first. */
  lastUsedAt: number
}

/**
 * One continuous stretch of time. `startedAt`/`endedAt` are epoch milliseconds,
 * which keeps arithmetic immune to daylight saving and to the system clock
 * being adjusted. They are converted to local time only for display.
 */
export interface Entry extends Synced {
  id: string
  taskId: string
  /** Duplicated from the task so project totals need no join. */
  projectId: string
  startedAt: number
  endedAt: number | null
  /** IndexedDB cannot index null, so the running entry is found through this. */
  running: 0 | 1
}

/** Single-row settings: the sync cursor, and who the local rows belong to. */
export interface Meta {
  key: string
  value: string | null
}

export const db = new Dexie('trackeo') as Dexie & {
  projects: EntityTable<Project, 'id'>
  tasks: EntityTable<Task, 'id'>
  entries: EntityTable<Entry, 'id'>
  meta: EntityTable<Meta, 'key'>
}

db.version(1).stores({
  projects: 'id, name, archived, createdAt',
  tasks: 'id, projectId, lastUsedAt, [projectId+name]',
  entries: 'id, startedAt, projectId, taskId, running',
})

// `dirty` is indexed because pushing is exactly "every row that is dirty".
db.version(2)
  .stores({
    projects: 'id, name, archived, createdAt, dirty',
    tasks: 'id, projectId, lastUsedAt, [projectId+name], dirty',
    entries: 'id, startedAt, projectId, taskId, running, dirty',
    meta: 'key',
  })
  .upgrade(async (tx) => {
    // Rows that predate syncing have never been sent anywhere, so they start
    // dirty and get pushed whole the first time someone signs in.
    const stamp = { updatedAt: Date.now(), deletedAt: null, dirty: 1 as const }
    for (const table of ['projects', 'tasks', 'entries']) {
      await tx.table(table).toCollection().modify(stamp)
    }
  })

/** Assigned to new projects in order. Deliberately excludes green, which is
 *  reserved for the running state so the accent keeps a single meaning. */
export const PROJECT_COLORS = [
  '#2563EB',
  '#DB2777',
  '#EA580C',
  '#0891B2',
  '#7C3AED',
  '#CA8A04',
  '#BE123C',
  '#475569',
] as const

export async function getMeta(key: string): Promise<string | null> {
  return (await db.meta.get(key))?.value ?? null
}

export async function setMeta(key: string, value: string | null): Promise<void> {
  await db.meta.put({ key, value })
}
