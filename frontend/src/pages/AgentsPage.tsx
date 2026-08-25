import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { Agent } from '../types'

const PERMISSION_STYLE: Record<Agent['permission_level'], string> = {
  read: 'border-jarvis-cyan/40 bg-jarvis-cyan/10 text-jarvis-cyan',
  controlled: 'border-jarvis-gold/40 bg-jarvis-gold/10 text-jarvis-gold',
  dangerous: 'border-jarvis-danger/40 bg-jarvis-danger/10 text-rose-300',
}

const PERMISSION_LABEL: Record<Agent['permission_level'], string> = {
  read: 'READ',
  controlled: 'CONTROLLED',
  dangerous: 'DANGEROUS',
}

function AgentCard({ agent }: { agent: Agent }) {
  const active = agent.status === 'active'

  return (
    <div className="glass relative overflow-hidden rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-bold tracking-[0.25em] text-jarvis-cyan">
            {agent.name}
          </h2>
          <p className="mt-0.5 text-[11px] uppercase tracking-[0.3em] text-cyan-200/50">
            {agent.role}
          </p>
        </div>
        <span
          className={`mt-1 flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.2em] ${
            active ? 'text-emerald-300' : 'text-cyan-100/40'
          }`}
        >
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              active ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]' : 'bg-cyan-100/30'
            }`}
          />
          {active ? 'AKTIF' : 'OFFLINE'}
        </span>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-cyan-100/70">{agent.description}</p>

      {(agent.allowed_tools?.length ?? 0) > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {agent.allowed_tools!.map((tool) => (
            <span
              key={tool}
              className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[10px] text-cyan-100/60"
            >
              {tool}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 border-t border-white/5 pt-3">
        <span
          className={`inline-block rounded-full border px-3 py-1 text-[9px] font-bold tracking-[0.3em] ${
            PERMISSION_STYLE[agent.permission_level]
          }`}
        >
          {PERMISSION_LABEL[agent.permission_level]}
        </span>
      </div>
    </div>
  )
}

export function AgentsPage() {
  const [agents, setAgents] = useState<Agent[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    api
      .get<{ agents: Agent[] }>('/agents')
      .then((res) => setAgents(res.data.agents))
      .catch(() => setError(true))
  }, [])

  return (
    <div className="relative z-10 mx-auto w-full max-w-4xl px-4 pb-28 pt-6 md:pb-10">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="font-display text-lg font-bold tracking-[0.35em] text-jarvis-cyan text-glow-cyan">
            AGENT REGISTRY
          </h1>
          <p className="mt-1 text-xs text-cyan-100/50">
            Unit spesialis yang siap dieksekusi melalui Hermes.
          </p>
        </div>
        <span className="font-display hidden rounded-full border border-jarvis-gold/40 bg-jarvis-gold/10 px-3 py-1 text-[10px] font-bold tracking-[0.3em] text-jarvis-gold sm:block">
          PHASE 4
        </span>
      </header>

      {error && (
        <div className="glass rounded-2xl p-6 text-center text-sm text-rose-300/80">
          Gagal memuat registry. Pastikan backend berjalan, lalu muat ulang.
        </div>
      )}

      {!error && agents === null && (
        <div className="glass rounded-2xl p-6 text-center">
          <p className="font-display animate-pulse text-xs tracking-[0.4em] text-jarvis-cyan/80">
            MEMINDAI REGISTRY…
          </p>
        </div>
      )}

      {agents && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  )
}
