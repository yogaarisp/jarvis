export function PlaceholderPage({
  title,
  phase,
  description,
}: {
  title: string
  phase: string
  description: string
}) {
  return (
    <div className="relative z-10 flex min-h-dvh items-center justify-center p-4">
      <div className="glass scanline relative w-full max-w-md overflow-hidden rounded-2xl p-8 text-center">
        <p className="font-display text-[10px] font-semibold tracking-[0.45em] text-jarvis-gold/80">
          MODUL TERKUNCI
        </p>
        <h1 className="font-display mt-2 text-xl font-bold tracking-[0.25em] text-jarvis-cyan text-glow-cyan">
          {title}
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-cyan-100/60">{description}</p>
        <span className="font-display mt-6 inline-block rounded-full border border-jarvis-cyan/30 bg-jarvis-cyan/10 px-5 py-1.5 text-[11px] font-bold tracking-[0.3em] text-jarvis-cyan">
          {phase}
        </span>
      </div>
    </div>
  )
}
