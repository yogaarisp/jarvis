import { useEffect, useMemo, useState } from 'react'
import { SERVER_VOICES, SttEngine, TtsEngine } from '../lib/voice'
import type { VoicePrefs, WakeSettings } from '../types'

interface SettingsPanelProps {
  open: boolean
  onClose: () => void
  /** true = render konten saja tanpa overlay full-screen (untuk dipakai di dalam modal lain). */
  inline?: boolean
  voicePrefs: VoicePrefs
  onChangeVoice: (prefs: VoicePrefs) => void
  wakeSettings: WakeSettings
  onChangeWake: (s: WakeSettings) => void
  wakeRunning: boolean
  wakeError: string | null
  onToggleWake: (want: boolean) => void
  micLevel: number
}

export function SettingsPanel({
  open,
  onClose,
  inline = false,
  voicePrefs,
  onChangeVoice,
  wakeSettings,
  onChangeWake,
  wakeRunning,
  wakeError,
  onToggleWake,
  micLevel,
}: SettingsPanelProps) {
  const sttOk = typeof window !== 'undefined' && 'webkitSpeechRecognition' in window
  const ttsOk = typeof window !== 'undefined' && 'speechSynthesis' in window
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [previewSpeaking, setPreviewSpeaking] = useState(false)
  const ttsRef = useMemo(() => (ttsOk ? new TtsEngine(voicePrefs) : null), [ttsOk])

  useEffect(() => {
    if (!ttsOk) return
    const refresh = () => setVoices(window.speechSynthesis.getVoices())
    refresh()
    window.speechSynthesis.onvoiceschanged = refresh
  }, [ttsOk])

  useEffect(() => {
    ttsRef?.updatePrefs(voicePrefs)
  }, [ttsRef, voicePrefs])

  if (!open) return null

  function playPreview() {
    if (!ttsRef) return
    ttsRef.onStart = () => setPreviewSpeaking(true)
    ttsRef.onEnd = () => setPreviewSpeaking(false)
    ttsRef.speak(
      voicePrefs.language.startsWith('id')
        ? 'Sistem JARVIS siap, Keenan.'
        : 'JARVIS systems ready, Keenan.',
    )
  }

  function resetVoiceDefaults() {
    const defaults: VoicePrefs = {
      sttEnabled: true,
      ttsEnabled: true,
      ttsRate: 1,
      ttsPitch: 1,
      language: 'id-ID',
      voiceName: undefined,
    }
    onChangeVoice(defaults)
  }

  return (
    <div
      className={
        inline
          ? 'glass rounded-2xl border border-jarvis-cyan/20'
          : 'fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4'
      }
      onClick={inline ? undefined : onClose}
    >
      <div
          className={
            inline
              ? ''
              : 'glass w-full sm:max-w-xl rounded-t-3xl sm:rounded-2xl max-h-[90vh] overflow-y-auto border border-jarvis-cyan/20'
          }
          onClick={inline ? undefined : (e) => e.stopPropagation()}
        >
        {!inline && (
          <header className="flex items-center justify-between px-5 py-4 border-b border-white/5">
            <div>
              <h2 className="font-display text-sm font-bold tracking-[0.3em] text-jarvis-cyan">
                PENGATURAN SUARA · WAKE
              </h2>
              <p className="text-xs text-cyan-200/50 mt-1">
                Semua audio diproses lokal di browser — tidak pernah dikirim ke server.
              </p>
            </div>
            <button onClick={onClose} className="w-9 h-9 rounded-lg border border-white/10 hover:bg-white/5 text-cyan-100/80" aria-label="Tutup">
              ✕
            </button>
          </header>
        )}

        <section className="p-5 space-y-4">
          <h3 className="text-[11px] font-semibold tracking-[0.35em] text-jarvis-gold">
            VOICE · STT / TTS
          </h3>

          <div className="grid grid-cols-2 gap-3">
            <label className="glass p-3 rounded-xl flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={voicePrefs.sttEnabled && sttOk}
                disabled={!sttOk}
                onChange={(e) => onChangeVoice({ ...voicePrefs, sttEnabled: e.target.checked })}
                className="mt-1"
              />
              <div>
                <div className="text-sm font-medium text-cyan-50">Press-to-talk (STT)</div>
                <div className="text-xs text-cyan-200/50 mt-0.5">
                  {sttOk ? 'Tahan Space / klik mic' : 'Tidak tersedia (Chrome/Edge disarankan)'}
                </div>
              </div>
            </label>
            <label className="glass p-3 rounded-xl flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={voicePrefs.ttsEnabled && ttsOk}
                disabled={!ttsOk}
                onChange={(e) => onChangeVoice({ ...voicePrefs, ttsEnabled: e.target.checked })}
                className="mt-1"
              />
              <div>
                <div className="text-sm font-medium text-cyan-50">Auto-speak (TTS)</div>
                <div className="text-xs text-cyan-200/50 mt-0.5">
                  {ttsOk ? 'Suara jawaban dibacakan' : 'TTS tidak didukung'}
                </div>
              </div>
            </label>
          </div>

          <div className="glass p-4 rounded-xl space-y-3">
            <label className="block">
              <span className="text-xs text-cyan-200/60 tracking-wide">Mesin Suara (TTS)</span>
              <select
                value={voicePrefs.ttsEngine ?? 'server'}
                onChange={(e) =>
                  onChangeVoice({
                    ...voicePrefs,
                    ttsEngine: e.target.value === 'browser' ? 'browser' : 'server',
                  })
                }
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 text-sm px-3 py-2 text-cyan-50"
              >
                <option value="server">Server · JARVIS Neural (pria Inggris)</option>
                <option value="browser">Browser · Suara lokal perangkat</option>
              </select>
            </label>

            <label className="block">
              <span className="text-xs text-cyan-200/60 tracking-wide">Bahasa</span>
              <select
                value={voicePrefs.language}
                onChange={(e) => onChangeVoice({ ...voicePrefs, language: e.target.value })}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 text-sm px-3 py-2 text-cyan-50"
              >
                <option value="id-ID">Indonesia (id-ID)</option>
                <option value="en-US">English (en-US)</option>
                <option value="en-GB">English (en-GB)</option>
              </select>
            </label>

            {(voicePrefs.ttsEngine ?? 'server') === 'server' ? (
              <label className="block">
                <span className="text-xs text-cyan-200/60 tracking-wide">
                  Suara JARVIS (Neural)
                </span>
                <select
                  value={voicePrefs.ttsServerVoice ?? 'en-GB-RyanNeural'}
                  onChange={(e) =>
                    onChangeVoice({ ...voicePrefs, ttsServerVoice: e.target.value })
                  }
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 text-sm px-3 py-2 text-cyan-50"
                >
                  {SERVER_VOICES.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              voices.length > 0 && (
              <label className="block">
                <span className="text-xs text-cyan-200/60 tracking-wide">Suara (TTS)</span>
                <select
                  value={voicePrefs.voiceName ?? ''}
                  onChange={(e) =>
                    onChangeVoice({ ...voicePrefs, voiceName: e.target.value || undefined })
                  }
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 text-sm px-3 py-2 text-cyan-50"
                >
                  <option value="">— Default · Pria Inggris (JARVIS) —</option>
                  {voices.map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </select>
              </label>
              )
            )}

            <div className="grid grid-cols-2 gap-3">
              <label>
                <div className="flex items-center justify-between text-xs text-cyan-200/60">
                  <span>Kecepatan</span>
                  <span className="tabular-nums">{voicePrefs.ttsRate.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min={0.6}
                  max={1.6}
                  step={0.05}
                  value={voicePrefs.ttsRate}
                  onChange={(e) =>
                    onChangeVoice({ ...voicePrefs, ttsRate: Number(e.target.value) })
                  }
                  className="w-full mt-1"
                />
              </label>
              <label>
                <div className="flex items-center justify-between text-xs text-cyan-200/60">
                  <span>Nada</span>
                  <span className="tabular-nums">{voicePrefs.ttsPitch.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0.6}
                  max={1.6}
                  step={0.05}
                  value={voicePrefs.ttsPitch}
                  onChange={(e) =>
                    onChangeVoice({ ...voicePrefs, ttsPitch: Number(e.target.value) })
                  }
                  className="w-full mt-1"
                />
              </label>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={playPreview}
                disabled={!ttsOk || previewSpeaking}
                className="text-xs px-3 py-1.5 rounded-lg border border-jarvis-cyan/40 hover:bg-jarvis-cyan/10 text-jarvis-cyan disabled:opacity-40"
              >
                {previewSpeaking ? 'Bicara…' : 'Tes suara'}
              </button>
              <button
                type="button"
                onClick={resetVoiceDefaults}
                className="text-xs px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-cyan-200/70"
              >
                Reset
              </button>
            </div>
          </div>

          <h3 className="pt-2 text-[11px] font-semibold tracking-[0.35em] text-jarvis-gold">
            WAKE ENGINE · DOUBLE CLAP
          </h3>

          <div className="glass p-4 rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-cyan-50">Deteksi tepukan</div>
                <div className="text-xs text-cyan-200/50 mt-0.5">
                  {wakeRunning ? 'Mendengarkan mic…' : 'Belum berjalan'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onToggleWake(!wakeRunning)}
                disabled={!wakeSettings.clap_enabled || typeof window === 'undefined' || !window.AudioContext}
                className={`px-3 py-1.5 rounded-lg text-xs border ${
                  wakeRunning
                    ? 'border-red-400/60 bg-red-500/10 text-red-300'
                    : 'border-jarvis-cyan/40 bg-jarvis-cyan/10 text-jarvis-cyan'
                } disabled:opacity-40`}
              >
                {wakeRunning ? 'Matikan' : 'Aktifkan'}
              </button>
            </div>

            {wakeError && (
              <div className="text-xs p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-300">
                {wakeError}
              </div>
            )}

            {wakeRunning && (
              <div className="flex items-center gap-3">
                <div className="h-2 flex-1 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full bg-jarvis-cyan/80 transition-all"
                    style={{ width: `${Math.min(100, micLevel * 2000)}%` }}
                  />
                </div>
                <span className="text-[10px] tabular-nums text-cyan-200/50 w-10 text-right">
                  {(micLevel * 100).toFixed(0)}
                </span>
              </div>
            )}

            <label className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm text-cyan-50">Aktifkan double/triple clap wake</div>
                <div className="text-xs text-cyan-200/50 mt-0.5">
                  Bila dinonaktifkan, deteksi otomatis tidak akan berjalan.
                </div>
              </div>
              <input
                type="checkbox"
                checked={wakeSettings.clap_enabled}
                onChange={(e) => onChangeWake({ ...wakeSettings, clap_enabled: e.target.checked })}
                className="mt-1 scale-110"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-cyan-200/60 tracking-wide">Jumlah tepukan</span>
                <select
                  value={wakeSettings.claps_required}
                  onChange={(e) =>
                    onChangeWake({
                      ...wakeSettings,
                      claps_required: Number(e.target.value) as 2 | 3,
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 text-sm px-3 py-2 text-cyan-50"
                >
                  <option value={2}>Double clap (2x)</option>
                  <option value={3}>Triple clap (3x)</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-cyan-200/60 tracking-wide">Sensitivitas</span>
                <select
                  value={wakeSettings.sensitivity}
                  onChange={(e) =>
                    onChangeWake({
                      ...wakeSettings,
                      sensitivity: e.target.value as WakeSettings['sensitivity'],
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 text-sm px-3 py-2 text-cyan-50"
                >
                  <option value="low">Rendah (kurang sensitif)</option>
                  <option value="medium">Sedang</option>
                  <option value="high">Tinggi (mudah terpancing)</option>
                </select>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label>
                <div className="flex items-center justify-between text-xs text-cyan-200/60">
                  <span>Jendela deteksi</span>
                  <span className="tabular-nums">{wakeSettings.window_ms} ms</span>
                </div>
                <input
                  type="range"
                  min={300}
                  max={1500}
                  step={50}
                  value={wakeSettings.window_ms}
                  onChange={(e) =>
                    onChangeWake({ ...wakeSettings, window_ms: Number(e.target.value) })
                  }
                  className="w-full mt-1"
                />
              </label>
              <label>
                <div className="flex items-center justify-between text-xs text-cyan-200/60">
                  <span>Cooldown</span>
                  <span className="tabular-nums">{wakeSettings.cooldown_ms} ms</span>
                </div>
                <input
                  type="range"
                  min={500}
                  max={8000}
                  step={250}
                  value={wakeSettings.cooldown_ms}
                  onChange={(e) =>
                    onChangeWake({ ...wakeSettings, cooldown_ms: Number(e.target.value) })
                  }
                  className="w-full mt-1"
                />
              </label>
            </div>

            <p className="text-[11px] leading-relaxed text-cyan-200/40">
              Tip: coba <strong>double clap (2 kali tepuk)</strong> dalam 650 ms untuk membangunkan JARVIS.
              Setelah terbangun, mic <em>continuous</em> STT (
              <span className="text-jarvis-cyan">{SttEngine?.name ?? 'STT'}</span>) mulai —
              ucapkan perintah, lalu diam, hasil otomatis dikirim.
            </p>
          </div>
        </section>

        <footer className="px-5 py-3 border-t border-white/5 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-jarvis-cyan/50 bg-jarvis-cyan/15 hover:bg-jarvis-cyan/25 text-jarvis-cyan text-sm"
          >
            Simpan & Tutup
          </button>
        </footer>
      </div>
    </div>
  )
}
