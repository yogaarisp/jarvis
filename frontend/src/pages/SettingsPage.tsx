import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchAiModels,
  getSettings,
  getUserPreferences,
  getVoicePreviews,
  getWakeSettings,
  testAiConnection,
  testHermesConnection,
  updateSettings,
  updateUserPreferences,
  updateWakeSettings,
} from '../lib/api'
import type {
  AppSettingItem,
  AppSettingsBundle,
  ConnectionTest,
  VoicePrefs,
  VoicePreviewItem,
  WakeSettings,
} from '../types'
import { SettingsPanel } from '../components/SettingsPanel'
import {
  DEFAULT_VOICE_PREFS,
  SERVER_VOICES,
  TtsEngine,
  isSttAvailable,
  isTtsAvailable,
  loadVoicePrefs,
  saveVoicePrefs,
} from '../lib/voice'
import { WakeEngine } from '../lib/wake'

const DEFAULT_VOICE_PREVIEWS: VoicePreviewItem[] = [
  { filename: '5-jarvis-cloned.wav', name: 'JARVIS Cloned', voice_id: 'jarvis-cloned', group: 'JARVIS Cloned / Master', lang: 'EN', format: 'wav', size_bytes: 284300, size_formatted: '277.6 KB', title: 'JARVIS Cloned (XTTS Local AI)', description: 'Hasil sintesis cloning AI lokal (XTTS v2 model) dari suara Paul Bettany.', accent: 'AI Neural Clone', url: '/api/tts/previews/5-jarvis-cloned.wav' },
  { filename: '5-jarvis.mp3', name: 'JARVIS Master Reference', voice_id: 'jarvis-cloned', group: 'JARVIS Cloned / Master', lang: 'EN', format: 'mp3', size_bytes: 163003, size_formatted: '159.2 KB', title: 'JARVIS Master (Film Iron Man Reference)', description: 'Sampel rekaman suara asli Paul Bettany pemeran JARVIS di film Marvel.', accent: 'JARVIS Original Master', url: '/api/tts/previews/5-jarvis.mp3' },
]

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
  { key: 'voice', label: 'Voice & Previews', desc: 'Sample audio voice-previews, STT & TTS neural.' },
  { key: 'wake', label: 'Wake Engine', desc: 'Double/triple clap wake via mic lokal.' },
]

interface SettingsPageProps {
  onClose: () => void
  /** Props kontrol opsional — diisi CorePage agar wake/TTS memakai mesin induk yang tetap hidup setelah modal ditutup. */
  voicePrefs?: VoicePrefs
  onChangeVoice?: (v: VoicePrefs) => void
  wakeSettings?: WakeSettings
  onChangeWake?: (w: WakeSettings) => void
  wakeRunning?: boolean
  wakeError?: string | null
  onToggleWake?: (want: boolean) => void
  micLevel?: number
}

