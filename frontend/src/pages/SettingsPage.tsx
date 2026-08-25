import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getSettings,
  getWakeSettings,
  testAiConnection,
  testHermesConnection,
  updateSettings,
  updateWakeSettings,
} from '../lib/api'
import type {
  AppSettingItem,
  AppSettingsBundle,
  ConnectionTest,
  VoicePrefs,
  WakeSettings,
} from '../types'
import { SettingsPanel } from '../components/SettingsPanel'
import {
  DEFAULT_VOICE_PREFS,
  isSttAvailable,
  isTtsAvailable,
  loadVoicePrefs,
  saveVoicePrefs,
} from '../lib/voice'
import { WakeEngine } from '../lib/wake'

const DEFAULT_WAKE: WakeSettings = {
  clap_enabled: false,
  claps_required: 2,
  sensitivity: 'medium',
  window_ms: 650,
  cooldown_ms: 2000,
}

type TabKey = 'ai' | 'hermes' | 'jarvis' | 'voice' | 'wake'

const TABS: { key: TabKey; label: string; desc: string }[] = [
  { key: 'ai', label: 'AI · 9Router', desc: 'Provider default, Base URL, API Key, model, timeout.' },
  { key: 'hermes', label: 'Hermes', desc: 'Worker eksekusi tool & agent eksternal.' },
  { key: 'jarvis', label: 'JARVIS', desc: 'System prompt dan batas riset default.' },
  { key: 'voice', label: 'Voice', desc: 'STT / TTS (semua diproses lokal browser).' },
  { key: 'wake', label: 'Wake Engine', desc: 'Double/triple clap wake via mic lokal.' },
]

