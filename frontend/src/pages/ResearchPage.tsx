import { useState } from 'react'
import { runResearch } from '../lib/api'
import type { ResearchResult, ResearchSource } from '../types'

const placeholder =
  'Contoh: Bandingkan framework React vs Vue vs Svelte untuk tim 5 orang, atau jelaskan terbaru tentang baterai solid-state.'

export default function ResearchPage() {
  const [topic, setTopic] = useState('')
  const [depth, setDepth] = useState<1 | 2 | 3>(2)
  const [sources, setSources] = useState<2 | 3 | 5>(3)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ResearchResult | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const q = topic.trim()
    if (!q || loading) return

    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const r = await runResearch({
        topic: q,
        max_iterations: depth,
        max_sources: sources,
      })
      setResult(r)
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Penelitian gagal. Coba lagi.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4 pb-28 max-w-4xl mx-auto px-4 pt-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          Agent RESEARCH
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Cari → baca sumber → sintesis jawaban dengan sitasi [1] [2]…
        </p>
      </header>

      <form onSubmit={onSubmit} className="space-y-3">
        <textarea
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="w-full resize-y rounded-xl border border-slate-300 bg-white dark:bg-slate-900 dark:border-slate-700 px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
        />
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="block text-slate-600 dark:text-slate-300 mb-1">
              Sumber dibaca per iterasi
            </span>
            <select
              value={sources}
              onChange={(e) => setSources(Number(e.target.value) as 2 | 3 | 5)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
            >
              <option value={2}>2 sumber (cepat)</option>
              <option value={3}>3 sumber (seimbang)</option>
              <option value={5}>5 sumber (mendalam)</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-slate-600 dark:text-slate-300 mb-1">
              Kedalaman (iterasi)
            </span>
            <select
              value={depth}
              onChange={(e) => setDepth(Number(e.target.value) as 1 | 2 | 3)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
            >
              <option value={1}>1x — hasil cepat</option>
              <option value={2}>2x — seimbang</option>
              <option value={3}>3x — mendalam</option>
            </select>
          </label>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Riset bisa 10–30 detik.
          </span>
          <button
            type="submit"
            disabled={loading || !topic.trim()}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-indigo-500 transition"
          >
            {loading ? 'Meneliti…' : 'Mulai Riset'}
          </button>
        </div>
      </form>

      {error && (
        <div className="text-sm p-4 rounded-xl border border-red-200 bg-red-50 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300">
          {error}
        </div>
      )}

      {result && (
        <section className="space-y-5">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Hasil Sintesis</h2>
              <span className="text-xs px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                kedalaman {result.depth} · {result.sources.length} sumber
              </span>
            </div>
            <article className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap leading-relaxed text-slate-800 dark:text-slate-200">
              {result.summary}
            </article>
          </div>

          {result.steps.length > 0 && (
            <details className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
              <summary className="cursor-pointer text-sm font-medium text-slate-600 dark:text-slate-300">
                Jejak langkah penelitian ({result.steps.length})
              </summary>
              <ol className="mt-3 space-y-1 text-sm text-slate-500 dark:text-slate-400 list-decimal pl-5">
                {result.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </details>
          )}

          {result.sources.length > 0 && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Sumber
              </h3>
              <ol className="space-y-2 text-sm">
                {result.sources.map((s, i) => (
                  <SourceItem index={i + 1} key={s.url} source={s} />
                ))}
              </ol>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function SourceItem({
  index,
  source,
}: {
  index: number
  source: ResearchSource
}) {
  const host = (() => {
    try {
      return new URL(source.url).hostname.replace(/^www\./, '')
    } catch {
      return source.url
    }
  })()

  return (
    <li className="flex gap-3 items-start">
      <span className="mt-0.5 inline-flex items-center justify-center w-6 h-6 text-xs rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
        [{index}]
      </span>
      <div className="min-w-0">
        <a
          href={source.url}
          target="_blank"
          rel="noreferrer noopener"
          className="font-medium text-indigo-700 dark:text-indigo-300 hover:underline line-clamp-1"
        >
          {source.title || source.url}
        </a>
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          <span>{host}</span>
          <span>·</span>
          <span
            className={
              source.read
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-amber-600 dark:text-amber-400'
            }
          >
            {source.read ? 'dibaca penuh' : 'hanya cuplikan'}
          </span>
        </div>
        {source.snippet && (
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 line-clamp-3">
            {source.snippet}
          </p>
        )}
      </div>
    </li>
  )
}
