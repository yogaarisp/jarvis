import { useCallback, useEffect, useRef, useState } from 'react'
import { api, streamMission } from '../lib/api'
import type { Agent, Mission, MissionStatus, MissionStep, StepStatus } from '../types'

const STATUS_STYLE: Record<MissionStatus, string> = {
  queued: 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200',
  running: 'border-jarvis-cyan/50 bg-jarvis-cyan/10 text-jarvis-cyan animate-pulse',
  waiting_approval: 'border-jarvis-gold/50 bg-jarvis-gold/10 text-jarvis-gold',
  completed: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300',
  failed: 'border-jarvis-danger/50 bg-jarvis-danger/10 text-rose-300',
  cancelled: 'border-white/20 bg-white/5 text-cyan-100/50',
}

const STATUS_LABEL: Record<MissionStatus, string> = {
  queued: 'QUEUED',
  running: 'RUNNING',
  waiting_approval: 'WAITING APPROVAL',
  completed: 'COMPLETED',
  failed: 'FAILED',
  cancelled: 'CANCELLED',
}

const STEP_DOT: Record<StepStatus, string> = {
  pending: 'bg-white/20',
  running: 'bg-jarvis-cyan shadow-[0_0_8px_rgba(0,229,255,0.9)] animate-pulse',
  completed: 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]',
  failed: 'bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.9)]',
  skipped: 'bg-white/30',
}

function formatOutput(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = JSON.stringify(value)
  return text.length > 220 ? `${text.slice(0, 220)}…` : text
}

/* ------------------------------------------------------------------ */

interface DraftStep {
  name: string
  tool: string
  paramsText: string
}

const EMPTY_STEP: DraftStep = { name: '', tool: '', paramsText: '' }

