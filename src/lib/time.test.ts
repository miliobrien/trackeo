import { describe, expect, it } from 'vitest'
import type { Entry } from '../db/schema'
import {
  HOUR,
  MINUTE,
  dayBounds,
  entryDuration,
  formatDuration,
  formatDayName,
  groupByDay,
  formatWeekRange,
  startedInWeek,
  weekBounds,
  weekdayIndex,
  formatShort,
  fromDateInput,
  isSameDay,
  overlaps,
  relativeDayWord,
  shiftDay,
  toDateInput,
  resolveEnd,
  ribbonSpan,
  startedOn,
  sumEntries,
  toTimeInput,
  withTimeOfDay,
} from './time'

const entry = (startedAt: number, endedAt: number | null): Entry => ({
  id: crypto.randomUUID(),
  taskId: 't',
  projectId: 'p',
  startedAt,
  endedAt,
  running: endedAt === null ? 1 : 0,
  updatedAt: startedAt,
  deletedAt: null,
  dirty: 1,
})

describe('dayBounds', () => {
  it('covers exactly 24 hours', () => {
    const { start, end } = dayBounds(new Date(2026, 8, 10, 15, 30))
    expect(end - start).toBe(24 * HOUR)
  })

  it('leaves no gap between consecutive days', () => {
    const today = dayBounds(new Date(2026, 8, 10, 12))
    const tomorrow = dayBounds(new Date(2026, 8, 11, 12))
    expect(today.end).toBe(tomorrow.start)
  })
})

describe('entryDuration', () => {
  it('measures a finished block', () => {
    expect(entryDuration(entry(1_000, 1_000 + 90 * MINUTE))).toBe(90 * MINUTE)
  })

  it('measures an open block against the current instant', () => {
    const now = 500_000
    expect(entryDuration(entry(now - 42_000, null), now)).toBe(42_000)
  })

  it('never returns a negative duration', () => {
    expect(entryDuration(entry(2_000, 1_000))).toBe(0)
  })
})

describe('sumEntries', () => {
  it('adds a running block to the finished ones', () => {
    const now = 10 * HOUR
    const total = sumEntries([entry(0, HOUR), entry(now - 30 * MINUTE, null)], now)
    expect(total).toBe(HOUR + 30 * MINUTE)
  })
})

describe('formatDuration', () => {
  it.each([
    [0, '0:00:00'],
    [59_000, '0:00:59'],
    [90 * MINUTE, '1:30:00'],
    [11 * HOUR + 5 * MINUTE + 7_000, '11:05:07'],
  ])('formats %i ms as %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected)
  })
})

describe('formatShort', () => {
  it.each([
    [0, '0 min'],
    [45_000, 'menos de 1 min'],
    [25 * MINUTE, '25 min'],
    [HOUR + 5 * MINUTE, '1 h 05 min'],
    [12 * HOUR, '12 h 00 min'],
  ])('formats %i ms as %s', (ms, expected) => {
    expect(formatShort(ms)).toBe(expected)
  })
})

describe('startedOn', () => {
  it('keeps a block that runs past midnight on the day it began', () => {
    const day = new Date(2026, 8, 10, 12).getTime()
    const late = new Date(2026, 8, 10, 23, 30).getTime()
    const crossing = entry(late, late + 2 * HOUR)
    expect(startedOn(crossing, day)).toBe(true)
    expect(startedOn(crossing, new Date(2026, 8, 11, 12))).toBe(false)
  })
})

describe('ribbonSpan', () => {
  it('places a midday block in the middle of the bar', () => {
    const day = new Date(2026, 8, 10, 12).getTime()
    const noon = new Date(2026, 8, 10, 12).getTime()
    const { left, width } = ribbonSpan(entry(noon, noon + 6 * HOUR), day)
    expect(left).toBeCloseTo(50)
    expect(width).toBeCloseTo(25)
  })

  it('clips a block at the end of the day it crosses', () => {
    const day = new Date(2026, 8, 10, 12).getTime()
    const late = new Date(2026, 8, 10, 23, 0).getTime()
    const { left, width } = ribbonSpan(entry(late, late + 3 * HOUR), day)
    expect(left).toBeCloseTo((23 / 24) * 100)
    expect(width).toBeCloseTo((1 / 24) * 100)
  })
})

