interface Props {
  title: string
  aside?: React.ReactNode
  children: React.ReactNode
}

/** The card the day's list and the totals table both sit in. */
export function Panel({ title, aside, children }: Props) {
  return (
    <section className="overflow-hidden rounded-xl border border-rule bg-card">
      <header className="flex items-baseline justify-between border-b border-rule px-4 py-3">
        <h2 className="text-xs font-semibold tracking-[0.08em] text-graphite uppercase">{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  )
}
