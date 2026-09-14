/**
 * A stand-in for the Supabase tables, used by the sync tests.
 *
 * It reproduces the two behaviours the sync engine actually leans on: the
 * `synced_at` stamp that the database trigger writes on every insert and
 * update, and the range filter that a pull uses to ask for a window of
 * changes. Everything else about PostgREST is irrelevant here.
 */
export interface FakeServer {
  tables: Record<string, Record<string, unknown>[]>
  /** Advances one tick per write, standing in for the server clock. */
  clock: number
  upserts: number
}

export function createFakeServer(): FakeServer {
  return { tables: { projects: [], tasks: [], entries: [] }, clock: 1, upserts: 0 }
}

const stampOf = (n: number) => new Date(Date.UTC(2026, 0, 1) + n).toISOString()

export const serverNow = (server: FakeServer) => stampOf(server.clock)

/** Writes a row as if another device had pushed it. */
export function seed(server: FakeServer, table: string, row: Record<string, unknown>) {
  upsertInto(server, table, [row])
}

function upsertInto(server: FakeServer, table: string, rows: Record<string, unknown>[]) {
  for (const row of rows) {
    const stamped = { ...row, synced_at: stampOf(server.clock++) }
    const rest = server.tables[table].filter((existing) => existing.id !== row.id)
    server.tables[table] = [...rest, stamped]
  }
}

interface Filter {
  op: 'eq' | 'gte' | 'lt'
  column: string
  value: string
}

class FakeQuery implements PromiseLike<{ data: unknown[]; error: null }> {
  private filters: Filter[] = []
  private rows: Record<string, unknown>[]

  constructor(rows: Record<string, unknown>[]) {
    this.rows = rows
  }

  select() {
    return this
  }
  eq(column: string, value: string) {
    this.filters.push({ op: 'eq', column, value })
    return this
  }
  gte(column: string, value: string) {
    this.filters.push({ op: 'gte', column, value })
    return this
  }
  lt(column: string, value: string) {
    this.filters.push({ op: 'lt', column, value })
    return this
  }

  then<T>(resolve: (value: { data: unknown[]; error: null }) => T) {
    const data = this.rows.filter((row) =>
      this.filters.every(({ op, column, value }) => {
        const actual = String(row[column])
        if (op === 'eq') return actual === value
        if (op === 'gte') return actual >= value
        return actual < value
      }),
    )
    return Promise.resolve(resolve({ data, error: null }))
  }
}

/**
 * The engine imports its client once at module load, so the tests swap the
 * server behind a stable object rather than re-mocking the module per case.
 */
let current: FakeServer = createFakeServer()
export const useServer = (server: FakeServer) => {
  current = server
}
export const currentClient = {
  from: (table: string) => fakeClient(current).from(table),
  rpc: () => fakeClient(current).rpc(),
}

export function fakeClient(server: FakeServer) {
  return {
    from(table: string) {
      return {
        upsert(rows: Record<string, unknown>[]) {
          server.upserts += 1
          upsertInto(server, table, rows)
          return Promise.resolve({ error: null })
        },
        select() {
          return new FakeQuery(server.tables[table])
        },
      }
    },
    rpc() {
      return Promise.resolve({ data: serverNow(server), error: null })
    },
  }
}
