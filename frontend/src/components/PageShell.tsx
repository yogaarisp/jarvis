import type { ReactNode } from 'react'

interface PageShellProps {
  title: string
  subtitle?: string
  children: ReactNode
}

export function PageShell({ title, subtitle, children }: PageShellProps) {
  return (
    <div className="relative z-10 mx-auto w-full max-w-4xl px-4 pb-28 pt-6 md:pb-10">
      <div className="mb-5">
        <h1 className="font-mono-tech text-lg font-bold tracking-[0.3em] text-jarvis-cyan text-glow-cyan">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-xs text-cyan-100/50">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}
