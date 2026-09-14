import { useCallback, useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Session } from '@supabase/supabase-js'
import { countPending, syncNow } from './engine'
import { isConfigured, supabase } from './supabase'

export type SyncStatus =
  | 'off'
  | 'unknown'
  | 'signed-out'
  | 'offline'
  | 'syncing'
  | 'pending'
  | 'synced'
  | 'error'

const EVERY = 60_000
const SETTLE = 1_500

export function useSync() {
  const [session, setSession] = useState<Session | null>(null)
  // Reading the stored session is asynchronous. Until it answers, the app does
  // not know whether anyone is signed in, and saying "solo en esta compu" in
  // the meantime reads as being logged out on every single load.
  const [known, setKnown] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null)
  const [online, setOnline] = useState(() => navigator.onLine)

  // The database itself says when there is something to send, so a write
  // anywhere in the app schedules a sync without every caller remembering to.
  const pending = useLiveQuery(countPending, [], 0)

  const running = useRef(false)
  const userId = session?.user.id ?? null

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setKnown(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setKnown(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  const run = useCallback(async () => {
    if (!userId || running.current || !navigator.onLine) return
    running.current = true
    setBusy(true)
    try {
      await syncNow(userId)
      setError(null)
      setLastSyncedAt(Date.now())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo sincronizar')
    } finally {
      running.current = false
      setBusy(false)
    }
  }, [userId])

  // A burst of edits settles into one round trip instead of one per keystroke.
  useEffect(() => {
    if (!userId || pending === 0) return
    const id = window.setTimeout(() => void run(), SETTLE)
    return () => window.clearTimeout(id)
  }, [userId, pending, run])

  // Changes made on the other device arrive on a timer, and right away when
  // the tab is looked at again or the connection comes back. Signing in kicks
  // off the first round immediately, which is what pulls down whatever the
  // other device recorded while this one was closed.
  useEffect(() => {
    if (!userId) return
    const first = window.setTimeout(() => void run(), 0)
    const id = window.setInterval(() => void run(), EVERY)
    const onWake = () => {
      if (!document.hidden) void run()
    }
    document.addEventListener('visibilitychange', onWake)
    window.addEventListener('online', onWake)
    window.addEventListener('focus', onWake)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onWake)
      window.removeEventListener('online', onWake)
      window.removeEventListener('focus', onWake)
    }
  }, [userId, run])

  // Read top to bottom: the first condition that holds is what the header says.
  const status: SyncStatus = (() => {
    if (!isConfigured) return 'off'
    if (!known) return 'unknown'
    if (!session) return 'signed-out'
    if (!online) return 'offline'
    if (busy) return 'syncing'
    if (error) return 'error'
    if (pending > 0) return 'pending'
    return 'synced'
  })()

  const signIn = useCallback(async (email: string) => {
    if (!supabase) throw new Error('Supabase no está configurado')
    const { error: cause } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      // Origin plus base path: published under /trackeo/, the bare origin would
      // send the sign-in link to a GitHub page that is not this app.
      options: { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL },
    })
    if (cause) throw new Error(cause.message)
  }, [])

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut()
  }, [])

  return { status, error, pending, lastSyncedAt, email: session?.user.email ?? null, signIn, signOut, sync: run }
}