describe('withTimeOfDay', () => {
  const base = new Date(2026, 8, 10, 15, 47, 33, 500).getTime()

  it('moves the clock time and keeps the calendar day', () => {
    const moved = new Date(withTimeOfDay(base, '09:05')!)
    expect(moved.getFullYear()).toBe(2026)
    expect(moved.getMonth()).toBe(8)
    expect(moved.getDate()).toBe(10)
    expect(moved.getHours()).toBe(9)
    expect(moved.getMinutes()).toBe(5)
  })

  it('drops seconds, because the field only offers minutes', () => {
    const moved = new Date(withTimeOfDay(base, '09:05')!)
    expect(moved.getSeconds()).toBe(0)
    expect(moved.getMilliseconds()).toBe(0)
  })

  it('survives the round trip through the input format', () => {
    expect(withTimeOfDay(base, toTimeInput(base))).toBe(
      new Date(2026, 8, 10, 15, 47).getTime(),
    )
  })

  it.each(['', '9:5', '24:00', '10:60', 'nueve', '09:00:00'])('rejects %o', (bad) => {
    expect(withTimeOfDay(base, bad)).toBeNull()
  })
})

describe('resolveEnd', () => {
  it('leaves an ordinary block alone', () => {
    const start = new Date(2026, 8, 10, 9, 0).getTime()
    const end = new Date(2026, 8, 10, 17, 30).getTime()
    expect(resolveEnd(start, end)).toBe(end)
  })

  it('reads an earlier end as a block that ran past midnight', () => {
    const start = new Date(2026, 8, 10, 23, 0).getTime()
    const typed = new Date(2026, 8, 10, 2, 0).getTime()
    const resolved = new Date(resolveEnd(start, typed))
    expect(resolved.getDate()).toBe(11)
    expect(resolved.getHours()).toBe(2)
    expect(resolved.getTime() - start).toBe(3 * HOUR)
  })

  it('never produces a block longer than a day', () => {
    const start = new Date(2026, 8, 10, 12, 0).getTime()
    const typed = new Date(2026, 8, 10, 11, 59).getTime()
    expect(resolveEnd(start, typed) - start).toBeLessThan(24 * HOUR)
  })
})

describe('overlaps', () => {
  const block = (fromHour: number, toHour: number | null) => ({
    startedAt: new Date(2026, 8, 10, fromHour).getTime(),
    endedAt: toHour === null ? null : new Date(2026, 8, 10, toHour).getTime(),
  })

  it('sees two blocks sharing an hour', () => {
    expect(overlaps(block(9, 12), block(11, 13))).toBe(true)
  })

  it('lets blocks touch end to end', () => {
    expect(overlaps(block(9, 12), block(12, 14))).toBe(false)
  })

  it('sees a block swallowed by a longer one', () => {
    expect(overlaps(block(9, 18), block(13, 14))).toBe(true)
  })

  it('leaves separate blocks alone', () => {
    expect(overlaps(block(9, 10), block(15, 16))).toBe(false)
  })

  it('measures a running block up to now', () => {
    const now = new Date(2026, 8, 10, 16).getTime()
    expect(overlaps(block(15, null), block(9, 12), now)).toBe(false)
    expect(overlaps(block(15, null), block(9, 17), now)).toBe(true)
  })
})

describe('shiftDay', () => {
  it('steps back to the previous day at midnight', () => {
    const afternoon = new Date(2026, 8, 11, 15, 30).getTime()
    const before = new Date(shiftDay(afternoon, -1))
    expect(before.getDate()).toBe(10)
    expect(before.getHours()).toBe(0)
    expect(before.getMinutes()).toBe(0)
  })

  it('crosses a month boundary', () => {
    const first = new Date(2026, 8, 1, 9).getTime()
    expect(new Date(shiftDay(first, -1)).getMonth()).toBe(7)
    expect(new Date(shiftDay(first, -1)).getDate()).toBe(31)
  })

  it('crosses a year boundary', () => {
    const newYear = new Date(2026, 0, 1, 9).getTime()
    const before = new Date(shiftDay(newYear, -1))
    expect(before.getFullYear()).toBe(2025)
    expect(before.getMonth()).toBe(11)
    expect(before.getDate()).toBe(31)
  })

  it('steps back and forward to where it started', () => {
    const day = new Date(2026, 8, 11).getTime()
    expect(shiftDay(shiftDay(day, -1), 1)).toBe(day)
  })
})

describe('date fields', () => {
  it('round trips a day through the input format', () => {
    const day = new Date(2026, 8, 11, 18, 42).getTime()
    expect(fromDateInput(toDateInput(day))).toBe(new Date(2026, 8, 11).getTime())
  })

  it('reads the field as a local day, not a UTC one', () => {
    const parsed = new Date(fromDateInput('2026-09-11')!)
    expect(parsed.getFullYear()).toBe(2026)
    expect(parsed.getMonth()).toBe(8)
    expect(parsed.getDate()).toBe(11)
    expect(parsed.getHours()).toBe(0)
  })

  it.each(['', '2026-9-1', '11/09/2026', '2026-13-01', '2026-02-30'])('rejects %o', (bad) => {
    expect(fromDateInput(bad)).toBeNull()
  })
})

