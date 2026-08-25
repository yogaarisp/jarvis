import { useEffect, useState } from 'react'
import {
  createMemory,
  createSkill,
  deleteMemory,
  deleteSkill,
  listMemories,
  listSkills,
  type MemoryEntry,
  type Skill,
} from '../lib/api'
import { PageShell } from '../components/PageShell'

const SKILL_CATEGORIES = ['GENERAL', 'SERVER', 'DEV', 'DATABASE', 'DEPLOYMENT', 'RESEARCH'] as const
const MEMORY_CATEGORIES = ['USER', 'PROJECT', 'SERVER', 'MISSION'] as const

const catColor: Record<string, string> = {
  GENERAL: 'text-cyan-200/80 border-cyan-200/30',
  SERVER: 'text-emerald-300/80 border-emerald-300/30',
  DEV: 'text-sky-300/80 border-sky-300/30',
  DATABASE: 'text-violet-300/80 border-violet-300/30',
  DEPLOYMENT: 'text-amber-300/80 border-amber-300/30',
  RESEARCH: 'text-rose-300/80 border-rose-300/30',
  USER: 'text-cyan-200/80 border-cyan-200/30',
  PROJECT: 'text-sky-300/80 border-sky-300/30',
  MISSION: 'text-amber-300/80 border-amber-300/30',
}

