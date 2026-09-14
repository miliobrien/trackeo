import { useEffect, useState } from 'react'

/**
 * A clock that re-renders the components reading it.
 *
 * Everything downstream computes elapsed time as `now - startedAt`, never by
 * adding a second to a counter. An accumulating counter falls behind whenever
 * the machine sleeps or the browser throttles a background tab, and the drift
 * is silent. Recomputing from the start timestamp cannot drift.
 *
 * The interval is half a second so the seconds digit turns over without a
 * visible stutter; `visibilitychange` snaps the value forward the moment the
 * tab comes back, instead of waiting for the next tick.
 */
export function useNow(interval = 500): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), interval)
    const onVisible = () => {
      if (!document.hidden) setNow(Date.now())
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [interval])

  return now
}