export default function SettingsPage({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<TabKey>('ai')
  const [bundle, setBundle] = useState<AppSettingsBundle | null>(null)
  const [form, setForm] = useState<Record<string, unknown>>({})
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [aiTest, setAiTest] = useState<ConnectionTest | null>(null)
  const [aiTestLoading, setAiTestLoading] = useState(false)
  const [hermesTest, setHermesTest] = useState<ConnectionTest | null>(null)
  const [hermesTestLoading, setHermesTestLoading] = useState(false)
  const [voicePrefs, setVoicePrefs] = useState<VoicePrefs>(DEFAULT_VOICE_PREFS)
  const [wakeSettings, setWakeSettings] = useState<WakeSettings>(DEFAULT_WAKE)
  const [wakeRunning, setWakeRunning] = useState(false)
  const [wakeError, setWakeError] = useState<string | null>(null)
  const [micLevel, setMicLevel] = useState(0)
  const wakeRef = useRef<WakeEngine | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [b, ws] = await Promise.all([getSettings(), getWakeSettings()])
      setBundle(b)
      setWakeSettings({ ...DEFAULT_WAKE, ...ws })
      setForm(() => {
        const next: Record<string, unknown> = {}
        for (const key in b.items) {
          next[key] = b.items[key].secret ? '' : b.items[key].value
        }
        return next
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat pengaturan.')
    } finally {
      setLoading(false)
    }
    setVoicePrefs(loadVoicePrefs())
  }, [])

  useEffect(() => {
    load()
    return () => {
      wakeRef.current?.stop()
    }
  }, [load])

  useEffect(() => {
    saveVoicePrefs(voicePrefs)
  }, [voicePrefs])

  // Sync setting wake ke backend + wake engine saat berubah.
  useEffect(() => {
    if (wakeSettings.id) {
      updateWakeSettings(wakeSettings).catch(() => undefined)
    }
    if (wakeRef.current) wakeRef.current.updateSettings(wakeSettings)
  }, [
    wakeSettings.clap_enabled,
    wakeSettings.claps_required,
    wakeSettings.sensitivity,
    wakeSettings.window_ms,
    wakeSettings.cooldown_ms,
    wakeSettings.id,
  ])

  async function onSaveAppSettings() {
    setSaving(true)
    setError(null)
    setSaveMsg(null)
    try {
      const res = await updateSettings(form)
      setSaveMsg(`Tersimpan ${res.saved.length} pengaturan.`)
      if (bundle) {
        setBundle({ ...bundle, items: res.items })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan.')
    } finally {
      setSaving(false)
    }
  }

  async function onTestAi() {
    setAiTestLoading(true)
    try {
      const res = await testAiConnection()
      setAiTest(res)
    } catch (e) {
      setAiTest({
        ok: false,
        message: e instanceof Error ? e.message : 'Gagal tes koneksi.',
        latency_ms: null,
      })
    } finally {
      setAiTestLoading(false)
    }
  }

  async function onTestHermes() {
    setHermesTestLoading(true)
    try {
      const res = await testHermesConnection()
      setHermesTest(res)
    } catch (e) {
      setHermesTest({
        ok: false,
        message: e instanceof Error ? e.message : 'Gagal tes koneksi.',
        latency_ms: null,
      })
    } finally {
      setHermesTestLoading(false)
    }
  }

  async function onToggleWake(want: boolean) {
    setWakeError(null)
    if (want) {
      if (!wakeRef.current) {
        const engine = new WakeEngine(wakeSettings)
        engine.onError = (m) => setWakeError(m)
        engine.onReady = () => setWakeRunning(true)
        engine.onStopped = () => setWakeRunning(false)
        engine.onLevel = (rms) => setMicLevel(rms)
        engine.onWake = ({ claps }) => {
          console.info('[Wake]', claps, 'tepukan — OK')
        }
        wakeRef.current = engine
      }
      await wakeRef.current.start()
    } else {
      wakeRef.current?.stop()
    }
  }

  const groups = bundle?.groups ?? {}
  const items = bundle?.items ?? {}

  const itemsByGroup = useMemo(() => {
    const map: Record<string, AppSettingItem[]> = {}
    for (const key in items) {
      const it = items[key]
      if (!map[it.group]) map[it.group] = []
      map[it.group].push(it)
    }
    return map
  }, [items])

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="glass w-full sm:max-w-3xl rounded-t-3xl sm:rounded-2xl max-h-[92vh] overflow-y-auto border border-jarvis-cyan/20"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-8">
      <header className="flex items-end justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            Pengaturan Sistem
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            API key disimpan di server dan tidak pernah dikirim kembali ke frontend.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!loading && (
            <button
              onClick={load}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Muat ulang
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Tutup"
            className="w-9 h-9 rounded-lg border border-white/10 hover:bg-white/5 text-cyan-100/80"
          >
            ✕
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-5 border-b border-slate-200 dark:border-slate-800 pb-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-xs font-semibold tracking-wide rounded-t-lg border-b-2 transition ${
              tab === t.key
                ? 'border-jarvis-cyan text-jarvis-cyan'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="text-sm text-slate-500">Memuat pengaturan…</div>
      )}

      {error && (
        <div className="mb-4 p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {saveMsg && (
        <div className="mb-4 p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300 text-sm">
          {saveMsg}
        </div>
      )}

      {!loading && tab === 'ai' && bundle && (
        <Section
          title={groups['ai']}
          items={itemsByGroup['ai'] ?? []}
          form={form}
          setForm={setForm}
        >
          <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-slate-200 dark:border-slate-800 mt-4">
            <button
              onClick={onSaveAppSettings}
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium disabled:opacity-50"
            >
              {saving ? 'Menyimpan…' : 'Simpan Pengaturan AI'}
            </button>
            <button
              onClick={onTestAi}
              disabled={aiTestLoading}
              className="px-5 py-2.5 rounded-xl border border-indigo-300 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-sm disabled:opacity-50"
            >
              {aiTestLoading ? 'Mencoba…' : 'Tes Koneksi AI'}
            </button>
          </div>
          {aiTest && <TestResult test={aiTest} />}
        </Section>
      )}

      {!loading && tab === 'hermes' && bundle && (
        <Section
          title={groups['hermes']}
          items={itemsByGroup['hermes'] ?? []}
          form={form}
          setForm={setForm}
        >
          <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-slate-200 dark:border-slate-800 mt-4">
            <button
              onClick={onSaveAppSettings}
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium disabled:opacity-50"
            >
              {saving ? 'Menyimpan…' : 'Simpan Pengaturan Hermes'}
            </button>
            <button
              onClick={onTestHermes}
              disabled={hermesTestLoading}
              className="px-5 py-2.5 rounded-xl border border-indigo-300 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-sm disabled:opacity-50"
            >
              {hermesTestLoading ? 'Mencoba…' : 'Tes Koneksi Hermes'}
            </button>
          </div>
          {hermesTest && <TestResult test={hermesTest} />}
        </Section>
      )}

      {!loading && tab === 'jarvis' && bundle && (
        <Section
          title={groups['jarvis']}
          items={itemsByGroup['jarvis'] ?? []}
          form={form}
          setForm={setForm}
        >
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 mt-4">
            <button
              onClick={onSaveAppSettings}
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium disabled:opacity-50"
            >
              {saving ? 'Menyimpan…' : 'Simpan Pengaturan JARVIS'}
            </button>
          </div>
        </Section>
      )}

      {tab === 'voice' && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold tracking-widest text-slate-600 dark:text-slate-400">
            VOICE · STT / TTS
          </h2>
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-1 overflow-hidden">
            {/* Reuse SettingsPanel yang sama dengan CorePage tapi render inline tanpa modal. */}
            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Shortcut press-to-talk: <strong>tahan Space</strong> lalu bicara (lepas = kirim).
                Atau klik tombol mic di input perintah pada halaman CORE.
              </p>
              <CapabilitiesRow stt={isSttAvailable()} tts={isTtsAvailable()} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Check
                  label="STT — Ucapkan perintah"
                  description="Menggunakan Web Speech API browser."
                  checked={voicePrefs.sttEnabled && isSttAvailable()}
                  disabled={!isSttAvailable()}
                  onChange={(v) => setVoicePrefs({ ...voicePrefs, sttEnabled: v })}
                />
                <Check
                  label="TTS — Jawaban dibacakan otomatis"
                  description="Suara lokal di perangkat."
                  checked={voicePrefs.ttsEnabled && isTtsAvailable()}
                  disabled={!isTtsAvailable()}
                  onChange={(v) => setVoicePrefs({ ...voicePrefs, ttsEnabled: v })}
                />
              </div>
              <label>
                <span className="text-xs text-slate-600 dark:text-slate-400">Bahasa</span>
                <select
                  value={voicePrefs.language}
                  onChange={(e) => setVoicePrefs({ ...voicePrefs, language: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900 text-sm"
                >
                  <option value="id-ID">Indonesia</option>
                  <option value="en-US">English (US)</option>
                  <option value="en-GB">English (UK)</option>
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <Slider
                  label="Kecepatan TTS"
                  min={0.6}
                  max={1.6}
                  step={0.05}
                  value={voicePrefs.ttsRate}
                  format={(v) => `${v.toFixed(2)}x`}
                  onChange={(v) => setVoicePrefs({ ...voicePrefs, ttsRate: v })}
                />
                <Slider
                  label="Nada TTS"
                  min={0.6}
                  max={1.6}
                  step={0.05}
                  value={voicePrefs.ttsPitch}
                  format={(v) => v.toFixed(2)}
                  onChange={(v) => setVoicePrefs({ ...voicePrefs, ttsPitch: v })}
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setVoicePrefs(DEFAULT_VOICE_PREFS)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Reset default
                </button>
                <span className="text-xs text-slate-500">
                  Tersimpan otomatis di localStorage perangkat ini.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'wake' && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold tracking-widest text-slate-600 dark:text-slate-400">
            WAKE ENGINE · DOUBLE / TRIPLE CLAP
          </h2>
          <SettingsPanel
            open={true}
            onClose={() => undefined}
            inline={true}
            voicePrefs={voicePrefs}
            onChangeVoice={setVoicePrefs}
            wakeSettings={wakeSettings}
            onChangeWake={setWakeSettings}
            wakeRunning={wakeRunning}
            wakeError={wakeError}
            onToggleWake={onToggleWake}
            micLevel={micLevel}
          />
        </div>
      )}
        </div>
      </div>
    </div>
  )
}

function Section({
  title,
  items,
  form,
  setForm,
  children,
}: {
  title: string
  items: AppSettingItem[]
  form: Record<string, unknown>
  setForm: React.Dispatch<React.SetStateAction<Record<string, unknown>>>
  children?: React.ReactNode
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold tracking-widest text-slate-600 dark:text-slate-400">
        {title.toUpperCase()}
      </h2>
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
        {items.map((it) => (
          <div key={it.key} className="p-4 sm:px-5 sm:py-4 grid grid-cols-1 sm:grid-cols-5 gap-3">
            <div className="sm:col-span-2">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  {it.label}
                </label>
                {it.secret && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 tracking-wide">
                    SECRET
                  </span>
                )}
              </div>
              {it.help && (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{it.help}</p>
              )}
              {it.secret && it.is_filled && (
                <p className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-400">
                  Sudah terisi. Biarkan kosong jika tidak ingin diganti.
                </p>
              )}
            </div>
            <div className="sm:col-span-3">
              <SettingField
                item={it}
                value={form[it.key]}
                onChange={(v) => setForm((prev) => ({ ...prev, [it.key]: v }))}
              />
            </div>
          </div>
        ))}
      </div>
      {children}
    </section>
  )
}

function SettingField({
  item,
  value,
  onChange,
}: {
  item: AppSettingItem
  value: unknown
  onChange: (v: unknown) => void
}) {
  const inputBase =
    'w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none'

  if (item.type === 'boolean') {
    return (
      <label className="inline-flex items-center gap-2">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
          className="scale-110"
        />
        <span className="text-sm text-slate-600 dark:text-slate-300">
          {value ? 'Aktif' : 'Nonaktif'}
        </span>
      </label>
    )
  }
  if (item.key === 'ai.default') {
    return (
      <select
        value={String(value ?? 'local')}
        onChange={(e) => onChange(e.target.value)}
        className={inputBase}
      >
        <option value="local">local — offline demo responder (tanpa API key)</option>
        <option value="nine_router">nine_router — gateway OpenAI-compatible</option>
      </select>
    )
  }
  if (item.type === 'integer') {
    return (
      <input
        type="number"
        min={0}
        step={1}
        value={value === null || value === undefined ? '' : Number(value)}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className={inputBase}
        placeholder={item.placeholder}
      />
    )
  }
  if (item.secret) {
    return (
      <input
        type="password"
        spellCheck={false}
        autoComplete="new-password"
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
        className={inputBase + ' font-mono tracking-wider'}
        placeholder={
          item.placeholder ?? (item.is_filled ? '(kosongkan = tidak diubah)' : 'sk-…')
        }
      />
    )
  }
  if (item.key === 'jarvis.system_prompt' || item.label.toLowerCase().includes('prompt')) {
    return (
      <textarea
        rows={5}
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
        className={inputBase + ' font-sans leading-relaxed resize-y'}
        placeholder={item.placeholder ?? 'System prompt persona JARVIS…'}
      />
    )
  }
  return (
    <input
      type="text"
      spellCheck={false}
      value={String(value ?? '')}
      onChange={(e) => onChange(e.target.value)}
      className={inputBase}
      placeholder={item.placeholder}
    />
  )
}

function TestResult({ test }: { test: ConnectionTest }) {
  const ok = test.ok
  return (
    <div
      className={`mt-4 rounded-xl p-4 text-sm border ${
        ok
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300'
          : 'border-red-200 bg-red-50 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold">
          {test.provider ? `${test.provider} · ` : ''}
          {ok ? 'BERHASIL' : 'GAGAL'}
        </span>
        {typeof test.latency_ms === 'number' && (
          <span className="tabular-nums text-xs opacity-80">
            Latensi {test.latency_ms} ms
          </span>
        )}
      </div>
      <p className="mt-1 text-[13px] leading-relaxed opacity-90">{test.message}</p>
    </div>
  )
}

function Check({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 flex items-start gap-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/40 transition">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 scale-110"
      />
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-800 dark:text-slate-200">{label}</div>
        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          {disabled ? 'Browser tidak mendukung fitur ini.' : description}
        </div>
      </div>
    </label>
  )
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  format,
  onChange,
}: {
  label: string
  min: number
  max: number
  step: number
  value: number
  format: (v: number) => string
  onChange: (v: number) => void
}) {
  return (
    <label>
      <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
        <span>{label}</span>
        <span className="tabular-nums">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full mt-1"
      />
    </label>
  )
}

function CapabilitiesRow({ stt, tts }: { stt: boolean; tts: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Badge ok={stt} label={`STT ${stt ? 'tersedia' : 'tidak didukung'}`} />
      <Badge ok={tts} label={`TTS ${tts ? 'tersedia' : 'tidak didukung'}`} />
    </div>
  )
}

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`text-[11px] tracking-wide px-2.5 py-1 rounded-full border ${
        ok
          ? 'border-emerald-300 text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300'
          : 'border-slate-300 text-slate-600 bg-slate-100 dark:bg-slate-900/50 dark:border-slate-700 dark:text-slate-400'
      }`}
    >
      {label}
    </span>
  )
}