export default function SettingsPage({
  onClose,
  voicePrefs: extVoice,
  onChangeVoice,
  wakeSettings: extWake,
  onChangeWake,
  wakeRunning: extRunning,
  wakeError: extWakeError,
  onToggleWake: extToggle,
  micLevel: extMic,
}: SettingsPageProps) {
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
  // Daftar model dari gateway 9Router — untuk dropdown model utama & fallback.
  const [aiModels, setAiModels] = useState<string[]>([])
  const [aiModelsLoading, setAiModelsLoading] = useState(false)
  const [aiModelsMsg, setAiModelsMsg] = useState<string | null>(null)
  const aiModelsAutoRef = useRef(false)
  // Debounce save user prefs ke DB — agar tiap keystroke ttsRate tidak langsung PUT spam.
  const voiceSaveTimerRef = useRef<number | null>(null)
  // State internal — dipakai hanya saat komponen tidak dikendalikan dari luar.
  const [intVoice, setIntVoice] = useState<VoicePrefs>(DEFAULT_VOICE_PREFS)
  const [intWake, setIntWake] = useState<WakeSettings>(DEFAULT_WAKE)
  const [intRunning, setIntRunning] = useState(false)
  const [intWakeError, setIntWakeError] = useState<string | null>(null)
  const [intMic, setIntMic] = useState(0)

  const voicePrefs = extVoice ?? intVoice
  const setVoicePrefs = (v: VoicePrefs) => {
    if (extVoice) {
      onChangeVoice?.(v)
      return
    }
    setIntVoice(v)
  }

  const [voicePreviews, setVoicePreviews] = useState<VoicePreviewItem[]>([])
  const [loadingPreviews, setLoadingPreviews] = useState(false)
  const [playingFile, setPlayingFile] = useState<string | null>(null)
  const [liveTesting, setLiveTesting] = useState(false)
  const [testText, setTestText] = useState('Halo Keenan, sistem JARVIS siap dan beroperasi normal.')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const ttsEngineRef = useRef<TtsEngine | null>(null)

  const wakeSettings = extWake ?? intWake
  const setWakeSettings = (w: WakeSettings) => {
    if (extWake) {
      onChangeWake?.(w)
      return
    }
    setIntWake(w)
  }

  const wakeRunning = extRunning ?? intRunning
  const wakeError = extWakeError ?? intWakeError
  const micLevel = extMic ?? intMic
  const wakeRef = useRef<WakeEngine | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [b, ws, up] = await Promise.allSettled([
        getSettings(),
        getWakeSettings(),
        getUserPreferences(),
      ])
      if (b.status === 'fulfilled') {
        setBundle(b.value)
        setForm(() => {
          const next: Record<string, unknown> = {}
          for (const key in b.value.items) {
            next[key] = b.value.items[key].secret ? '' : b.value.items[key].value
          }
          return next
        })
      } else {
        throw new Error('Gagal memuat pengaturan aplikasi.')
      }
      if (ws.status === 'fulfilled') {
        setWakeSettings({ ...DEFAULT_WAKE, ...ws.value })
      }
      // Prioritaskan voice prefs dari DB (kalau ada); fallback ke localStorage.
      // DB = source of truth — tidak hilang meskipun clear cache browser.
      if (up.status === 'fulfilled' && up.value?.voice_prefs) {
        const server = up.value.voice_prefs
        const merged: VoicePrefs = { ...DEFAULT_VOICE_PREFS, ...server }
        saveVoicePrefs(merged)
        setVoicePrefs(merged)
      } else {
        setVoicePrefs(loadVoicePrefs())
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat pengaturan.')
      setVoicePrefs(loadVoicePrefs())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    // Hentikan engine hanya jika kita pemiliknya (mode tanpa kontrol eksternal).
    return () => {
      if (!extToggle) wakeRef.current?.stop()
    }
  }, [load, extToggle])

  useEffect(() => {
    // Selalu simpan ke localStorage (sebagai cache local, cepat diakses).
    saveVoicePrefs(voicePrefs)

    // Simpan ke DB server — debounce 600ms agar tidak spam request PUT setiap keystroke.
    if (voiceSaveTimerRef.current) {
      window.clearTimeout(voiceSaveTimerRef.current)
    }
    voiceSaveTimerRef.current = window.setTimeout(() => {
      updateUserPreferences({ voice_prefs: voicePrefs }).catch(() => undefined)
    }, 600)
  }, [voicePrefs])

  useEffect(() => {
    if (isTtsAvailable()) {
      ttsEngineRef.current = new TtsEngine(voicePrefs)
    }
  }, [])

  useEffect(() => {
    ttsEngineRef.current?.updatePrefs(voicePrefs)
  }, [voicePrefs])

  useEffect(() => {
    if (tab === 'voice' && voicePreviews.length === 0) {
      setLoadingPreviews(true)
      getVoicePreviews()
        .then((res) => {
          if (res && res.files) {
            setVoicePreviews(res.files)
          }
        })
        .catch(() => undefined)
        .finally(() => setLoadingPreviews(false))
    }
  }, [tab, voicePreviews.length])

  function togglePlayPreviewFile(url: string, filename: string) {
    if (playingFile === filename) {
      audioRef.current?.pause()
      setPlayingFile(null)
      return
    }

    if (audioRef.current) {
      audioRef.current.pause()
    }
    ttsEngineRef.current?.cancel()
    setLiveTesting(false)

    const audio = new Audio(url)
    audioRef.current = audio
    setPlayingFile(filename)

    audio.onended = () => setPlayingFile(null)
    audio.onerror = () => setPlayingFile(null)
    audio.play().catch(() => setPlayingFile(null))
  }

  function handleLiveTtsTest() {
    if (!testText.trim()) return
    if (audioRef.current) {
      audioRef.current.pause()
      setPlayingFile(null)
    }

    if (!ttsEngineRef.current) {
      ttsEngineRef.current = new TtsEngine(voicePrefs)
    } else {
      ttsEngineRef.current.updatePrefs(voicePrefs)
    }

    setLiveTesting(true)
    ttsEngineRef.current.onStart = () => setLiveTesting(true)
    ttsEngineRef.current.onEnd = () => setLiveTesting(false)
    ttsEngineRef.current.speak(testText)
  }

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
      // Key/URL baru tersimpan — muat ulang daftar model dari gateway.
      aiModelsAutoRef.current = true
      loadAiModels()
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

  async function toggleWakeInternal(want: boolean) {
    setIntWakeError(null)
    if (want) {
      if (!wakeRef.current) {
        const engine = new WakeEngine(wakeSettings)
        engine.onError = (m) => setIntWakeError(m)
        engine.onReady = () => setIntRunning(true)
        engine.onStopped = () => setIntRunning(false)
        engine.onLevel = (rms) => setIntMic(rms)
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

  // Saat dikendalikan eksternal (CorePage), pakai mesin milik induk.
  const handleToggleWake = extToggle ?? toggleWakeInternal

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

  /** Ambil daftar model dari gateway — pakai nilai form (baru) atau yang tersimpan. */
  const loadAiModels = useCallback(async () => {
    if (!bundle) return
    const baseUrl =
      String(form['ai.providers.nine_router.base_url'] ?? '').trim() ||
      String(items['ai.providers.nine_router.base_url']?.value ?? '')
    const typedKey = String(form['ai.providers.nine_router.api_key'] ?? '').trim()
    const keySaved = Boolean(items['ai.providers.nine_router.api_key']?.is_filled)

    if (!baseUrl || (!typedKey && !keySaved)) {
      setAiModels([])
      setAiModelsMsg('Isi dulu Base URL dan API Key, lalu daftar model muncul otomatis.')
      return
    }

    setAiModelsLoading(true)
    setAiModelsMsg(null)
    try {
      const res = await fetchAiModels({ base_url: baseUrl, api_key: typedKey || null })
      if (res.ok) {
        setAiModels(res.models)
        setAiModelsMsg(`${res.models.length} model tersedia di gateway.`)
      } else {
        setAiModels([])
        setAiModelsMsg(res.message ?? 'Gagal memuat daftar model.')
      }
    } catch (e) {
      setAiModelsMsg(e instanceof Error ? e.message : 'Gagal memuat daftar model.')
    } finally {
      setAiModelsLoading(false)
    }
  }, [bundle, form, items])

  // Auto-muat daftar model saat tab AI dibuka & Base URL + API Key sudah terisi.
  useEffect(() => {
    if (loading || !bundle || aiModelsAutoRef.current || tab !== 'ai') return
    const keyFilled =
      Boolean(String(form['ai.providers.nine_router.api_key'] ?? '').trim()) ||
      Boolean(items['ai.providers.nine_router.api_key']?.is_filled)
    const urlFilled =
      Boolean(String(form['ai.providers.nine_router.base_url'] ?? '').trim()) ||
      Boolean(items['ai.providers.nine_router.base_url']?.value)
    if (keyFilled && urlFilled) {
      aiModelsAutoRef.current = true
      loadAiModels()
    }
  }, [loading, bundle, tab, form, items, loadAiModels])

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 transition-all"
      onClick={onClose}
    >
      <div
        className="glass w-full sm:max-w-3xl rounded-t-3xl sm:rounded-2xl max-h-[94vh] sm:max-h-[90vh] overflow-y-auto border border-jarvis-cyan/20 flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 sm:p-6 pb-8">
          <header className="flex items-center justify-between gap-3 mb-4">
            <div className="min-w-0 flex-1">
              <h1 className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-slate-100 truncate">
                Pengaturan Sistem
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 truncate">
                Konfigurasi AI, JARVIS neural voice, Hermes, dan Wake Engine.
              </p>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {!loading && (
                <button
                  onClick={load}
                  className="text-[11px] sm:text-xs px-2.5 py-1.5 sm:px-3 sm:py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition"
                  title="Muat ulang pengaturan"
                >
                  🔄 <span className="hidden sm:inline">Muat ulang</span>
                </button>
              )}
              <button
                onClick={onClose}
                aria-label="Tutup"
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg border border-white/10 hover:bg-white/10 flex items-center justify-center text-cyan-100/80 transition text-sm font-semibold"
              >
                ✕
              </button>
            </div>
          </header>

          {/* Tabs - Smooth horizontally scrollable on mobile */}
          <div className="flex items-center gap-1 sm:gap-1.5 mb-4 sm:mb-6 border-b border-slate-200 dark:border-slate-800 pb-1.5 overflow-x-auto no-scrollbar scroll-smooth -mx-4 px-4 sm:mx-0 sm:px-0">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 sm:px-3.5 sm:py-2 text-xs font-semibold tracking-wide rounded-xl whitespace-nowrap shrink-0 transition ${
                  tab === t.key
                    ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/50'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {loading && (
            <div className="p-8 text-center text-xs sm:text-sm text-slate-500 dark:text-slate-400 animate-pulse">
              Memuat pengaturan…
            </div>
          )}

          {error && (
            <div className="mb-4 p-3.5 sm:p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300 text-xs sm:text-sm">
              {error}
            </div>
          )}

          {saveMsg && (
            <div className="mb-4 p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300 text-xs sm:text-sm">
              {saveMsg}
            </div>
          )}

          {!loading && tab === 'ai' && bundle && (
            <Section
              title={groups['ai']}
              items={itemsByGroup['ai'] ?? []}
              form={form}
              setForm={setForm}
              modelOptions={aiModels}
            >
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-3 border-t border-slate-200 dark:border-slate-800 mt-4">
                <div className="min-w-0 flex-1 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                  {aiModelsLoading
                    ? 'Memuat daftar model dari gateway…'
                    : aiModelsMsg ?? 'Daftar model dimuat otomatis saat Base URL & API Key terisi.'}
                </div>
                <button
                  onClick={loadAiModels}
                  disabled={aiModelsLoading}
                  className="w-full sm:w-auto px-4 py-2 rounded-xl border border-cyan-500/40 text-cyan-600 dark:text-cyan-300 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 text-xs font-medium disabled:opacity-50 transition"
                >
                  {aiModelsLoading ? 'Memuat…' : `🔄 Muat Daftar Model${aiModels.length ? ` (${aiModels.length})` : ''}`}
                </button>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-3">
                <button
                  onClick={onSaveAppSettings}
                  disabled={saving}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-medium disabled:opacity-50 transition"
                >
                  {saving ? 'Menyimpan…' : 'Simpan Pengaturan AI'}
                </button>
                <button
                  onClick={onTestAi}
                  disabled={aiTestLoading}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-indigo-300 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-xs sm:text-sm disabled:opacity-50 transition"
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
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-4 border-t border-slate-200 dark:border-slate-800 mt-4">
                <button
                  onClick={onSaveAppSettings}
                  disabled={saving}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-medium disabled:opacity-50 transition"
                >
                  {saving ? 'Menyimpan…' : 'Simpan Pengaturan Hermes'}
                </button>
                <button
                  onClick={onTestHermes}
                  disabled={hermesTestLoading}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-indigo-300 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-xs sm:text-sm disabled:opacity-50 transition"
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
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-medium disabled:opacity-50 transition"
                >
                  {saving ? 'Menyimpan…' : 'Simpan Pengaturan JARVIS'}
                </button>
              </div>
            </Section>
          )}

      {tab === 'voice' && (
        <div className="space-y-4 sm:space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
            <div>
              <h2 className="text-xs sm:text-sm font-bold tracking-wider text-slate-700 dark:text-slate-300 uppercase">
                PENGATURAN SUARA JARVIS · VOICE PREVIEWS & NEURAL TTS
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Daftar semua sampel suara di folder <code className="font-mono text-cyan-600 dark:text-cyan-400">ai/voice-previews</code> dan konfigurasi TTS/STT.
              </p>
            </div>
            <CapabilitiesRow stt={isSttAvailable()} tts={isTtsAvailable()} />
          </div>

          {/* Quick STT / TTS Activation */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
            <Check
              label="Press-to-talk (STT)"
              description="Tahan tombol Space atau klik ikon mikrofon untuk berbicara ke JARVIS."
              checked={voicePrefs.sttEnabled && isSttAvailable()}
              disabled={!isSttAvailable()}
              onChange={(v) => setVoicePrefs({ ...voicePrefs, sttEnabled: v })}
            />
            <Check
              label="Auto-speak Jawaban (TTS)"
              description="JARVIS otomatis membacakan setiap jawaban pesan AI lewat suara."
              checked={voicePrefs.ttsEnabled && isTtsAvailable()}
              disabled={!isTtsAvailable()}
              onChange={(v) => setVoicePrefs({ ...voicePrefs, ttsEnabled: v })}
            />
          </div>

          {/* TTS Engine Switcher */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/40 p-3.5 sm:p-5 space-y-3 sm:space-y-4 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
              <div>
                <h3 className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Mesin Suara (TTS Engine)
                </h3>
                <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Pilih Neural Server (Edge TTS jernih ala JARVIS) atau Browser lokal.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-1.5 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setVoicePrefs({ ...voicePrefs, ttsEngine: 'server' })}
                  className={`px-3 py-2 text-xs rounded-xl font-medium text-center transition ${
                    (voicePrefs.ttsEngine ?? 'server') === 'server'
                      ? 'bg-cyan-600 text-white shadow-sm font-semibold'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  ⚡ Server Neural
                </button>
                <button
                  type="button"
                  onClick={() => setVoicePrefs({ ...voicePrefs, ttsEngine: 'browser' })}
                  className={`px-3 py-2 text-xs rounded-xl font-medium text-center transition ${
                    voicePrefs.ttsEngine === 'browser'
                      ? 'bg-cyan-600 text-white shadow-sm font-semibold'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  💻 Browser Local
                </button>
              </div>
            </div>

            {(voicePrefs.ttsEngine ?? 'server') === 'server' ? (
              <div className="rounded-xl bg-cyan-500/10 border border-cyan-500/20 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-cyan-500/20 flex items-center justify-center text-cyan-500 font-bold text-base shrink-0">
                    🎙️
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] text-cyan-600 dark:text-cyan-400 font-medium">
                      Suara Aktif Saat Ini:
                    </div>
                    <div className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                      {SERVER_VOICES.find((v) => v.id === (voicePrefs.ttsServerVoice ?? 'jarvis-cloned'))?.label ?? voicePrefs.ttsServerVoice ?? 'jarvis-cloned'}
                    </div>
                  </div>
                </div>
                <span className="text-[10px] sm:text-[11px] px-2.5 py-1 rounded-full bg-cyan-500/20 text-cyan-600 dark:text-cyan-300 font-mono self-start sm:self-auto shrink-0">
                  {voicePrefs.ttsServerVoice ?? 'jarvis-cloned'}
                </span>
              </div>
            ) : (
              <div className="rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-3 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                💻 Memakai suara bawaan browser — otomatis memilih voice pria Inggris ala JARVIS yang tersedia di perangkat.
              </div>
            )}
          </div>

          {/* Section: Pilihan Suara dari Folder voice-previews */}
          <div className="space-y-3 sm:space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <div>
                <h3 className="text-xs sm:text-sm font-bold tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-1.5 flex-wrap">
                  <span>🎧 PILIHAN SUARA & SAMPEL AUDIO</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-normal font-mono">
                    ai/voice-previews
                  </span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Dengarkan contoh bahasa Inggris & Indonesia, lalu pilih untuk suara JARVIS.
                </p>
              </div>
              {loadingPreviews && (
                <span className="text-xs text-cyan-500 animate-pulse">Memuat audio…</span>
              )}
            </div>

            {/* Pilihan suara neural lain dihapus — hanya JARVIS Master */}

            {/* 5. JARVIS Master & Cloned Feature Card */}
            <div className={`rounded-2xl border transition p-3.5 sm:p-5 relative overflow-hidden ${
              (voicePrefs.ttsServerVoice ?? 'jarvis-cloned') === 'jarvis-cloned' && (voicePrefs.ttsEngine ?? 'server') === 'server'
                ? 'border-amber-500/60 ring-1 ring-amber-500/40 bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-amber-950/20 shadow-md shadow-amber-500/5'
                : 'border-amber-500/30 bg-gradient-to-r from-amber-500/5 via-amber-500/10 to-transparent'
            }`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-amber-500/20 text-amber-500 flex items-center justify-center text-xl sm:text-2xl shrink-0">
                    🤖
                  </div>
                  <div>
                    <div className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 flex-wrap">
                      <span>JARVIS Master (Film Reference) & Clone</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 font-mono font-bold">
                        Paul Bettany · Default
                      </span>
                      {(voicePrefs.ttsServerVoice ?? 'jarvis-cloned') === 'jarvis-cloned' && (voicePrefs.ttsEngine ?? 'server') === 'server' && (
                        <span className="text-[10px] sm:text-[11px] font-semibold text-amber-500 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span>
                          Default Aktif
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                      Sampel suara asli film Iron Man (<code className="font-mono text-amber-600 dark:text-amber-400">5-jarvis.mp3</code>) & model sintesis neural XTTS (<code className="font-mono text-amber-600 dark:text-amber-400">5-jarvis-cloned.wav</code>).
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:flex sm:flex-col gap-2 shrink-0 w-full sm:w-auto pt-1 sm:pt-0">
                  <button
                    type="button"
                    onClick={() => togglePlayPreviewFile('/api/tts/previews/5-jarvis.mp3', '5-jarvis.mp3')}
                    className={`w-full text-xs py-2 px-3 rounded-xl border flex items-center justify-center gap-1.5 font-medium transition ${
                      playingFile === '5-jarvis.mp3'
                        ? 'bg-amber-500 text-white border-amber-500 shadow-sm animate-pulse'
                        : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20'
                    }`}
                  >
                    {playingFile === '5-jarvis.mp3' ? '⏹ Stop' : '▶ 5-jarvis.mp3'}
                  </button>

                  <button
                    type="button"
                    onClick={() => togglePlayPreviewFile('/api/tts/previews/5-jarvis-cloned.wav', '5-jarvis-cloned.wav')}
                    className={`w-full text-xs py-2 px-3 rounded-xl border flex items-center justify-center gap-1.5 font-medium transition ${
                      playingFile === '5-jarvis-cloned.wav'
                        ? 'bg-amber-500 text-white border-amber-500 shadow-sm animate-pulse'
                        : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20'
                    }`}
                  >
                    {playingFile === '5-jarvis-cloned.wav' ? '⏹ Stop' : '▶ AI Cloned (.wav)'}
                  </button>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-amber-500/20 flex flex-col sm:flex-row items-center justify-between gap-2">
                <span className="text-[11px] text-amber-700/80 dark:text-amber-300/80 font-medium text-center sm:text-left">
                  Suara model AI: <span className="font-mono font-bold">jarvis-cloned</span> · XTTS v2 lokal (referensi Paul Bettany JARVIS)
                </span>
                <button
                  type="button"
                  onClick={() => setVoicePrefs({ ...voicePrefs, ttsServerVoice: 'jarvis-cloned', ttsEngine: 'server' })}
                  disabled={(voicePrefs.ttsServerVoice ?? 'jarvis-cloned') === 'jarvis-cloned' && (voicePrefs.ttsEngine ?? 'server') === 'server'}
                  className="w-full sm:w-auto px-4 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 disabled:opacity-50 disabled:hover:bg-amber-500 transition shadow-sm"
                >
                  {(voicePrefs.ttsServerVoice ?? 'jarvis-cloned') === 'jarvis-cloned' && (voicePrefs.ttsEngine ?? 'server') === 'server'
                    ? '✓ Suara JARVIS Master Aktif'
                    : 'Aktifkan Suara JARVIS Master'}
                </button>
              </div>
            </div>

            {/* Table / List of ALL items in voice-previews folder */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/40 dark:bg-slate-900/40 overflow-hidden shadow-sm">
              <div className="px-3.5 py-2.5 sm:px-5 sm:py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/60">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    📂 Daftar 10 File di <code className="font-mono text-cyan-600 dark:text-cyan-400">voice-previews</code>
                  </span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono">
                  {voicePreviews.length || 10} File
                </span>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800/60 max-h-[320px] sm:max-h-[380px] overflow-y-auto">
                {(voicePreviews.length > 0 ? voicePreviews : DEFAULT_VOICE_PREVIEWS).map((f: VoicePreviewItem) => (
                  <div
                    key={f.filename}
                    className={`p-2.5 sm:p-3.5 flex items-start sm:items-center justify-between gap-2 sm:gap-3 transition ${
                      playingFile === f.filename
                        ? 'bg-amber-500/10 dark:bg-amber-500/15'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-900/50'
                    }`}
                  >
                    <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => togglePlayPreviewFile(f.url, f.filename)}
                        className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center text-xs sm:text-sm font-bold transition shrink-0 mt-0.5 sm:mt-0 ${
                          playingFile === f.filename
                            ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20 scale-105'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                        title={playingFile === f.filename ? 'Stop Audio' : 'Putar Audio'}
                      >
                        {playingFile === f.filename ? '⏹' : '▶'}
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                            {f.title}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                            {f.format.toUpperCase()} · {f.size_formatted}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                            f.lang === 'ID'
                              ? 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'
                              : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                          }`}>
                            {f.lang}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 sm:line-clamp-none mt-0.5">
                          {f.description}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 self-center">
                      {f.voice_id && (
                        <button
                          type="button"
                          onClick={() => setVoicePrefs({ ...voicePrefs, ttsServerVoice: f.voice_id, ttsEngine: 'server' })}
                          className={`text-[11px] px-2.5 py-1 rounded-lg border transition font-medium ${
                            (voicePrefs.ttsServerVoice ?? 'jarvis-cloned') === f.voice_id && voicePrefs.ttsEngine === 'server'
                              ? 'bg-cyan-500 text-white border-cyan-500 font-semibold'
                              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-cyan-400'
                          }`}
                        >
                          {(voicePrefs.ttsServerVoice ?? 'jarvis-cloned') === f.voice_id && voicePrefs.ttsEngine === 'server'
                            ? '✓ Aktif'
                            : 'Gunakan'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Section: Live TTS Testing Playground */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/40 p-3.5 sm:p-5 space-y-2.5 sm:space-y-3 shadow-sm">
            <div>
              <h3 className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <span>🗣️ UJI SUARA JARVIS (LIVE TTS)</span>
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Ucapkan kalimat langsung dengan suara & kecepatan yang sedang aktif.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={testText}
                onChange={(e) => setTestText(e.target.value)}
                placeholder="Ketik kalimat untuk diucapkan JARVIS…"
                className="w-full flex-1 rounded-xl border border-slate-300 dark:border-slate-700 px-3.5 py-2.5 bg-white dark:bg-slate-900 text-xs sm:text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 shadow-inner"
              />
              <button
                type="button"
                onClick={handleLiveTtsTest}
                disabled={liveTesting || !testText.trim()}
                className={`w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition shrink-0 ${
                  liveTesting
                    ? 'bg-amber-500 text-white animate-pulse'
                    : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-sm disabled:opacity-50'
                }`}
              >
                {liveTesting ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-white animate-ping"></span>
                    Sedang Bicara…
                  </>
                ) : (
                  <>
                    <span>🔊</span>
                    Ucapkan Teks
                  </>
                )}
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5 pt-0.5">
              <span className="text-[10px] sm:text-[11px] text-slate-400 py-0.5">Contoh:</span>
              {[
                'Halo Keenan, sistem JARVIS online dan siap.',
                'JARVIS systems fully operational, sir.',
                'Analisis protokol selesai tanpa kendala.',
              ].map((phrase) => (
                <button
                  key={phrase}
                  type="button"
                  onClick={() => setTestText(phrase)}
                  className="text-[10px] sm:text-[11px] px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700"
                >
                  "{phrase}"
                </button>
              ))}
            </div>
          </div>

          {/* Section: Sliders & Adjustments */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/40 p-3.5 sm:p-5 space-y-3 sm:space-y-4 shadow-sm">
            <h3 className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200">
              Penyesuaian Intonasi & Bahasa
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <label>
                <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">Bahasa Default STT/TTS</span>
                <select
                  value={voicePrefs.language}
                  onChange={(e) => setVoicePrefs({ ...voicePrefs, language: e.target.value })}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900 text-xs sm:text-sm text-slate-800 dark:text-slate-200"
                >
                  <option value="id-ID">Indonesia (id-ID)</option>
                  <option value="en-US">English US (en-US)</option>
                  <option value="en-GB">English UK (en-GB)</option>
                </select>
              </label>

              <Slider
                label="Kecepatan Bicara (Speed Rate)"
                min={0.6}
                max={1.6}
                step={0.05}
                value={voicePrefs.ttsRate}
                format={(v) => `${v.toFixed(2)}x`}
                onChange={(v) => setVoicePrefs({ ...voicePrefs, ttsRate: v })}
              />

              <Slider
                label="Nada Suara (Pitch)"
                min={0.6}
                max={1.6}
                step={0.05}
                value={voicePrefs.ttsPitch}
                format={(v) => v.toFixed(2)}
                onChange={(v) => setVoicePrefs({ ...voicePrefs, ttsPitch: v })}
              />
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-center sm:text-left">
              <button
                type="button"
                onClick={() => setVoicePrefs(DEFAULT_VOICE_PREFS)}
                className="w-full sm:w-auto text-xs px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                Reset ke Default JARVIS
              </button>
              <span className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                💾 Pengaturan tersimpan otomatis di browser lokal.
              </span>
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
            onToggleWake={handleToggleWake}
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
  modelOptions = [],
  children,
}: {
  title: string
  items: AppSettingItem[]
  form: Record<string, unknown>
  setForm: React.Dispatch<React.SetStateAction<Record<string, unknown>>>
  /** Daftar model dari gateway — dipakai dropdown model utama & fallback. */
  modelOptions?: string[]
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
                modelOptions={modelOptions}
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
  modelOptions = [],
  onChange,
}: {
  item: AppSettingItem
  value: unknown
  modelOptions?: string[]
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
  // Model utama & fallback — dropdown dari gateway kalau daftar sudah dimuat.
  if (
    (item.key === 'ai.providers.nine_router.model' ||
      item.key === 'ai.providers.nine_router.fallback_model') &&
    modelOptions.length > 0
  ) {
    const isFallback = item.key.endsWith('fallback_model')
    const current = String(value ?? '')
    const known = modelOptions.includes(current)

    return (
      <select
        value={current}
        onChange={(e) => onChange(e.target.value)}
        className={inputBase}
      >
        <option value="">
          {isFallback
            ? '(kosong = tanpa fallback)'
            : current
              ? `${current} (tersimpan — pilih ulang)`
              : '— pilih model utama —'}
        </option>
        {!known && current !== '' && <option value={current}>{current} · tersimpan</option>}
        {modelOptions.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
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
