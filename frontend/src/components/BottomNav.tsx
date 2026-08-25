import { NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'

interface NavItem {
  to: string
  label: string
  icon: ReactNode
}

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const items: NavItem[] = [
  {
    to: '/',
    label: 'CORE',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <circle cx="12" cy="12" r="3" />
        <circle cx="12" cy="12" r="8.5" strokeDasharray="4 4" />
      </svg>
    ),
  },
  {
    to: '/research',
    label: 'RESEARCH',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <circle cx="10.5" cy="10.5" r="6" />
        <path d="M15 15l5 5" />
      </svg>
    ),
  },
  {
    to: '/missions',
    label: 'MISSIONS',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <path d="M4 6h16M4 12h10M4 18h13" />
      </svg>
    ),
  },
  {
    to: '/agents',
    label: 'AGENTS',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <circle cx="9" cy="9" r="2.5" />
        <circle cx="16.5" cy="10" r="1.8" />
        <path d="M4 19c.8-2.6 2.7-4 5-4s4.2 1.4 5 4M14.8 15.4c1.9.2 3.6 1.4 4.4 3.6" />
      </svg>
    ),
  },
  {
    to: '/skills',
    label: 'SKILLS',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <circle cx="12" cy="12" r="8.5" strokeDasharray="3.5 3.5" />
        <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
        <path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3" />
      </svg>
    ),
  },
  {
    to: '/more',
    label: 'MORE',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
]

export function BottomNav() {
  return (
    <nav className="glass fixed inset-x-0 bottom-0 z-50 flex justify-around border-t border-cyan-500/20 bg-jarvis-bg/90 backdrop-blur-xl px-1 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] md:hidden">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 rounded-lg py-1 px-2 text-[8px] font-semibold tracking-[0.12em] transition ${
              isActive ? 'bg-jarvis-cyan/10 text-jarvis-cyan text-glow-cyan' : 'text-cyan-200/40 hover:text-cyan-100/70'
            }`
          }
        >
          <span className="h-4 w-4">{item.icon}</span>
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
