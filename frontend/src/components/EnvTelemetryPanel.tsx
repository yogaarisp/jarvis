import { useEffect, useState } from 'react'
import { getEnvTelemetry } from '../lib/api'
import type { EnvTelemetry } from '../types'

const POLL_MS = 5 * 60 * 1000

const UNKNOWN = '-.-.-.-'

const MASKED_IP = '-.-.-.-'

function formatValue(value: string | null, format: (v: string) => string): string {
  return value === null ? 'N/A' : format(value)
}

function EyeIcon({ closed }: { closed: boolean }) {
  return closed ? (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" x2="22" y1="2" y2="22" />
    </svg>
  ) : (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export function EnvTelemetryPanel() {
  const [data, setData] = useState<EnvTelemetry | null>(null)
  const [offline, setOffline] = useState(false)
  const [showIp, setShowIp] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function poll() {
      try {
        const snapshot = await getEnvTelemetry()
        if (!cancelled) {
          setData(snapshot)
          setOffline(false)
        }
      } catch {
        if (!cancelled) setOffline(true)
      }
    }

    void poll()
    const interval = setInterval(poll, POLL_MS)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  const location = data === null
    ? UNKNOWN
    : formatValue(data.city, (city) => `${city.toUpperCase()}${data.country_code ? `, ${data.country_code}` : ''}`)

  const weather = data === null
    ? UNKNOWN
    : data.temperature_c === null
      ? 'N/A'
      : `${data.temperature_c.toFixed(0)}°C // ${data.condition}`

  const ip = data === null ? UNKNOWN : data.visitor_ip ?? 'N/A'

  return (
    <div className="hud-panel rounded-lg p-3.5 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between pb-1 border-b border-cyan-500/15">
        <div className="flex items-center gap-2">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              offline ? 'bg-rose-500 shadow-[0_0_8px_#f43f5e]' : 'bg-cyan-400 shadow-[0_0_8px_#00e5ff]'
            }`}
          />
          <span className="font-mono-tech text-xs font-bold tracking-[0.18em] text-cyan-400 text-glow-cyan">
            ENV_TELEMETRY
          </span>
        </div>
        <span className="font-mono-tech rounded border border-cyan-500/40 bg-cyan-950/40 px-1.5 py-0.5 text-[9px] font-semibold tracking-wider text-cyan-300">
          {offline ? 'OFFLINE' : 'GLOBAL_NODE · REAL'}
        </span>
      </div>

      {/* Rows */}
      <div className="space-y-1.5 pt-1 font-mono-tech text-[11px]">
        <div className="flex justify-between">
          <span className="text-cyan-400/60 tracking-wider">LOCATION</span>
          <span className="text-cyan-200 font-semibold">{location}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-cyan-400/60 tracking-wider">WEATHER</span>
          <span className="text-cyan-200 font-semibold">{weather}</span>
        </div>
        <div className="flex items-start justify-between gap-2">
          <span className="text-cyan-400/60 tracking-wider shrink-0">VISITOR IP</span>
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={`font-bold ${
                showIp ? 'text-cyan-300 text-glow-cyan break-all text-right' : 'text-cyan-300/70'
              }`}
            >
              {showIp ? ip : MASKED_IP}
            </span>
            <button
              type="button"
              onClick={() => setShowIp((visible) => !visible)}
              aria-label={showIp ? 'Sembunyikan IP' : 'Tampilkan IP'}
              title={showIp ? 'Sembunyikan IP' : 'Tampilkan IP'}
              className="shrink-0 text-cyan-400/60 hover:text-cyan-300 transition-colors cursor-pointer"
            >
              <EyeIcon closed={showIp} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