function CreateMissionForm({
  agents,
  onCreated,
}: {
  agents: Agent[]
  onCreated: (mission: Mission, requiresApproval: boolean) => void
}) {
  const [agentKey, setAgentKey] = useState('')
  const [title, setTitle] = useState('')
  const [steps, setSteps] = useState<DraftStep[]>([{ ...EMPTY_STEP }])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const agent = agents.find((a) => a.key === agentKey)

  const setStep = (index: number, patch: Partial<DraftStep>) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  }

  const submit = async () => {
    setError(null)

    if (!agent) {
      setError('Pilih agent terlebih dahulu.')
      return
    }

    let payloadSteps: Array<{ name: string; tool: string; params?: Record<string, unknown> }>

    try {
      payloadSteps = steps.map((s) => {
        if (!s.name.trim() || !s.tool) throw new Error('Setiap langkah butuh nama dan tool.')
        let params: Record<string, unknown> | undefined
        if (s.paramsText.trim()) params = JSON.parse(s.paramsText)
        return { name: s.name.trim(), tool: s.tool, ...(params ? { params } : {}) }
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Params harus JSON valid.')
      return
    }

    setBusy(true)
    try {
      const res = await api.post<{ mission: Mission; requires_approval: boolean }>('/missions', {
        agent_key: agent.key,
        title: title.trim() || `Misi ${agent.name}`,
        steps: payloadSteps,
      })
      onCreated(res.data.mission, res.data.requires_approval)
      // reset ringan
      setTitle('')
      setSteps([{ ...EMPTY_STEP }])
    } catch (e) {
      const message =
        (e as { response?: { data?: { message?: string } } }).response?.data?.message ??
        'Gagal membuat misi.'
      setError(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex flex-col gap-4 md:flex-row">
        {/* Agent picker */}
        <label className="block flex-1">
          <span className="mb-1 block text-[10px] uppercase tracking-[0.3em] text-cyan-200/60">
            Agent
          </span>
          <select
            value={agentKey}
            onChange={(e) => {
              setAgentKey(e.target.value)
              setSteps((prev) => prev.map((s) => ({ ...s, tool: '' })))
            }}
            className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-cyan-100 outline-none focus:border-jarvis-cyan/60"
          >
            <option value="">— pilih agent —</option>
            {agents.map((a) => (
              <option key={a.key} value={a.key}>
                {a.name} ({a.permission_level.toUpperCase()})
              </option>
            ))}
          </select>
        </label>

        {/* Title */}
        <label className="block flex-1">
          <span className="mb-1 block text-[10px] uppercase tracking-[0.3em] text-cyan-200/60">
            Judul misi
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={agent ? `Misi ${agent.name}` : 'Judul opsional'}
            className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-cyan-100 placeholder:text-cyan-100/25 outline-none focus:border-jarvis-cyan/60"
          />
        </label>
      </div>

      {/* Steps */}
      <div className="mt-4 space-y-3">
        {steps.map((step, i) => (
          <div key={i} className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="flex items-center gap-2">
              <span className="font-display text-xs text-jarvis-gold">
                #{i + 1}
              </span>
              <input
                value={step.name}
                onChange={(e) => setStep(i, { name: e.target.value })}
                placeholder="Nama langkah…"
                className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-cyan-100 placeholder:text-cyan-100/25 outline-none focus:border-jarvis-cyan/60"
              />
              <select
                value={step.tool}
                onChange={(e) => setStep(i, { tool: e.target.value })}
                disabled={!agent}
                className="rounded-md border border-white/10 bg-black/40 px-2 py-1.5 font-mono text-xs text-cyan-100 outline-none focus:border-jarvis-cyan/60 disabled:opacity-40"
              >
                <option value="">tool…</option>
                {(agent?.allowed_tools ?? []).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              {steps.length > 1 && (
                <button
                  type="button"
                  onClick={() => setSteps((prev) => prev.filter((_, idx) => idx !== i))}
                  className="rounded-md px-2 py-1 text-xs text-rose-300/70 hover:bg-rose-500/10"
                >
                  ✕
                </button>
              )}
            </div>
            <input
              value={step.paramsText}
              onChange={(e) => setStep(i, { paramsText: e.target.value })}
              placeholder='params JSON (opsional), contoh: {"query":"laragon"}'
              className="mt-2 w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 font-mono text-xs text-cyan-100/80 placeholder:text-cyan-100/20 outline-none focus:border-jarvis-cyan/60"
            />
          </div>
        ))}

        {agent && steps.length < 10 && (
          <button
            type="button"
            onClick={() => setSteps((prev) => [...prev, { ...EMPTY_STEP }])}
            className="text-xs tracking-[0.2em] text-jarvis-cyan/80 hover:text-jarvis-cyan"
          >
            + TAMBAH LANGKAH
          </button>
        )}
      </div>

      {error && <p className="mt-3 text-xs text-rose-300">{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={busy || !agent}
        className="font-display mt-4 w-full rounded-xl border border-jarvis-cyan/40 bg-jarvis-cyan/10 py-2.5 text-xs font-bold tracking-[0.35em] text-jarvis-cyan transition hover:bg-jarvis-cyan/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? 'MEMPROSES…' : agent?.permission_level === 'dangerous' ? 'BUAT MISI (PERLU APPROVAL)' : 'BUAT & ANTRIKAN'}
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function StepTimeline({ steps }: { steps: MissionStep[] }) {
  return (
    <ol className="relative ml-2 space-y-4 border-l border-white/10 pl-6">
      {steps.map((step) => (
        <li key={step.id} className="relative">
          <span
            className={`absolute -left-[31px] top-1 h-2.5 w-2.5 rounded-full ${STEP_DOT[step.status]}`}
          />
          <p className="text-sm text-cyan-100/90">
            <span className="font-display mr-2 text-[10px] text-jarvis-gold">
              #{step.step_order}
            </span>
            {step.name}
          </p>
          <p className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-cyan-100/45">
            {step.tool}
            <span className="text-[10px] uppercase tracking-widest">{step.status}</span>
          </p>
          {step.output && (
            <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all rounded-md border border-white/5 bg-black/30 px-2 py-1 font-mono text-[11px] leading-relaxed text-cyan-100/55">
              {formatOutput(step.output)}
            </pre>
          )}
        </li>
      ))}
    </ol>
  )
}

/* ------------------------------------------------------------------ */

export function MissionsPage() {
  const [missions, setMissions] = useState<Mission[] | null>(null)
  const [agents, setAgents] = useState<Agent[]>([])
  const [detail, setDetail] = useState<Mission | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [streamError, setStreamError] = useState<string | null>(null)
  const [watching, setWatching] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const loadMissions = useCallback(() => {
    api.get<{ missions: Mission[] }>('/missions')
      .then((res) => setMissions(res.data.missions))
      .catch(() => setMissions([]))
  }, [])

  useEffect(() => {
    loadMissions()
    api.get<{ agents: Agent[] }>('/agents')
      .then((res) => setAgents(res.data.agents.filter((a) => a.status === 'active')))
      .catch(() => setAgents([]))

    return () => abortRef.current?.abort()
  }, [loadMissions])

  const openDetail = async (id: number) => {
    setStreamError(null)
    try {
      const res = await api.get<{ mission: Mission }>(`/missions/${id}`)
      setDetail(res.data.mission)
    } catch {
      setStreamError('Gagal memuat detail misi.')
    }
  }

  const watchStream = async (id: number) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setWatching(true)
    setStreamError(null)

    try {
      await streamMission(id, {
        onMeta: (mission) => setDetail(mission as unknown as Mission),
        onStatus: (status) =>
          setDetail((prev) => (prev ? { ...prev, status: status as MissionStatus } : prev)),
        onStep: (step) =>
          setDetail((prev) =>
            prev
              ? {
                  ...prev,
                  steps: (prev.steps ?? []).map((s) =>
                    s.id === step.id ? (step as unknown as MissionStep) : s,
                  ),
                }
              : prev,
          ),
        onDone: () => loadMissions(),
        onError: (message) => setStreamError(message),
      }, controller.signal)
    } catch (e) {
      if (!controller.signal.aborted) {
        setStreamError(e instanceof Error ? e.message : 'Koneksi stream gagal.')
      }
    } finally {
      setWatching(false)
      loadMissions()
    }
  }

  const act = async (id: number, action: 'approve' | 'cancel') => {
    try {
      await api.post(`/missions/${id}/${action}`)
      await openDetail(id)
      loadMissions()
    } catch (e) {
      const message =
        (e as { response?: { data?: { message?: string } } }).response?.data?.message ??
        'Aksi gagal.'
      setStreamError(message)
    }
  }

  const onCreated = async (mission: Mission, requiresApproval: boolean) => {
    setShowForm(false)
    loadMissions()

    if (requiresApproval) {
      await openDetail(mission.id)
    } else {
      await openDetail(mission.id)
      void watchStream(mission.id)
    }
  }

  /* ------------------------------------------------------------------ */

  return (
    <div className="relative z-10 mx-auto w-full max-w-4xl px-4 pb-28 pt-6 md:pb-10">
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-lg font-bold tracking-[0.35em] text-jarvis-cyan text-glow-cyan">
            MISSION CONTROL
          </h1>
          <p className="mt-1 text-xs text-cyan-100/50">
            Tugas multi-langkah yang dieksekusi agent melalui Hermes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="font-display shrink-0 rounded-full border border-jarvis-gold/40 bg-jarvis-gold/10 px-4 py-2 text-[10px] font-bold tracking-[0.3em] text-jarvis-gold transition hover:bg-jarvis-gold/20"
        >
          {showForm ? 'TUTUP' : '+ MISI BARU'}
        </button>
      </header>

      {showForm && agents.length > 0 && (
        <div className="mb-6">
          <CreateMissionForm agents={agents} onCreated={onCreated} />
        </div>
      )}

      {/* Detail panel */}
      {detail && (
        <div className="glass mb-6 rounded-2xl p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-bold tracking-wider text-cyan-100">
                {detail.title}
              </h2>
              <p className="mt-0.5 text-[11px] uppercase tracking-[0.3em] text-cyan-200/50">
                AGENT: {detail.agent_key.toUpperCase()}
              </p>
            </div>
            <span
              className={`rounded-full border px-3 py-1 text-[9px] font-bold tracking-[0.3em] ${STATUS_STYLE[detail.status]}`}
            >
              {STATUS_LABEL[detail.status]}
            </span>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {detail.status === 'queued' && !watching && (
              <button
                type="button"
                onClick={() => watchStream(detail.id)}
                className="font-display rounded-lg border border-jarvis-cyan/40 bg-jarvis-cyan/10 px-4 py-1.5 text-[10px] font-bold tracking-[0.3em] text-jarvis-cyan hover:bg-jarvis-cyan/20"
              >
                JALANKAN
              </button>
            )}
            {detail.status === 'waiting_approval' && (
              <>
                <button
                  type="button"
                  onClick={() => act(detail.id, 'approve')}
                  className="font-display rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-4 py-1.5 text-[10px] font-bold tracking-[0.3em] text-emerald-300 hover:bg-emerald-400/20"
                >
                  APPROVE
                </button>
                <button
                  type="button"
                  onClick={() => act(detail.id, 'cancel')}
                  className="font-display rounded-lg border border-jarvis-danger/40 bg-jarvis-danger/10 px-4 py-1.5 text-[10px] font-bold tracking-[0.3em] text-rose-300 hover:bg-jarvis-danger/20"
                >
                  CANCEL
                </button>
              </>
            )}
            {detail.status === 'running' && watching && (
              <span className="text-[11px] tracking-widest text-jarvis-cyan/70">
                MEMANTAU PROGRES…
              </span>
            )}
            {(detail.status === 'completed' || detail.status === 'failed') &&
              detail.result_summary && (
                <span className="font-mono text-[11px] text-cyan-100/50">
                  {formatOutput(detail.result_summary)}
                </span>
              )}
          </div>

          {streamError && <p className="mt-3 text-xs text-rose-300">{streamError}</p>}

          {(detail.steps?.length ?? 0) > 0 && (
            <div className="mt-5">
              <StepTimeline steps={detail.steps!} />
            </div>
          )}
        </div>
      )}

      {/* List */}
      {missions === null ? (
        <div className="glass rounded-2xl p-6 text-center">
          <p className="font-display animate-pulse text-xs tracking-[0.4em] text-jarvis-cyan/80">
            MEMINDAI MISI…
          </p>
        </div>
      ) : missions.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center">
          <p className="text-sm text-cyan-100/50">
            Belum ada misi. Tekan <span className="text-jarvis-gold">+ MISI BARU</span> untuk
            membuat tugas pertama.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {missions.map((mission) => (
            <li key={mission.id}>
              <button
                type="button"
                onClick={() => openDetail(mission.id)}
                className={`glass w-full rounded-2xl px-5 py-4 text-left transition hover:border-jarvis-cyan/40 ${
                  detail?.id === mission.id ? 'border-jarvis-cyan/50' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-cyan-100/90">{mission.title}</p>
                    <p className="mt-0.5 text-[10px] uppercase tracking-[0.25em] text-cyan-200/40">
                      {mission.agent_key} ·{' '}
                      {new Date(mission.created_at ?? Date.now()).toLocaleString('id-ID')}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-[9px] font-bold tracking-[0.25em] ${STATUS_STYLE[mission.status]}`}
                  >
                    {STATUS_LABEL[mission.status]}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
