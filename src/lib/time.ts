import { addDays, addWeeks, startOfDay, startOfWeek } from 'date-fns'
import type { Entry } from '../db/schema'

export const MINUTE = 60_000
export const HOUR = 3_600_000

/**
 * Half-open range [start, end) covering the local day that `at` falls in.
 * Built by adding a day rather than by taking 23:59:59.999, so no millisecond
 * can fall between two consecutive days.
 */
export function dayBounds(at: number | Date = Date.now()) {
  const start = startOfDay(at)
  return { start: start.getTime(), end: addDays(start, 1).getTime() }
}

/**
 * How long an entry has run. An entry that is still open is measured against
 * `now`, so the value keeps growing while the timer runs.
 */
export function entryDuration(entry: Entry, now: number = Date.now()): number {
  const end = entry.endedAt ?? now
  return Math.max(0, end - entry.startedAt)
}

export function sumEntries(entries: Entry[], now: number = Date.now()): number {
  return entries.reduce((total, entry) => total + entryDuration(entry, now), 0)
}

/**
 * An entry belongs entirely to the day it started on, even when it runs past
 * midnight. It is the only rule under which the daily figures add up to the
 * project totals without splitting a single stretch of work in two.
 */
export function startedOn(entry: Entry, day: number | Date = Date.now()): boolean {
  const { start, end } = dayBounds(day)
  return entry.startedAt >= start && entry.startedAt < end
}

/**
 * Splits the running clock so the seconds can be set in a quieter colour than
 * the hours and minutes. Over eight hours of use, a full-contrast seconds
 * column pulls the eye constantly.
 */
export function splitClock(ms: number): { lead: string; seconds: string } {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return {
    lead: `${hours}:${String(minutes).padStart(2, '0')}`,
    seconds: String(seconds).padStart(2, '0'),
  }
}

/** Full precision, for the list of finished blocks. */
export function formatDuration(ms: number): string {
  const { lead, seconds } = splitClock(ms)
  return `${lead}:${seconds}`
}

/** Rounded to the minute, for totals where seconds are noise. */
export function formatShort(ms: number): string {
  if (ms <= 0) return '0 min'
  const minutes = Math.floor(ms / MINUTE)
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  // A project that has been running for forty seconds has a real total; saying
  // "0 min" next to a filled bar reads as a bug rather than as a small number.
  if (minutes === 0) return 'menos de 1 min'
  if (hours === 0) return `${rest} min`
  return `${hours} h ${String(rest).padStart(2, '0')} min`
}

