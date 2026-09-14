import {
  db,
  PROJECT_COLORS,
  type Entry,
  type Project,
  type Synced,
  type Task,
} from './schema'

const newId = () => crypto.randomUUID()

/**
 * Marks a row as changed here and not yet accepted by the server. Every write
 * in this module goes through it, which is what keeps the push queue honest:
 * a change that forgets to stamp itself would never leave this device.
 */
const stamp = (at = Date.now()): Synced => ({ updatedAt: at, deletedAt: null, dirty: 1 })

/* ------------------------------------------------------------------ reads  */
// Soft-deleted rows stay in the table so the deletion can travel to the other
// device, so every read has to step over them.

export const listProjects = () => db.projects.filter((p) => p.deletedAt === null).toArray()
export const listTasks = () => db.tasks.filter((t) => t.deletedAt === null).toArray()
export const listEntries = () =>
  db.entries.orderBy('startedAt').filter((e) => e.deletedAt === null).toArray()

export function getRunningEntry() {
  return db.entries
    .where('running')
    .equals(1)
    .filter((e) => e.deletedAt === null)
    .first()
}

/* ---------------------------------------------------------------- projects */

export async function createProject(name: string): Promise<string> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('El proyecto necesita un nombre')

  const used = await db.projects.count()
  const project: Project = {
    id: newId(),
    name: trimmed,
    color: PROJECT_COLORS[used % PROJECT_COLORS.length],
    archived: 0,
    createdAt: Date.now(),
    ...stamp(),
  }
  await db.projects.add(project)
  return project.id
}

export function renameProject(id: string, name: string) {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('El proyecto necesita un nombre')
  return db.projects.update(id, { name: trimmed, ...stamp() })
}

/** Hides a project from the picker without touching its history. */
export function setProjectArchived(id: string, archived: boolean) {
  return db.projects.update(id, { archived: archived ? 1 : 0, ...stamp() })
}

/* ------------------------------------------------------------------ timer  */

/**
 * Opens a new entry, closing whatever was running first. Both steps share one
 * transaction, which is what guarantees a single running entry even when the
 * app is open in two tabs at once.
 */
export async function startTimer(taskName: string, projectId: string): Promise<string> {
  const trimmed = taskName.trim()
  if (!trimmed) throw new Error('La tarea necesita un nombre')

  return db.transaction('rw', db.tasks, db.entries, async () => {
    const now = Date.now()
    await closeRunning(now)

    const task = await findOrCreateTask(trimmed, projectId, now)
    const entry: Entry = {
      id: newId(),
      taskId: task.id,
      projectId,
      startedAt: now,
      endedAt: null,
      running: 1,
      ...stamp(now),
    }
    await db.entries.add(entry)
    return entry.id
  })
}

/**
 * Picks a task back up: a new block on the same task and project, starting
 * now. The task is addressed by id, so continuing never depends on retyping
 * its name exactly, and whatever was running is closed in the same step.
 */
export async function resumeTask(taskId: string): Promise<string> {
  return db.transaction('rw', db.tasks, db.entries, async () => {
    const task = await db.tasks.get(taskId)
    if (!task) throw new Error('Esa tarea ya no existe')

    const now = Date.now()
    await closeRunning(now)
    await db.tasks.put({ ...task, lastUsedAt: now, ...stamp(now) })

    const entry: Entry = {
      id: newId(),
      taskId: task.id,
      projectId: task.projectId,
      startedAt: now,
      endedAt: null,
      running: 1,
      ...stamp(now),
    }
    await db.entries.add(entry)
    return entry.id
  })
}

export function stopTimer() {
  return db.transaction('rw', db.entries, () => closeRunning(Date.now()))
}

/**
 * Closes every open entry. Written as a loop over the `running` index rather
 * than a bulk update so an entry that somehow started in the future still ends
 * with `endedAt >= startedAt` and cannot produce a negative duration.
 */
async function closeRunning(now: number) {
  const open = await db.entries.where('running').equals(1).toArray()
  await Promise.all(
    open.map((entry) =>
      db.entries.update(entry.id, {
        endedAt: Math.max(now, entry.startedAt),
        running: 0,
        ...stamp(now),
      }),
    ),
  )
}

async function findOrCreateTask(name: string, projectId: string, now: number): Promise<Task> {
  const existing = await db.tasks.where('[projectId+name]').equals([projectId, name]).first()
  if (existing) {
    // A task removed on another device comes back to life rather than turning
    // into a second row with the same name in the same project.
    const revived = { ...existing, lastUsedAt: now, ...stamp(now) }
    await db.tasks.put(revived)
    return revived
  }

  const task: Task = { id: newId(), projectId, name, createdAt: now, lastUsedAt: now, ...stamp(now) }
  await db.tasks.add(task)
  return task
}

/* ----------------------------------------------------------------- entries */

/**
 * Corrects the clock times of a block, which is what you need the evening you
 * forget to stop the timer.
 *
 * A block still running keeps running: only its start moves. Times are checked
 * here rather than in the form so that no path into the database can leave a
 * block that ends before it begins.
 */
export async function updateEntryTimes(
  id: string,
  startedAt: number,
  endedAt: number | null,
): Promise<void> {
  const now = Date.now()
  if (startedAt > now) throw new Error('El inicio no puede ser una hora que todavía no llegó')
  if (endedAt !== null) {
    if (endedAt > now) throw new Error('El fin no puede ser una hora que todavía no llegó')
    if (endedAt < startedAt) throw new Error('El fin no puede ser anterior al inicio')
  }

  const updated = await db.entries.update(id, {
    startedAt,
    endedAt,
    running: endedAt === null ? 1 : 0,
    ...stamp(now),
  })
  if (updated === 0) throw new Error('Ese bloque ya no existe')
}

/** Soft delete, so the removal reaches the other device on the next sync. */
export function deleteEntry(id: string) {
  const now = Date.now()
  return db.entries.update(id, { running: 0, updatedAt: now, deletedAt: now, dirty: 1 })
}

/* ------------------------------------------------------------ backup files */

interface Backup {
  version: 1
  exportedAt: number
  projects: Project[]
  tasks: Task[]
  entries: Entry[]
}

export async function exportBackup(): Promise<Backup> {
  const [projects, tasks, entries] = await Promise.all([
    db.projects.toArray(),
    db.tasks.toArray(),
    db.entries.toArray(),
  ])
  return { version: 1, exportedAt: Date.now(), projects, tasks, entries }
}

/**
 * Merges a backup into the current database, matching on id. Restoring after a
 * wipe brings everything back; importing on top of live data updates the rows
 * that were exported and leaves the rest alone.
 */
export async function importBackup(raw: unknown): Promise<{ projects: number; entries: number }> {
  const backup = raw as Partial<Backup>
  if (backup?.version !== 1 || !Array.isArray(backup.projects) || !Array.isArray(backup.entries)) {
    throw new Error('El archivo no es un respaldo de Trackeo')
  }

  // A restored file is a local change like any other, so it queues for the
  // server. Older backups predate the sync fields and get them filled in.
  const revive = <T extends object>(row: T) => ({ ...stamp(), ...row, dirty: 1 as const })

  await db.transaction('rw', db.projects, db.tasks, db.entries, async () => {
    await db.projects.bulkPut(backup.projects!.map(revive))
    await db.tasks.bulkPut((backup.tasks ?? []).map(revive))
    await db.entries.bulkPut(backup.entries!.map(revive))
  })

  return { projects: backup.projects.length, entries: backup.entries.length }
}
