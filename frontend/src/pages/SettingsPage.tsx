import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getSettings,
  getVoicePreviews,
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
  { filename: '1-Ryan-EN.mp3', name: 'Ryan', voice_id: 'en-GB-RyanNeural', group: 'Ryan', lang: 'EN', format: 'mp3', size_bytes: 48240, size_formatted: '47.1 KB', title: 'Ryan · English (JARVIS)', description: 'Pria British aksen formal, halus & berwibawa ala JARVIS Iron Man.', accent: 'British English (en-GB)', url: '/api/tts/previews/1-Ryan-EN.mp3' },
  { filename: '1-Ryan-ID.mp3', name: 'Ryan', voice_id: 'en-GB-RyanNeural', group: 'Ryan', lang: 'ID', format: 'mp3', size_bytes: 38160, size_formatted: '37.3 KB', title: 'Ryan · Bahasa Indonesia', description: 'Pria British aksen formal, halus & berwibawa ala JARVIS Iron Man.', accent: 'British English (en-GB)', url: '/api/tts/previews/1-Ryan-ID.mp3' },
  { filename: '2-Thomas-EN.mp3', name: 'Thomas', voice_id: 'en-GB-ThomasNeural', group: 'Thomas', lang: 'EN', format: 'mp3', size_bytes: 46944, size_formatted: '45.8 KB', title: 'Thomas · English', description: 'Pria British nada natural, artikulasi jelas dan tenang.', accent: 'British English (en-GB)', url: '/api/tts/previews/2-Thomas-EN.mp3' },
  { filename: '2-Thomas-ID.mp3', name: 'Thomas', voice_id: 'en-GB-ThomasNeural', group: 'Thomas', lang: 'ID', format: 'mp3', size_bytes: 36720, size_formatted: '35.9 KB', title: 'Thomas · Bahasa Indonesia', description: 'Pria British nada natural, artikulasi jelas dan tenang.', accent: 'British English (en-GB)', url: '/api/tts/previews/2-Thomas-ID.mp3' },
  { filename: '3-Eric-EN.mp3', name: 'Eric', voice_id: 'en-US-EricNeural', group: 'Eric', lang: 'EN', format: 'mp3', size_bytes: 48528, size_formatted: '47.4 KB', title: 'Eric · English', description: 'Pria Amerika nada modern, energik, tegas & percaya diri.', accent: 'US English (en-US)', url: '/api/tts/previews/3-Eric-EN.mp3' },
  { filename: '3-Eric-ID.mp3', name: 'Eric', voice_id: 'en-US-EricNeural', group: 'Eric', lang: 'ID', format: 'mp3', size_bytes: 39456, size_formatted: '38.5 KB', title: 'Eric · Bahasa Indonesia', description: 'Pria Amerika nada modern, energik, tegas & percaya diri.', accent: 'US English (en-US)', url: '/api/tts/previews/3-Eric-ID.mp3' },
  { filename: '4-Andrew-EN.mp3', name: 'Andrew', voice_id: 'en-US-AndrewNeural', group: 'Andrew', lang: 'EN', format: 'mp3', size_bytes: 32256, size_formatted: '31.5 KB', title: 'Andrew · English', description: 'Pria Amerika bernada hangat, bersahabat dan santai.', accent: 'US English (en-US)', url: '/api/tts/previews/4-Andrew-EN.mp3' },
  { filename: '4-Andrew-ID.mp3', name: 'Andrew', voice_id: 'en-US-AndrewNeural', group: 'Andrew', lang: 'ID', format: 'mp3', size_bytes: 30816, size_formatted: '30.1 KB', title: 'Andrew · Bahasa Indonesia', description: 'Pria Amerika bernada hangat, bersahabat dan santai.', accent: 'US English (en-US)', url: '/api/tts/previews/4-Andrew-ID.mp3' },
  { filename: '5-jarvis-cloned.wav', name: 'JARVIS Cloned', voice_id: 'en-GB-RyanNeural', group: 'JARVIS Cloned / Master', lang: 'EN', format: 'wav', size_bytes: 284300, size_formatted: '277.6 KB', title: 'JARVIS Cloned (XTTS Local AI)', description: 'Hasil sintesis cloning AI lokal (XTTS v2 model) dari suara Paul Bettany.', accent: 'AI Neural Clone', url: '/api/tts/previews/5-jarvis-cloned.wav' },
  { filename: '5-jarvis.mp3', name: 'JARVIS Master Reference', voice_id: 'en-GB-RyanNeural', group: 'JARVIS Cloned / Master', lang: 'EN', format: 'mp3', size_bytes: 163003, size_formatted: '159.2 KB', title: 'JARVIS Master (Film Iron Man Reference)', description: 'Sampel rekaman suara asli Paul Bettany pemeran JARVIS di film Marvel.', accent: 'JARVIS Original Master', url: '/api/tts/previews/5-jarvis.mp3' },
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
  const [voicePreviews, setVoicePreviews] = useState<VoicePreviewItem[]>([])
  const [loadingPreviews, setLoadingPreviews] = useState(false)
  const [playingFile, setPlayingFile] = useState<string | null>(null)
  const [liveTesting, setLiveTesting] = useState(false)
  const [testText, setTestText] = useState('Halo Keenan, sistem JARVIS siap dan beroperasi normal.')
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const ttsEngineRef = useRef<TtsEngine | null>(null)
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

  useEffect(() => {
    if (isTtsAvailable()) {
      ttsEngineRef.current = new TtsEngine(voicePrefs)
      const refreshVoices = () => setBrowserVoices(window.speechSynthesis.getVoices())
      refreshVoices()
      window.speechSynthesis.onvoiceschanged = refreshVoices
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
            >
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-4 border-t border-slate-200 dark:border-slate-800 mt-4">
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
                      {SERVER_VOICES.find((v) => v.id === (voicePrefs.ttsServerVoice ?? 'en-GB-RyanNeural'))?.label ?? voicePrefs.ttsServerVoice ?? 'en-GB-RyanNeural'}
                    </div>
                  </div>
                </div>
                <span className="text-[10px] sm:text-[11px] px-2.5 py-1 rounded-full bg-cyan-500/20 text-cyan-600 dark:text-cyan-300 font-mono self-start sm:self-auto shrink-0">
                  {voicePrefs.ttsServerVoice ?? 'en-GB-RyanNeural'}
                </span>
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Pilih Suara Browser
                </label>
                <select
                  value={voicePrefs.voiceName ?? ''}
                  onChange={(e) => setVoicePrefs({ ...voicePrefs, voiceName: e.target.value || undefined })}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs sm:text-sm text-slate-800 dark:text-slate-200"
                >
                  <option value="">— Default · Suara Pria Inggris (JARVIS) —</option>
                  {browserVoices.map((v: SpeechSynthesisVoice) => (
                    <option key={v.name} value={v.name}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </select>
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

            {/* Voice Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {/* 1. Ryan Card */}
              <div
                className={`rounded-2xl border transition p-3.5 sm:p-4 relative overflow-hidden flex flex-col justify-between ${
                  (voicePrefs.ttsServerVoice ?? 'en-GB-RyanNeural') === 'en-GB-RyanNeural'
                    ? 'border-cyan-500 ring-1 ring-cyan-500/50 bg-cyan-950/10 dark:bg-cyan-950/30'
                    : 'border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/40 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/20 flex items-center justify-center text-base sm:text-lg shrink-0">
                        🇬🇧
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 flex-wrap">
                          <span>Ryan</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                            JARVIS Core
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                          en-GB-RyanNeural
                        </div>
                      </div>
                    </div>
                    {(voicePrefs.ttsServerVoice ?? 'en-GB-RyanNeural') === 'en-GB-RyanNeural' && (
                      <span className="text-[10px] sm:text-[11px] font-semibold text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping"></span>
                        Aktif
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-2.5 leading-relaxed">
                    Pria British intonasi formal, halus & berwibawa khas JARVIS film Iron Man.
                  </p>

                  <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-slate-200/60 dark:border-slate-800/60">
                    <button
                      type="button"
                      onClick={() => togglePlayPreviewFile('/api/tts/previews/1-Ryan-EN.mp3', '1-Ryan-EN.mp3')}
                      className={`w-full text-xs py-2 px-2 rounded-xl border flex items-center justify-center gap-1.5 font-medium transition ${
                        playingFile === '1-Ryan-EN.mp3'
                          ? 'bg-amber-500 text-white border-amber-500 shadow-sm animate-pulse'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {playingFile === '1-Ryan-EN.mp3' ? '⏹ Stop' : '▶ EN Sample'}
                    </button>

                    <button
                      type="button"
                      onClick={() => togglePlayPreviewFile('/api/tts/previews/1-Ryan-ID.mp3', '1-Ryan-ID.mp3')}
                      className={`w-full text-xs py-2 px-2 rounded-xl border flex items-center justify-center gap-1.5 font-medium transition ${
                        playingFile === '1-Ryan-ID.mp3'
                          ? 'bg-amber-500 text-white border-amber-500 shadow-sm animate-pulse'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {playingFile === '1-Ryan-ID.mp3' ? '⏹ Stop' : '▶ ID Sample'}
                    </button>
                  </div>
                </div>

                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => setVoicePrefs({ ...voicePrefs, ttsServerVoice: 'en-GB-RyanNeural', ttsEngine: 'server' })}
                    disabled={(voicePrefs.ttsServerVoice ?? 'en-GB-RyanNeural') === 'en-GB-RyanNeural' && voicePrefs.ttsEngine === 'server'}
                    className="w-full py-2.5 px-3 rounded-xl text-xs font-semibold bg-slate-900 dark:bg-slate-800 text-white hover:bg-cyan-600 dark:hover:bg-cyan-600 disabled:opacity-40 disabled:hover:bg-slate-900 transition flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    {(voicePrefs.ttsServerVoice ?? 'en-GB-RyanNeural') === 'en-GB-RyanNeural' && voicePrefs.ttsEngine === 'server'
                      ? '✓ Suara Terpilih'
                      : 'Pilih Suara Ryan'}
                  </button>
                </div>
              </div>

              {/* 2. Thomas Card */}
              <div
                className={`rounded-2xl border transition p-3.5 sm:p-4 relative overflow-hidden flex flex-col justify-between ${
                  voicePrefs.ttsServerVoice === 'en-GB-ThomasNeural'
                    ? 'border-cyan-500 ring-1 ring-cyan-500/50 bg-cyan-950/10 dark:bg-cyan-950/30'
                    : 'border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/40 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-500/10 dark:bg-blue-500/20 flex items-center justify-center text-base sm:text-lg shrink-0">
                        🇬🇧
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 flex-wrap">
                          <span>Thomas</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                            British Natural
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                          en-GB-ThomasNeural
                        </div>
                      </div>
                    </div>
                    {voicePrefs.ttsServerVoice === 'en-GB-ThomasNeural' && (
                      <span className="text-[10px] sm:text-[11px] font-semibold text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping"></span>
                        Aktif
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-2.5 leading-relaxed">
                    Pria British artikulasi jernih, nada bersahaja, dan artikulasi santun.
                  </p>

                  <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-slate-200/60 dark:border-slate-800/60">
                    <button
                      type="button"
                      onClick={() => togglePlayPreviewFile('/api/tts/previews/2-Thomas-EN.mp3', '2-Thomas-EN.mp3')}
                      className={`w-full text-xs py-2 px-2 rounded-xl border flex items-center justify-center gap-1.5 font-medium transition ${
                        playingFile === '2-Thomas-EN.mp3'
                          ? 'bg-amber-500 text-white border-amber-500 shadow-sm animate-pulse'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {playingFile === '2-Thomas-EN.mp3' ? '⏹ Stop' : '▶ EN Sample'}
                    </button>

                    <button
                      type="button"
                      onClick={() => togglePlayPreviewFile('/api/tts/previews/2-Thomas-ID.mp3', '2-Thomas-ID.mp3')}
                      className={`w-full text-xs py-2 px-2 rounded-xl border flex items-center justify-center gap-1.5 font-medium transition ${
                        playingFile === '2-Thomas-ID.mp3'
                          ? 'bg-amber-500 text-white border-amber-500 shadow-sm animate-pulse'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {playingFile === '2-Thomas-ID.mp3' ? '⏹ Stop' : '▶ ID Sample'}
                    </button>
                  </div>
                </div>

                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => setVoicePrefs({ ...voicePrefs, ttsServerVoice: 'en-GB-ThomasNeural', ttsEngine: 'server' })}
                    disabled={voicePrefs.ttsServerVoice === 'en-GB-ThomasNeural' && voicePrefs.ttsEngine === 'server'}
                    className="w-full py-2.5 px-3 rounded-xl text-xs font-semibold bg-slate-900 dark:bg-slate-800 text-white hover:bg-cyan-600 dark:hover:bg-cyan-600 disabled:opacity-40 disabled:hover:bg-slate-900 transition flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    {voicePrefs.ttsServerVoice === 'en-GB-ThomasNeural' && voicePrefs.ttsEngine === 'server'
                      ? '✓ Suara Terpilih'
                      : 'Pilih Suara Thomas'}
                  </button>
                </div>
              </div>

              {/* 3. Eric Card */}
              <div
                className={`rounded-2xl border transition p-3.5 sm:p-4 relative overflow-hidden flex flex-col justify-between ${
                  voicePrefs.ttsServerVoice === 'en-US-EricNeural'
                    ? 'border-cyan-500 ring-1 ring-cyan-500/50 bg-cyan-950/10 dark:bg-cyan-950/30'
                    : 'border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/40 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center text-base sm:text-lg shrink-0">
                        🇺🇸
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 flex-wrap">
                          <span>Eric</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            US Confident
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                          en-US-EricNeural
                        </div>
                      </div>
                    </div>
                    {voicePrefs.ttsServerVoice === 'en-US-EricNeural' && (
                      <span className="text-[10px] sm:text-[11px] font-semibold text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping"></span>
                        Aktif
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-2.5 leading-relaxed">
                    Pria Amerika bernada modern, energik, tegas & percaya diri.
                  </p>

                  <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-slate-200/60 dark:border-slate-800/60">
                    <button
                      type="button"
                      onClick={() => togglePlayPreviewFile('/api/tts/previews/3-Eric-EN.mp3', '3-Eric-EN.mp3')}
                      className={`w-full text-xs py-2 px-2 rounded-xl border flex items-center justify-center gap-1.5 font-medium transition ${
                        playingFile === '3-Eric-EN.mp3'
                          ? 'bg-amber-500 text-white border-amber-500 shadow-sm animate-pulse'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {playingFile === '3-Eric-EN.mp3' ? '⏹ Stop' : '▶ EN Sample'}
                    </button>

                    <button
                      type="button"
                      onClick={() => togglePlayPreviewFile('/api/tts/previews/3-Eric-ID.mp3', '3-Eric-ID.mp3')}
                      className={`w-full text-xs py-2 px-2 rounded-xl border flex items-center justify-center gap-1.5 font-medium transition ${
                        playingFile === '3-Eric-ID.mp3'
                          ? 'bg-amber-500 text-white border-amber-500 shadow-sm animate-pulse'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {playingFile === '3-Eric-ID.mp3' ? '⏹ Stop' : '▶ ID Sample'}
                    </button>
                  </div>
                </div>

                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => setVoicePrefs({ ...voicePrefs, ttsServerVoice: 'en-US-EricNeural', ttsEngine: 'server' })}
                    disabled={voicePrefs.ttsServerVoice === 'en-US-EricNeural' && voicePrefs.ttsEngine === 'server'}
                    className="w-full py-2.5 px-3 rounded-xl text-xs font-semibold bg-slate-900 dark:bg-slate-800 text-white hover:bg-cyan-600 dark:hover:bg-cyan-600 disabled:opacity-40 disabled:hover:bg-slate-900 transition flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    {voicePrefs.ttsServerVoice === 'en-US-EricNeural' && voicePrefs.ttsEngine === 'server'
                      ? '✓ Suara Terpilih'
                      : 'Pilih Suara Eric'}
                  </button>
                </div>
              </div>

              {/* 4. Andrew Card */}
              <div
                className={`rounded-2xl border transition p-3.5 sm:p-4 relative overflow-hidden flex flex-col justify-between ${
                  voicePrefs.ttsServerVoice === 'en-US-AndrewNeural'
                    ? 'border-cyan-500 ring-1 ring-cyan-500/50 bg-cyan-950/10 dark:bg-cyan-950/30'
                    : 'border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/40 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-purple-500/10 dark:bg-purple-500/20 flex items-center justify-center text-base sm:text-lg shrink-0">
                        🇺🇸
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 flex-wrap">
                          <span>Andrew</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                            US Warm
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                          en-US-AndrewNeural
                        </div>
                      </div>
                    </div>
                    {voicePrefs.ttsServerVoice === 'en-US-AndrewNeural' && (
                      <span className="text-[10px] sm:text-[11px] font-semibold text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping"></span>
                        Aktif
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-2.5 leading-relaxed">
                    Pria Amerika bernada hangat, ramah dan santai cocok untuk asisten harian.
                  </p>

                  <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-slate-200/60 dark:border-slate-800/60">
                    <button
                      type="button"
                      onClick={() => togglePlayPreviewFile('/api/tts/previews/4-Andrew-EN.mp3', '4-Andrew-EN.mp3')}
                      className={`w-full text-xs py-2 px-2 rounded-xl border flex items-center justify-center gap-1.5 font-medium transition ${
                        playingFile === '4-Andrew-EN.mp3'
                          ? 'bg-amber-500 text-white border-amber-500 shadow-sm animate-pulse'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {playingFile === '4-Andrew-EN.mp3' ? '⏹ Stop' : '▶ EN Sample'}
                    </button>

                    <button
                      type="button"
                      onClick={() => togglePlayPreviewFile('/api/tts/previews/4-Andrew-ID.mp3', '4-Andrew-ID.mp3')}
                      className={`w-full text-xs py-2 px-2 rounded-xl border flex items-center justify-center gap-1.5 font-medium transition ${
                        playingFile === '4-Andrew-ID.mp3'
                          ? 'bg-amber-500 text-white border-amber-500 shadow-sm animate-pulse'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {playingFile === '4-Andrew-ID.mp3' ? '⏹ Stop' : '▶ ID Sample'}
                    </button>
                  </div>
                </div>

                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => setVoicePrefs({ ...voicePrefs, ttsServerVoice: 'en-US-AndrewNeural', ttsEngine: 'server' })}
                    disabled={voicePrefs.ttsServerVoice === 'en-US-AndrewNeural' && voicePrefs.ttsEngine === 'server'}
                    className="w-full py-2.5 px-3 rounded-xl text-xs font-semibold bg-slate-900 dark:bg-slate-800 text-white hover:bg-cyan-600 dark:hover:bg-cyan-600 disabled:opacity-40 disabled:hover:bg-slate-900 transition flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    {voicePrefs.ttsServerVoice === 'en-US-AndrewNeural' && voicePrefs.ttsEngine === 'server'
                      ? '✓ Suara Terpilih'
                      : 'Pilih Suara Andrew'}
                  </button>
                </div>
              </div>
            </div>

            {/* 5. JARVIS Master & Cloned Feature Card */}
            <div className={`rounded-2xl border transition p-3.5 sm:p-5 relative overflow-hidden ${
              (voicePrefs.ttsServerVoice ?? 'en-GB-RyanNeural') === 'en-GB-RyanNeural' && voicePrefs.ttsEngine === 'server'
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
                      {(voicePrefs.ttsServerVoice ?? 'en-GB-RyanNeural') === 'en-GB-RyanNeural' && voicePrefs.ttsEngine === 'server' && (
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
                  Suara model AI: <span className="font-mono font-bold">en-GB-RyanNeural</span> (Aksen Paul Bettany JARVIS)
                </span>
                <button
                  type="button"
                  onClick={() => setVoicePrefs({ ...voicePrefs, ttsServerVoice: 'en-GB-RyanNeural', ttsEngine: 'server' })}
                  disabled={(voicePrefs.ttsServerVoice ?? 'en-GB-RyanNeural') === 'en-GB-RyanNeural' && voicePrefs.ttsEngine === 'server'}
                  className="w-full sm:w-auto px-4 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 disabled:opacity-50 disabled:hover:bg-amber-500 transition shadow-sm"
                >
                  {(voicePrefs.ttsServerVoice ?? 'en-GB-RyanNeural') === 'en-GB-RyanNeural' && voicePrefs.ttsEngine === 'server'
                    ? '✓ Suara JARVIS Master Aktif'
                    : 'Gunakan 5-jarvis.mp3 Sebagai Default'}
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
                            (voicePrefs.ttsServerVoice ?? 'en-GB-RyanNeural') === f.voice_id && voicePrefs.ttsEngine === 'server'
                              ? 'bg-cyan-500 text-white border-cyan-500 font-semibold'
                              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-cyan-400'
                          }`}
                        >
                          {(voicePrefs.ttsServerVoice ?? 'en-GB-RyanNeural') === f.voice_id && voicePrefs.ttsEngine === 'server'
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
