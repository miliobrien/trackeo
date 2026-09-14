import {
  formatShort,
  fromDateInput,
  isSameDay,
  relativeDayWord,
  shiftDay,
  toDateInput,
} from '../lib/time'

interface Props {
  day: number
  now: number
  total: number
  onChange: (day: number) => void
  /** Returns to the live day, so the view follows the clock past midnight. */
  onToday: () => void
}

const step =
  'flex size-8 items-center justify-center rounded-md border border-rule text-graphite hover:border-ink hover:text-ink disabled:opacity-30 disabled:hover:border-rule disabled:hover:text-graphite'

export function DayNav({ day, now, total, onChange, onToday }: Props) {
  const viewingToday = isSameDay(day, now)
  const word = relativeDayWord(day, now)

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => onChange(shiftDay(day, -1))} aria-label="Día anterior" className={step}>
        ‹
      </button>
      <button
        type="button"
        onClick={() => onChange(shiftDay(day, 1))}
        // There is nothing to see in the future, and no way to record it.
        disabled={viewingToday}
        aria-label="Día siguiente"
        className={step}
      >
        ›
      </button>

      <input
        type="date"
        value={toDateInput(day)}
        max={toDateInput(now)}
        onChange={(e) => {
          const picked = fromDateInput(e.target.value)
          if (picked !== null) onChange(picked)
        }}
        aria-label="Ir a una fecha"
        className="num h-8 rounded-md border border-rule bg-card px-2 text-xs outline-none focus:border-ink"
      />

      {word && <span className="text-xs text-graphite">{word}</span>}
      {!viewingToday && (
        <button
          type="button"
          onClick={onToday}
          className="text-xs text-graphite underline-offset-4 hover:text-ink hover:underline"
        >
          Volver a hoy
        </button>
      )}

      <span className="num ml-auto text-sm">{formatShort(total)}</span>
    </div>
  )
}
