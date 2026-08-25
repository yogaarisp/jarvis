import { useEffect, useState } from 'react'
import { getSystemTelemetry } from '../lib/api'
import type { SystemTelemetry } from '../types'

const POLL_MS = 5000

function formatUptime(seconds: number | null): string {
  if (seconds === null) return 'N/A'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}h ${h}j`
  if (h > 0) return `${h}j ${m}m`
  return `${m}m`
}

export function SysHardwarePanel() {
  const [data, setData] = useState<SystemTelemetry | null>(null)
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function poll() {
      try {
        const snapshot = await getSystemTelemetry()
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

  const cpu = data?.cpu_percent ?? null
  const ram = data?.ram_used_percent ?? null
  const disk = data?.disk_used_percent ?? null

  return (
    <div className="hud-panel rounded-lg p-3.5 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between pb-1 border-b border-cyan-500/15">
        <div className="flex items-center gap-2">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              offline ? 'bg-rose-500 shadow-[0_0_8px_#f43f5e]' : 'bg-cyan-400 shadow-[0_0_8px_#00e5ff]'
            }`}
          />
          <span className="font-mono-tech text-xs font-bold tracking-[0.18em] text-cyan-400 text-glow-cyan">
            SYS_HARDWARE
          </span>
        </div>
        <span className="font-mono-tech rounded border border-cyan-500/40 bg-cyan-950/40 px-1.5 py-0.5 text-[9px] font-semibold tracking-wider text-cyan-300">
          {offline ? 'OFFLINE' : 'TELEMETRY · REAL'}
        </span>
      </div>

      {/* CPU Item */}
      <div className="space-y-1">
        <div className="flex justify-between font-mono-tech text-[11px] font-medium tracking-wider">
          <span className="text-cyan-200/70">CPU LOAD{data?.cores ? ` (${data.cores} CORES)` : ''}</span>
          <span className="text-cyan-300 font-bold">{cpu !== null ? `${cpu.toFixed(1)}%` : 'N/A'}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-cyan-950/60 border border-cyan-500/20">
          <div
            className="h-full bg-gradient-to-r from-cyan-600 via-cyan-400 to-cyan-300 shadow-[0_0_8px_#00e5ff] transition-all duration-700 ease-out"
            style={{ width: `${cpu ?? 0}%` }}
          />
        </div>
        <div className="flex justify-between font-mono-tech text-[9px] text-cyan-400/50">
          <span>CORE TEMP</span>
          <span>{data?.temperature_c !== null && data?.temperature_c !== undefined ? `${data.temperature_c.toFixed(1)}°C` : 'N/A'}</span>
        </div>
      </div>

      {/* RAM Item */}
      <div className="space-y-1">
        <div className="flex justify-between font-mono-tech text-[11px] font-medium tracking-wider">
          <span className="text-cyan-200/70">RAM{data?.ram_total_mb ? ` (${(data.ram_total_mb / 1024).toFixed(0)} GB)` : ''}</span>
          <span className="text-cyan-300 font-bold">{ram !== null ? `${ram.toFixed(1)}%` : 'N/A'}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-cyan-950/60 border border-cyan-500/20">
          <div
            className="h-full bg-gradient-to-r from-cyan-600 via-cyan-400 to-cyan-300 shadow-[0_0_8px_#00e5ff] transition-all duration-700 ease-out"
            style={{ width: `${ram ?? 0}%` }}
          />
        </div>
      </div>

      {/* Disk Item (real, menggantikan GPU yang tidak tersedia di VM) */}
      <div className="space-y-1">
        <div className="flex justify-between font-mono-tech text-[11px] font-medium tracking-wider">
          <span className="text-cyan-200/70">DISK{data?.disk_total_gb ? ` (${data.disk_total_gb} GB)` : ''}</span>
          <span className="text-cyan-300 font-bold">{disk !== null ? `${disk.toFixed(1)}%` : 'N/A'}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-cyan-950/60 border border-cyan-500/20">
          <div
            className="h-full bg-gradient-to-r from-cyan-600 via-cyan-400 to-cyan-300 shadow-[0_0_8px_#00e5ff] transition-all duration-700 ease-out"
            style={{ width: `${disk ?? 0}%` }}
          />
        </div>
        <div className="flex justify-between font-mono-tech text-[9px] text-cyan-400/50">
          <span>{data ? `${data.hostname} · ${data.platform}` : '—'}</span>
          <span>UPTIME {formatUptime(data?.uptime_seconds ?? null)}</span>
        </div>
      </div>
    </div>
  )
}
