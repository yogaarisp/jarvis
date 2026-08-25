import { useMemo } from 'react'
import type { JarvisState } from '../types'

const STATE_META: Record<JarvisState, { color: string; label: string; glow: string }> = {
  IDLE: { color: '#00e5ff', label: 'STANDBY', glow: 'rgba(0,229,255,0.35)' },
  LISTENING: { color: '#22d3ee', label: 'LISTENING', glow: 'rgba(34,211,238,0.55)' },
  THINKING: { color: '#3b82f6', label: 'PROCESSING', glow: 'rgba(59,130,246,0.55)' },
  EXECUTING: { color: '#fbbf24', label: 'EXECUTING', glow: 'rgba(251,191,36,0.55)' },
  SPEAKING: { color: '#d4af37', label: 'SPEAKING', glow: 'rgba(212,175,55,0.55)' },
  COMPLETE: { color: '#34d399', label: 'COMPLETE', glow: 'rgba(52,211,153,0.5)' },
  ERROR: { color: '#f43f5e', label: 'ERROR', glow: 'rgba(244,63,94,0.55)' },
}

function Waveform({ active, color }: { active: boolean; color: string }) {
  const bars = useMemo(
    () => Array.from({ length: 21 }, (_, i) => ({
      delay: (i % 7) * 0.12 + Math.floor(i / 7) * 0.06,
      height: 14 + ((i * 37) % 26),
    })),
    [],
  )

  return (
    <div className="flex h-10 items-center justify-center gap-[3px]" aria-hidden>
      {bars.map((bar, i) => (
        <span
          key={i}
          className={active ? 'wave-bar' : ''}
          style={{
            display: 'block',
            width: 3,
            height: active ? bar.height : 4,
            borderRadius: 9999,
            background: color,
            opacity: active ? 0.85 : 0.25,
            animationDelay: `${bar.delay}s`,
            transition: 'height .4s ease, opacity .4s ease',
            boxShadow: active ? `0 0 8px ${color}` : 'none',
          }}
        />
      ))}
    </div>
  )
}

export function CoreHud({ state }: { state: JarvisState }) {
  const meta = STATE_META[state]
  const busy = state === 'THINKING' || state === 'EXECUTING'

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-[min(24rem,38dvh)] w-[min(24rem,38dvh)] md:h-[min(26rem,40dvh)] md:w-[min(26rem,40dvh)]">
        {/* expanding pulse rings */}
        <span
          className="absolute inset-6 rounded-full animate-ring-ping"
          style={{ border: `1px solid ${meta.color}`, animationDuration: busy ? '1.2s' : '2.8s' }}
        />

        {/* outer dashed ring */}
        <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full animate-spin-slower">
          <circle
            cx="100"
            cy="100"
            r="96"
            fill="none"
            stroke={meta.color}
            strokeOpacity="0.28"
            strokeWidth="1"
            strokeDasharray="4 10"
          />
          <circle
            cx="100"
            cy="100"
            r="88"
            fill="none"
            stroke={meta.color}
            strokeOpacity="0.16"
            strokeWidth="0.75"
            strokeDasharray="60 220"
            strokeLinecap="round"
          />
        </svg>

        {/* middle segmented ring */}
        <svg viewBox="0 0 200 200" className="absolute inset-4 h-[calc(100%-2rem)] w-[calc(100%-2rem)] animate-spin-slow-reverse">
          <circle
            cx="100"
            cy="100"
            r="86"
            fill="none"
            stroke={meta.color}
            strokeOpacity="0.4"
            strokeWidth="2"
            strokeDasharray="120 420"
            strokeLinecap="round"
          />
          {Array.from({ length: 24 }).map((_, i) => (
            <line
              key={i}
              x1="100"
              y1="18"
              x2="100"
              y2={i % 6 === 0 ? '26' : '23'}
              stroke={meta.color}
              strokeOpacity={i % 6 === 0 ? 0.65 : 0.3}
              strokeWidth="1.5"
              transform={`rotate(${i * 15} 100 100)`}
            />
          ))}
        </svg>

        {/* inner tick ring */}
        <svg viewBox="0 0 200 200" className="absolute inset-10 h-[calc(100%-5rem)] w-[calc(100%-5rem)] animate-spin-core">
          <circle
            cx="100"
            cy="100"
            r="90"
            fill="none"
            stroke="#d4af37"
            strokeOpacity="0.22"
            strokeWidth="1"
            strokeDasharray="30 500"
            strokeLinecap="round"
          />
        </svg>

        {/* core orb */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className={`relative flex h-[min(13rem,20dvh)] w-[min(13rem,20dvh)] items-center justify-center rounded-full md:h-[min(14.5rem,22dvh)] md:w-[min(14.5rem,22dvh)] ${busy ? '' : 'animate-core-pulse'}`}
            style={{
              background: `radial-gradient(circle at 38% 32%, ${meta.color}66, ${meta.color}22 45%, transparent 72%)`,
              border: `1px solid ${meta.color}`,
              boxShadow: `0 0 40px ${meta.glow}, inset 0 0 30px ${meta.glow}`,
            }}
          >
            <svg viewBox="0 0 100 100" className="h-full w-full">
              <text
                x="50"
                y="48"
                textAnchor="middle"
                dominantBaseline="central"
                fill={meta.color}
                fontSize="11"
                fontWeight="700"
                letterSpacing="1.2"
              >
                J.A.R.V.I.S
              </text>
              <circle cx="50" cy="66" r="2.5" fill={meta.color} opacity="0.75" />
            </svg>
          </div>
        </div>
      </div>

      <p
        className="font-display mt-2 text-sm font-semibold tracking-[0.45em]"
        style={{ color: meta.color, textShadow: `0 0 14px ${meta.glow}` }}
      >
        {meta.label}
      </p>

      <div className="mt-2">
        <Waveform active={busy || state === 'SPEAKING'} color={meta.color} />
      </div>
    </div>
  )
}

/** Ambient floating particles backdrop */
export function Particles() {
  const particles = useMemo(
    () =>
      Array.from({ length: 24 }, (_, i) => ({
        left: `${(i * 41 + 13) % 100}%`,
        duration: 14 + ((i * 7) % 16),
        delay: -((i * 3.7) % 20),
        size: i % 5 === 0 ? 3 : 2,
      })),
    [],
  )

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
      {particles.map((p, i) => (
        <span
          key={i}
          className="particle"
          style={{
            left: p.left,
            width: p.size,
            height: p.size,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  )
}