describe('isSameDay', () => {
  it('holds across the whole day and stops at midnight', () => {
    const morning = new Date(2026, 8, 11, 0, 0).getTime()
    const night = new Date(2026, 8, 11, 23, 59, 59).getTime()
    expect(isSameDay(morning, night)).toBe(true)
    expect(isSameDay(night, new Date(2026, 8, 12, 0, 0).getTime())).toBe(false)
  })
})

describe('day labels', () => {
  const now = new Date(2026, 8, 11, 10).getTime()

  it('names today and yesterday', () => {
    expect(relativeDayWord(now, now)).toBe('Hoy')
    expect(relativeDayWord(shiftDay(now, -1), now)).toBe('Ayer')
  })

  it('leaves anything older to the date itself', () => {
    expect(relativeDayWord(shiftDay(now, -2), now)).toBeNull()
    expect(relativeDayWord(shiftDay(now, -400), now)).toBeNull()
  })

  it('adds the year only when it is not the current one', () => {
    expect(formatDayName(new Date(2026, 8, 11).getTime(), now)).not.toMatch(/2026/)
    expect(formatDayName(new Date(2025, 8, 11).getTime(), now)).toMatch(/2025/)
  })
})

describe('weeks', () => {
  it('runs Monday to Monday', () => {
    const thursday = new Date(2026, 8, 10, 15).getTime()
    const { start, end } = weekBounds(thursday)
    expect(new Date(start).getDay()).toBe(1)
    expect(new Date(start).getDate()).toBe(7)
    expect(new Date(end).getDate()).toBe(14)
    expect(new Date(end).getHours()).toBe(0)
  })

  it('puts Sunday night in the week that is ending, and Monday in the new one', () => {
    const sunday = new Date(2026, 8, 13, 23, 59).getTime()
    const monday = new Date(2026, 8, 14, 0, 1).getTime()
    expect(weekBounds(sunday).start).not.toBe(weekBounds(monday).start)
    expect(weekBounds(sunday).end).toBe(weekBounds(monday).start)
  })

  it('files a block under the week it started in', () => {
    const late = new Date(2026, 8, 13, 22).getTime()
    const block = entry(late, late + 4 * HOUR)
    expect(startedInWeek(block, new Date(2026, 8, 9).getTime())).toBe(true)
    expect(startedInWeek(block, new Date(2026, 8, 15).getTime())).toBe(false)
  })

  it('numbers weekdays from Monday', () => {
    expect(weekdayIndex(new Date(2026, 8, 14).getTime())).toBe(0)
    expect(weekdayIndex(new Date(2026, 8, 20).getTime())).toBe(6)
  })

  it('names a week inside one month, and one that spans two', () => {
    const now = new Date(2026, 8, 14).getTime()
    expect(formatWeekRange(new Date(2026, 8, 9).getTime(), now)).toBe('7 al 13 de septiembre')
    expect(formatWeekRange(new Date(2026, 8, 30).getTime(), now)).toBe(
      '28 de septiembre al 4 de octubre',
    )
  })
})

describe('groupByDay', () => {
  it('gathers blocks into their days, newest first', () => {
    const monday = new Date(2026, 8, 14, 9).getTime()
    const tuesday = new Date(2026, 8, 15, 9).getTime()
    const groups = groupByDay([
      entry(monday, monday + HOUR),
      entry(tuesday, tuesday + 2 * HOUR),
      entry(monday + 4 * HOUR, monday + 5 * HOUR),
    ])

    expect(groups).toHaveLength(2)
    expect(new Date(groups[0].day).getDate()).toBe(15)
    expect(groups[0].total).toBe(2 * HOUR)
    expect(groups[1].total).toBe(2 * HOUR)
    expect(groups[1].entries).toHaveLength(2)
  })

  it('orders the blocks inside a day newest first', () => {
    const day = new Date(2026, 8, 14, 8).getTime()
    const groups = groupByDay([entry(day, day + HOUR), entry(day + 5 * HOUR, day + 6 * HOUR)])
    expect(groups[0].entries[0].startedAt).toBe(day + 5 * HOUR)
  })

  it('keeps a block that runs past midnight in the day it started', () => {
    const late = new Date(2026, 8, 14, 23).getTime()
    const groups = groupByDay([entry(late, late + 3 * HOUR)])
    expect(groups).toHaveLength(1)
    expect(new Date(groups[0].day).getDate()).toBe(14)
    expect(groups[0].total).toBe(3 * HOUR)
  })

  it('counts a running block up to now', () => {
    const start = new Date(2026, 8, 14, 10).getTime()
    const now = start + 90 * MINUTE
    expect(groupByDay([entry(start, null)], now)[0].total).toBe(90 * MINUTE)
  })
})