export default function SkillsPage() {
  const [tab, setTab] = useState<'skills' | 'memory'>('skills')
  const [skills, setSkills] = useState<Skill[]>([])
  const [memories, setMemories] = useState<MemoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)

  // form skill
  const [name, setName] = useState('')
  const [category, setCategory] = useState<string>('GENERAL')
  const [description, setDescription] = useState('')
  const [content, setContent] = useState('')

  // form memory
  const [mKey, setMKey] = useState('')
  const [mValue, setMValue] = useState('')
  const [mCategory, setMCategory] = useState<string>('USER')
  const [mImportant, setMImportant] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [s, m] = await Promise.all([listSkills(), listMemories()])
      setSkills(s)
      setMemories(m)
    } catch {
      setError('Gagal memuat skill & memori.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function submitSkill(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !content.trim()) return
    setError(null)
    try {
      await createSkill({
        name: name.trim(),
        content: content.trim(),
        description: description.trim() || undefined,
        category,
      })
      setName('')
      setDescription('')
      setContent('')
      await load()
    } catch {
      setError('Gagal menyimpan skill.')
    }
  }

  async function submitMemory(e: React.FormEvent) {
    e.preventDefault()
    if (!mKey.trim() || !mValue.trim()) return
    setError(null)
    try {
      await createMemory({
        key: mKey.trim(),
        value: mValue.trim(),
        category: mCategory,
        importance: mImportant ? 3 : 2,
      })
      setMKey('')
      setMValue('')
      setMImportant(false)
      await load()
    } catch {
      setError('Gagal menyimpan memori.')
    }
  }

  async function removeSkill(id: number) {
    await deleteSkill(id)
    await load()
  }

  async function removeMemory(id: number) {
    await deleteMemory(id)
    await load()
  }

  return (
    <PageShell title="SKILLS & MEMORY" subtitle="PRD §17 · Gudang keahlian & ingatan jangka panjang JARVIS">
      <div className="mb-4 flex gap-2">
        {(['skills', 'memory'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-1.5 text-[11px] font-bold tracking-[0.25em] transition ${
              tab === t ? 'bg-jarvis-cyan/15 text-jarvis-cyan' : 'border border-white/10 text-cyan-100/50 hover:text-cyan-100'
            }`}
          >
            {t === 'skills' ? `SKILL (${skills.length})` : `MEMORY (${memories.length})`}
          </button>
        ))}
      </div>

      {error && <p className="mb-3 text-sm text-rose-400">{error}</p>}

      {tab === 'skills' && (
        <>
          <form onSubmit={submitSkill} className="glass mb-5 space-y-3 rounded-2xl p-4">
            <p className="text-[10px] font-bold tracking-[0.3em] text-jarvis-gold">+ SKILL BARU</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nama skill — mis. Deploy Laravel ke VPS"
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-cyan-50 placeholder:text-cyan-200/25 focus:border-jarvis-cyan/40 focus:outline-none"
              />
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-cyan-50 focus:border-jarvis-cyan/40 focus:outline-none"
              >
                {SKILL_CATEGORIES.map((c) => (
                  <option key={c} value={c} className="bg-jarvis-navy">
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Deskripsi singkat (opsional)"
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-cyan-50 placeholder:text-cyan-200/25 focus:border-jarvis-cyan/40 focus:outline-none"
            />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Isi prosedur / langkah-langkah / pengetahuan..."
              rows={4}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-cyan-50 placeholder:text-cyan-200/25 focus:border-jarvis-cyan/40 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!name.trim() || !content.trim()}
              className="rounded-lg border border-jarvis-cyan/40 bg-jarvis-cyan/10 px-4 py-2 text-[11px] font-bold tracking-[0.25em] text-jarvis-cyan transition hover:bg-jarvis-cyan/20 disabled:opacity-30"
            >
              SIMPAN SKILL
            </button>
          </form>

          {loading ? (
            <p className="text-sm text-cyan-200/40">Memuat…</p>
          ) : skills.length === 0 ? (
            <p className="text-sm text-cyan-200/40">
              Belum ada skill. Tambahkan di form atas, atau ketik di chat:
              <span className="text-jarvis-cyan"> skill: Nama | isi prosedur</span>
            </p>
          ) : (
            <div className="space-y-2">
              {skills.map((s) => (
                <div key={s.id} className="glass rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <button onClick={() => setExpanded(expanded === s.id ? null : s.id)} className="min-w-0 flex-1 text-left">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-cyan-50">{s.name}</span>
                        <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold tracking-widest ${catColor[s.category] ?? catColor.GENERAL}`}>
                          {s.category}
                        </span>
                        {s.usage_count > 0 && (
                          <span className="text-[10px] text-cyan-200/40">dipakai {s.usage_count}×</span>
                        )}
                      </div>
                      {s.description && <p className="mt-1 truncate text-xs text-cyan-100/50">{s.description}</p>}
                    </button>
                    <button onClick={() => void removeSkill(s.id)} className="text-xs text-rose-400/70 hover:text-rose-300" title="Hapus">
                      HAPUS
                    </button>
                  </div>
                  {expanded === s.id && (
                    <pre className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg bg-black/40 p-3 text-xs leading-relaxed text-cyan-100/70">
{s.content}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'memory' && (
        <>
          <form onSubmit={submitMemory} className="glass mb-5 space-y-3 rounded-2xl p-4">
            <p className="text-[10px] font-bold tracking-[0.3em] text-jarvis-gold">+ MEMORI BARU</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <input
                value={mKey}
                onChange={(e) => setMKey(e.target.value)}
                placeholder="Kunci — mis. server_utama"
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-cyan-50 placeholder:text-cyan-200/25 focus:border-jarvis-cyan/40 focus:outline-none"
              />
              <select
                value={mCategory}
                onChange={(e) => setMCategory(e.target.value)}
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-cyan-50 focus:border-jarvis-cyan/40 focus:outline-none"
              >
                {MEMORY_CATEGORIES.map((c) => (
                  <option key={c} value={c} className="bg-jarvis-navy">
                    {c}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-xs text-cyan-100/60">
                <input type="checkbox" checked={mImportant} onChange={(e) => setMImportant(e.target.checked)} className="accent-cyan-400" />
                Selalu diingat (penting)
              </label>
            </div>
            <textarea
              value={mValue}
              onChange={(e) => setMValue(e.target.value)}
              placeholder="Isi — mis. VPS Hetzner, IP 116.x.x.x, akses via SSH key"
              rows={2}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-cyan-50 placeholder:text-cyan-200/25 focus:border-jarvis-cyan/40 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!mKey.trim() || !mValue.trim()}
              className="rounded-lg border border-jarvis-cyan/40 bg-jarvis-cyan/10 px-4 py-2 text-[11px] font-bold tracking-[0.25em] text-jarvis-cyan transition hover:bg-jarvis-cyan/20 disabled:opacity-30"
            >
              SIMPAN MEMORI
            </button>
          </form>

          {loading ? (
            <p className="text-sm text-cyan-200/40">Memuat…</p>
          ) : memories.length === 0 ? (
            <p className="text-sm text-cyan-200/40">
              Belum ada memori. Ketik di chat:
              <span className="text-jarvis-cyan"> ingat: kunci = nilai</span>
            </p>
          ) : (
            <div className="space-y-2">
              {memories.map((m) => (
                <div key={m.id} className="glass flex items-start justify-between gap-3 rounded-xl p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-cyan-50">{m.key}</span>
                      <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold tracking-widest ${catColor[m.category] ?? catColor.USER}`}>
                        {m.category}
                      </span>
                      {m.importance >= 3 && <span className="text-[10px] text-jarvis-gold">★ penting</span>}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-cyan-100/60">{m.value}</p>
                  </div>
                  <button onClick={() => void removeMemory(m.id)} className="text-xs text-rose-400/70 hover:text-rose-300" title="Hapus">
                    HAPUS
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </PageShell>
  )
}