/** Local wall-clock time, 24 hour, e.g. 09:41. */
export function formatTimeOfDay(ts: number): string {
  return new Date(ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', hour12: false })
}

/**
 * Half-open range [start, end) of the week `at` falls in, Monday to Sunday.
 * Weeks start on Monday because that is when a working week starts, and it
 * is what makes the weekly totals "reset" on the first workday.
 */
export function weekBounds(at: number | Date = Date.now()) {
  const start = startOfWeek(at, { weekStartsOn: 1 })
  return { start: start.getTime(), end: addWeeks(start, 1).getTime() }
}

/** Same rule as days: a block belongs to the week it started in. */
export function startedInWeek(entry: Entry, at: number | Date = Date.now()): boolean {
  const { start, end } = weekBounds(at)
  return entry.startedAt >= start && entry.startedAt < end
}

/** 0 for Monday through 6 for Sunday, in local time. */
export function weekdayIndex(ts: number): number {
  return (new Date(ts).getDay() + 6) % 7
}

/** "8 al 14 de septiembre", or "29 de septiembre al 5 de octubre" across months. */
export function formatWeekRange(at: number, now: number = Date.now()): string {
  const { start, end } = weekBounds(at)
  const first = new Date(start)
  const last = new Date(end - 1)
  const month = (d: Date) => d.toLocaleDateString('es', { month: 'long' })
  const year = last.getFullYear() !== new Date(now).getFullYear() ? ` de ${last.getFullYear()}` : ''
  if (first.getMonth() === last.getMonth()) {
    return `${first.getDate()} al ${last.getDate()} de ${month(last)}${year}`
  }
  return `${first.getDate()} de ${month(first)} al ${last.getDate()} de ${month(last)}${year}`
}

/**
 * Blocks gathered into the days they started on, newest day first, with the
 * blocks inside each day also newest first.
 */
export function groupByDay(
  entries: Entry[],
  now: number = Date.now(),
): { day: number; total: number; entries: Entry[] }[] {
  const days = new Map<number, Entry[]>()
  for (const entry of entries) {
    const key = dayBounds(entry.startedAt).start
    days.set(key, [...(days.get(key) ?? []), entry])
  }
  return [...days.entries()]
    .map(([day, group]) => ({
      day,
      total: sumEntries(group, now),
      entries: [...group].sort((a, b) => b.startedAt - a.startedAt),
    }))
    .sort((a, b) => b.day - a.day)
}

/** Whether two instants fall on the same local calendar day. */
export function isSameDay(a: number, b: number): boolean {
  return dayBounds(a).start === dayBounds(b).start
}

/** The start of the day `delta` days away from the one `day` falls in. */
export function shiftDay(day: number, delta: number): number {
  const at = startOfDay(day)
  at.setDate(at.getDate() + delta)
  return at.getTime()
}

/** The `YYYY-MM-DD` an `<input type="date">` expects, in local time. */
export function toDateInput(ts: number): string {
  const at = new Date(ts)
  const month = String(at.getMonth() + 1).padStart(2, '0')
  return `${at.getFullYear()}-${month}-${String(at.getDate()).padStart(2, '0')}`
}

/**
 * Start of the local day a date field names. Built from the parts rather than
 * handed to `new Date(value)`, which reads a bare `YYYY-MM-DD` as UTC and so
 * lands on the day before for anyone west of Greenwich.
 */
export function fromDateInput(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return null
  const [, year, month, day] = match.map(Number)
  const at = new Date(year, month - 1, day)
  if (at.getMonth() !== month - 1 || at.getDate() !== day) return null
  return startOfDay(at).getTime()
}

/** "jueves, 11 de septiembre", with the year only when it is not this one. */
export function formatDayName(day: number, now: number = Date.now()): string {
  const sameYear = new Date(day).getFullYear() === new Date(now).getFullYear()
  return new Date(day).toLocaleDateString('es', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

/** The word for a day close enough to have one, so dates stay readable. */
export function relativeDayWord(day: number, now: number = Date.now()): string | null {
  if (isSameDay(day, now)) return 'Hoy'
  if (isSameDay(day, shiftDay(now, -1))) return 'Ayer'
  return null
}

/** The `HH:MM` an `<input type="time">` expects, in local time. */
export function toTimeInput(ts: number): string {
  const at = new Date(ts)
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
}

/**
 * Moves an instant to a different clock time on the same calendar day.
 *
 * Seconds are dropped, because the field being edited only offers minutes and
 * keeping a hidden remainder would make a corrected block disagree with what
 * the row shows. Returns null for anything that is not a real time of day.
 */
export function withTimeOfDay(base: number, hhmm: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!match) return null

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null

  const at = new Date(base)
  at.setHours(hours, minutes, 0, 0)
  return at.getTime()
}

/**
 * An end that lands before its start means the block ran past midnight, which
 * is what a night shift looks like once both times are on the same day.
 */
export function resolveEnd(startedAt: number, endedAt: number): number {
  if (endedAt >= startedAt) return endedAt
  // Advance the calendar day rather than adding 24 hours of milliseconds, so
  // the clock time the person typed survives a daylight saving change.
  const at = new Date(endedAt)
  at.setDate(at.getDate() + 1)
  return at.getTime()
}

/**
 * Whether two blocks cover any of the same time.
 *
 * The timer cannot produce an overlap, but correcting times by hand can, and
 * two blocks over the same hour quietly count that hour twice in the totals.
 * Touching end to end is not an overlap.
 */
export function overlaps(
  a: { startedAt: number; endedAt: number | null },
  b: { startedAt: number; endedAt: number | null },
  now: number = Date.now(),
): boolean {
  const aEnd = a.endedAt ?? now
  const bEnd = b.endedAt ?? now
  return a.startedAt < bEnd && b.startedAt < aEnd
}

/**
 * Where an entry sits on a 24 hour bar, as fractions of the day. An entry that
 * crosses midnight is clipped at the edge of the day being drawn.
 */
export function ribbonSpan(entry: Entry, day: number, now: number = Date.now()) {
  const { start, end } = dayBounds(day)
  const from = Math.max(entry.startedAt, start)
  const to = Math.min(entry.endedAt ?? now, end)
  const span = end - start
  return {
    left: ((from - start) / span) * 100,
    width: (Math.max(0, to - from) / span) * 100,
  }
}
