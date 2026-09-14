import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', async () => {
  const fake = await import('./fakeServer')
  return { supabase: fake.currentClient, isConfigured: true }
})

const { createFakeServer, seed, serverNow, useServer } = await import('./fakeServer')
const { db, getMeta, setMeta } = await import('../db/schema')
const { createProject, deleteEntry, listEntries, listProjects, startTimer, stopTimer, updateEntryTimes, resumeTask } =
  await import('../db/repo')
const { countPending, prepareForUser, pull, push, syncNow } = await import('./engine')

const ME = '11111111-1111-4111-8111-111111111111'
const SOMEONE_ELSE = '22222222-2222-4222-8222-222222222222'

let server = createFakeServer()

beforeEach(async () => {
  server = createFakeServer()
  useServer(server)
  await db.projects.clear()
  await db.tasks.clear()
  await db.entries.clear()
  await db.meta.clear()
})

/** A project row as another device would have pushed it. */
const remoteProject = (over: Record<string, unknown> = {}) => ({
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  user_id: ME,
  name: 'Desde el celular',
  color: '#2563EB',
  archived: false,
  created_at: '2026-01-01T08:00:00.000Z',
  updated_at: '2026-01-01T08:00:00.000Z',
  deleted_at: null,
  ...over,
})

describe('push', () => {
  it('sends local work and stops calling it pending', async () => {
    const projectId = await createProject('Sitio Panadería')
    await startTimer('Maquetar la home', projectId)
    await stopTimer()

    expect(await countPending()).toBe(3)
    const sent = await push(ME)

    expect(sent).toBe(3)
    expect(await countPending()).toBe(0)
    expect(server.tables.projects).toHaveLength(1)
    expect(server.tables.tasks).toHaveLength(1)
    expect(server.tables.entries).toHaveLength(1)
  })

  it('sends a project before the task that points at it', async () => {
    const order: string[] = []
    const projectId = await createProject('Orden')
    await startTimer('Una tarea', projectId)

    const original = server.tables
    server.tables = new Proxy(original, {
      get(target, key: string) {
        if (typeof key === 'string' && key in target) order.push(key)
        return target[key]
      },
    })
    await push(ME)

    expect(order.indexOf('projects')).toBeLessThan(order.indexOf('tasks'))
    expect(order.indexOf('tasks')).toBeLessThan(order.indexOf('entries'))
  })

  it('keeps a change made while the request was in flight', async () => {
    const projectId = await createProject('Sitio')
    await push(ME)

    await db.projects.update(projectId, { name: 'Sitio nuevo', updatedAt: Date.now(), dirty: 1 })
    expect(await countPending()).toBe(1)

    await push(ME)
    expect(await countPending()).toBe(0)
    expect((server.tables.projects[0] as { name: string }).name).toBe('Sitio nuevo')
  })
})

describe('pull', () => {
  it('brings in a project recorded on the other device', async () => {
    seed(server, 'projects', remoteProject())
    await pull(ME)

    const projects = await listProjects()
    expect(projects.map((p) => p.name)).toEqual(['Desde el celular'])
    expect(projects[0].dirty).toBe(0)
  })

  it('lets the newer edit win when both devices changed the same row', async () => {
    seed(server, 'projects', remoteProject())
    await pull(ME)

    const id = remoteProject().id
    const localTime = Date.parse('2026-01-01T10:00:00.000Z')
    await db.projects.update(id, { name: 'Renombrado acá', updatedAt: localTime, dirty: 1 })
    seed(server, 'projects', remoteProject({ name: 'Renombrado allá', updated_at: '2026-01-01T09:00:00.000Z' }))

    await pull(ME)
    expect((await db.projects.get(id))?.name).toBe('Renombrado acá')

    seed(server, 'projects', remoteProject({ name: 'Más nuevo allá', updated_at: '2026-01-01T11:00:00.000Z' }))
    await pull(ME)
    expect((await db.projects.get(id))?.name).toBe('Más nuevo allá')
  })

  it('does not skip a row stamped exactly at the previous cursor', async () => {
    await pull(ME)
    const cursor = await getMeta('syncCursor')

    // The next write lands on the very instant the last pull stopped at, which
    // is the boundary a sync loses rows at when the range is built carelessly.
    seed(server, 'projects', remoteProject())
    expect((server.tables.projects[0] as { synced_at: string }).synced_at).toBe(cursor)

    await pull(ME)
    expect(await listProjects()).toHaveLength(1)
  })

  it('applies a deletion made on the other device', async () => {
    seed(server, 'projects', remoteProject())
    await pull(ME)
    expect(await listProjects()).toHaveLength(1)

    seed(
      server,
      'projects',
      remoteProject({ deleted_at: '2026-01-01T12:00:00.000Z', updated_at: '2026-01-01T12:00:00.000Z' }),
    )
    await pull(ME)

    expect(await listProjects()).toHaveLength(0)
    // The row itself stays, so the deletion is not undone by an older copy.
    expect(await db.projects.count()).toBe(1)
  })

  it('carries a deleted block away from this device too', async () => {
    const projectId = await createProject('Sitio')
    await startTimer('Tarea', projectId)
    await stopTimer()
    const [entry] = await listEntries()

    await push(ME)
    await deleteEntry(entry.id)
    await push(ME)

    const row = server.tables.entries[0] as { deleted_at: string | null }
    expect(row.deleted_at).not.toBeNull()
    expect(await listEntries()).toHaveLength(0)
  })

  it('advances the cursor with new activity and never rewinds it', async () => {
    seed(server, 'projects', remoteProject())
    await pull(ME)
    const first = (await getMeta('syncCursor'))!

    // A quiet pull reads nothing again and must not move the cursor backwards.
    expect(await pull(ME)).toBe(0)
    expect((await getMeta('syncCursor'))! >= first).toBe(true)

    seed(server, 'projects', remoteProject({ id: 'aaaaaaaa-0000-4000-8000-000000000002', name: 'Otro' }))
    expect(await pull(ME)).toBe(1)
    expect((await getMeta('syncCursor'))! > first).toBe(true)
  })
})

