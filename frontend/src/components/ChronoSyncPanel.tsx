import { useEffect, useState } from 'react'

export function ChronoSyncPanel() {
  const [timeStr, setTimeStr] = useState<string>('')
  const [dateStr, setDateStr] = useState<string>('')
  const [msStr, setMsStr] = useState<string>('000')

  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      const yyyy = now.getFullYear()
      const mm = String(now.getMonth() + 1).padStart(2, '0')
      const dd = String(now.getDate()).padStart(2, '0')
      const hh = String(now.getHours()).padStart(2, '0')
      const min = String(now.getMinutes()).padStart(2, '0')
      const ss = String(now.getSeconds()).padStart(2, '0')
      const ms = String(now.getMilliseconds()).padStart(3, '0')

      setDateStr(`${yyyy}.${mm}.${dd}`)
      setTimeStr(`${hh}:${min}:${ss}`)
      setMsStr(ms)
    }

    updateTime()
    const timer = setInterval(updateTime, 47)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="hud-panel rounded-lg p-3.5">
      {/* Header */}
      <div className="flex items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#00e5ff]" />
          <span className="font-mono-tech text-xs font-bold tracking-[0.18em] text-cyan-400 text-glow-cyan">
            JARVIS // TEMPORAL_SYNC
          </span>
        </div>
        <span className="font-mono-tech rounded border border-cyan-500/40 bg-cyan-950/40 px-1.5 py-0.5 text-[9px] font-semibold tracking-wider text-cyan-300">
          CHRONO_LOCK
        </span>
      </div>

      {/* Content */}
      <div className="mt-2 flex items-center justify-between">
        <div>
          <div className="font-mono-tech text-[10px] tracking-[0.25em] text-cyan-300/50">
            SYSTEM TIMESTAMP
          </div>
          <div className="font-mono-tech mt-1 text-sm font-bold tracking-wider text-cyan-100">
            {timeStr ? (
              <>
                <span>{dateStr}</span>
                <span className="mx-1 text-cyan-400/60">//</span>
                <span className="text-cyan-300 text-glow-cyan">{timeStr}</span>
                <span className="text-[11px] text-cyan-400/60">.{msStr}</span>
              </>
            ) : (
              <span className="animate-pulse text-cyan-400">SYNCING_TIME...</span>
            )}
          </div>
        </div>

        {/* Animated Chrono Gear */}
        <div className="relative h-10 w-10 shrink-0">
          <svg viewBox="0 0 100 100" className="h-full w-full animate-spin-core">
            <circle
              cx="50"
              cy="50"
              r="44"
              fill="none"
              stroke="#00e5ff"
              strokeWidth="2"
              strokeDasharray="16 8 8 8"
              strokeOpacity="0.8"
            />
            <circle
              cx="50"
              cy="50"
              r="34"
              fill="none"
              stroke="#00e5ff"
              strokeWidth="1.5"
              strokeDasharray="4 6"
              strokeOpacity="0.4"
            />
            <circle cx="50" cy="50" r="10" fill="none" stroke="#00e5ff" strokeWidth="2" />
            <circle cx="50" cy="50" r="3" fill="#00e5ff" />
          </svg>
        </div>
      </div>
    </div>
  )
}
