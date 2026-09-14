import type { EntityTable } from 'dexie'
import { db, getMeta, setMeta, type Synced } from '../db/schema'
import { supabase } from './supabase'
import {
  fromEntryRow,
  fromProjectRow,
  fromTaskRow,
  toEntryRow,
  toProjectRow,
  toTaskRow,
} from './rows'

const CURSOR = 'syncCursor'
const OWNER = 'userId'
const EPOCH = '1970-01-01T00:00:00.000Z'

type Local = Synced & { id: string }
type Remote = Record<string, unknown>

interface Plan<L extends Local, R extends Remote> {
  table: EntityTable<L, 'id'>
  remote: string
  toRow: (row: L, userId: string) => R
  fromRow: (row: R) => L
}

/**
 * Pairs a local table with its server table. The call is fully type checked,
 * then erased so push and pull can walk all three tables with one code path
 * instead of three near-identical copies.
 */
const plan = <L extends Local, R extends Remote>(p: Plan<L, R>) =>
  p as unknown as Plan<Local, Remote>

/**
 * Order is a dependency order, not a preference: the database refuses a task
 * whose project it has never seen, and an entry whose task it has never seen.
 */
const PLANS = [
  plan({ table: db.projects, remote: 'projects', toRow: toProjectRow, fromRow: fromProjectRow }),
  plan({ table: db.tasks, remote: 'tasks', toRow: toTaskRow, fromRow: fromTaskRow }),
  plan({ table: db.entries, remote: 'entries', toRow: toEntryRow, fromRow: fromEntryRow }),
]

/** Sends what this device changed and has not had accepted yet. */
export async function push(userId: string): Promise<number> {
  let sent = 0

  for (const { table, remote, toRow } of PLANS) {
    const pending = await table.where('dirty').equals(1).toArray()
    if (pending.length === 0) continue

    const { error } = await supabase!.from(remote).upsert(pending.map((row) => toRow(row, userId)))
    if (error) throw new Error(`No se pudo guardar ${remote}: ${error.message}`)

    await db.transaction('rw', table, async () => {
      for (const row of pending) {
        const current = await table.get(row.id)
        // Only clear the flag while the row is still the version that was
        // sent. An edit made while the request was in flight stays queued.
        if (current && current.updatedAt === row.updatedAt) {
          await table.update(row.id, { dirty: 0 })
        }
      }
    })
    sent += pending.length
  }

  return sent
}

/**
 * Takes in what changed on the server since the last pull.
 *
 * Conflicts are settled by `updatedAt`, the stamp of the device that made the
 * change: the newer edit wins, and a tie keeps the server's copy so that two
 * devices never disagree about which version is canonical.
 */
export async function pull(userId: string): Promise<number> {
  // One instant from the server bounds all three reads. Without it, a row
  // written between the first read and the last would fall below the new
  // cursor and never be read again.
  const { data: until, error } = await supabase!.rpc('server_now')
  if (error) throw new Error(`No se pudo leer la hora del servidor: ${error.message}`)

  const since = (await getMeta(CURSOR)) ?? EPOCH
  const bound = new Date(until as string).toISOString()
  let received = 0

  for (const { table, remote, fromRow } of PLANS) {
    const { data, error: readError } = await supabase!
      .from(remote)
      .select('*')
      .eq('user_id', userId)
      .gte('synced_at', since)
      .lt('synced_at', bound)

    if (readError) throw new Error(`No se pudo leer ${remote}: ${readError.message}`)
    const rows = (data ?? []) as Remote[]
    if (rows.length === 0) continue

    await db.transaction('rw', table, async () => {
      for (const raw of rows) {
        const incoming = fromRow(raw)
        const current = await table.get(incoming.id)
        if (current && current.updatedAt > incoming.updatedAt) continue
        await table.put(incoming)
      }
    })
    received += rows.length
  }

  await setMeta(CURSOR, bound)
  return received
}

/**
 * Decides what the local database means for the account that just signed in.
 *
 * Nothing has synced here before, so what is on this device is this person's
 * work and it is queued whole for the first push. A different account than
 * last time means the local rows belong to someone else, and they are cleared
 * rather than quietly merged into the new account.
 */
export async function prepareForUser(userId: string): Promise<void> {
  const owner = await getMeta(OWNER)
  if (owner === userId) return

  await db.transaction('rw', db.projects, db.tasks, db.entries, async () => {
    for (const { table } of PLANS) {
      if (owner === null) await table.toCollection().modify({ dirty: 1 })
      else await table.clear()
    }
  })

  if (owner !== null) await setMeta(CURSOR, null)
  await setMeta(OWNER, userId)
}

export async function syncNow(userId: string): Promise<void> {
  await prepareForUser(userId)
  await push(userId)
  await pull(userId)
}

/** How many local changes are still waiting for the server. */
export async function countPending(): Promise<number> {
  const counts = await Promise.all(
    PLANS.map(({ table }) => table.where('dirty').equals(1).count()),
  )
  return counts.reduce((total, count) => total + count, 0)
}