describe('prepareForUser', () => {
  it('claims work tracked before signing in', async () => {
    await createProject('Antes de entrar')
    await db.projects.toCollection().modify({ dirty: 0 })
    expect(await countPending()).toBe(0)

    await prepareForUser(ME)
    expect(await countPending()).toBe(1)
    expect(await getMeta('userId')).toBe(ME)
  })

  it('does not hand one account the other account rows', async () => {
    await createProject('Mío')
    await prepareForUser(ME)
    await setMeta('syncCursor', serverNow(server))

    await prepareForUser(SOMEONE_ELSE)

    expect(await db.projects.count()).toBe(0)
    expect(await getMeta('syncCursor')).toBeNull()
    expect(await getMeta('userId')).toBe(SOMEONE_ELSE)
  })

  it('leaves an unchanged account alone', async () => {
    await createProject('Mío')
    await prepareForUser(ME)
    await push(ME)

    await prepareForUser(ME)
    expect(await countPending()).toBe(0)
  })
})

describe('syncNow', () => {
  it('reconciles both directions in one pass', async () => {
    seed(server, 'projects', remoteProject())
    const mine = await createProject('Desde la compu')

    await syncNow(ME)

    const names = (await listProjects()).map((p) => p.name).sort()
    expect(names).toEqual(['Desde el celular', 'Desde la compu'])
    expect(server.tables.projects).toHaveLength(2)
    expect(await countPending()).toBe(0)
    expect(await db.projects.get(mine)).toBeDefined()
  })
})

describe('updateEntryTimes', () => {
  const HOUR = 3_600_000

  async function oneBlock() {
    const projectId = await createProject('Sitio')
    await startTimer('Maquetar', projectId)
    await stopTimer()
    const [entry] = await listEntries()
    return entry
  }

  it('corrects a block you forgot to stop, and queues it for the server', async () => {
    const entry = await oneBlock()
    await push(ME)
    expect(await countPending()).toBe(0)

    const start = Date.now() - 3 * HOUR
    await updateEntryTimes(entry.id, start, start + 2 * HOUR)

    const [fixed] = await listEntries()
    expect(fixed.endedAt! - fixed.startedAt).toBe(2 * HOUR)
    expect(fixed.running).toBe(0)
    expect(await countPending()).toBe(1)

    await push(ME)
    const row = server.tables.entries[0] as { ended_at: string; started_at: string }
    expect(Date.parse(row.ended_at) - Date.parse(row.started_at)).toBe(2 * HOUR)
  })

  it('moves the start of a block that is still running without stopping it', async () => {
    const projectId = await createProject('Sitio')
    await startTimer('En curso', projectId)
    const [entry] = await listEntries()

    await updateEntryTimes(entry.id, Date.now() - HOUR, null)

    const [moved] = await listEntries()
    expect(moved.running).toBe(1)
    expect(moved.endedAt).toBeNull()
  })

  it('refuses times that have not happened yet', async () => {
    const entry = await oneBlock()
    const soon = Date.now() + HOUR
    await expect(updateEntryTimes(entry.id, soon, soon + HOUR)).rejects.toThrow(/todavía no llegó/)
    await expect(updateEntryTimes(entry.id, Date.now() - HOUR, soon)).rejects.toThrow(/todavía no llegó/)
  })

  it('refuses a block that ends before it starts', async () => {
    const entry = await oneBlock()
    const now = Date.now()
    await expect(updateEntryTimes(entry.id, now - HOUR, now - 2 * HOUR)).rejects.toThrow(/anterior al inicio/)
  })

  it('leaves the block untouched when it refuses', async () => {
    const entry = await oneBlock()
    const before = (await listEntries())[0]
    await expect(updateEntryTimes(entry.id, Date.now() + HOUR, null)).rejects.toThrow()
    expect((await listEntries())[0]).toEqual(before)
  })
})

describe('resumeTask', () => {
  it('opens a new block on the same task and project, without retyping', async () => {
    const projectId = await createProject('Sitio')
    await startTimer('Maquetar', projectId)
    await stopTimer()
    const [first] = await listEntries()

    await resumeTask(first.taskId)

    const entries = await listEntries()
    expect(entries).toHaveLength(2)
    const resumed = entries.find((e) => e.id !== first.id)!
    expect(resumed.taskId).toBe(first.taskId)
    expect(resumed.projectId).toBe(projectId)
    expect(resumed.running).toBe(1)
    expect(await db.tasks.count()).toBe(1)
  })

  it('closes whatever was running before picking the task back up', async () => {
    const projectId = await createProject('Sitio')
    await startTimer('Primera', projectId)
    await stopTimer()
    const [first] = await listEntries()
    await startTimer('Segunda', projectId)

    await resumeTask(first.taskId)

    const running = (await listEntries()).filter((e) => e.running === 1)
    expect(running).toHaveLength(1)
    expect(running[0].taskId).toBe(first.taskId)
  })

  it('queues the new block for the server', async () => {
    const projectId = await createProject('Sitio')
    await startTimer('Tarea', projectId)
    await stopTimer()
    await push(ME)
    const [first] = await listEntries()

    await resumeTask(first.taskId)
    expect(await countPending()).toBeGreaterThan(0)
  })
})
