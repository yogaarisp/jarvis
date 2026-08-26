import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { SttEngine } from '../lib/voice'
import type { VoicePrefs } from '../types'

interface CommandInputProps {
  disabled?: boolean
  busy?: boolean
  voicePrefs: VoicePrefs
  sttAvailable: boolean
  onSend: (message: string) => void
}

export function CommandInput({
  disabled,
  busy,
  voicePrefs,
  sttAvailable,
  onSend,
}: CommandInputProps) {
  const [value, setValue] = useState('')
  const [micActive, setMicActive] = useState(false)
  const [interim, setInterim] = useState('')
  const [holdHint, setHoldHint] = useState(false)
  const sttRef = useRef<SttEngine | null>(null)
  const spaceDownAt = useRef<number | null>(null)
  // Teks yang sudah diketik user sebelum mic dinyalakan (dipisah dari hasil voice).
  const typedBaseRef = useRef('')
  const finalizeTimer = useRef<number | null>(null)

  useEffect(() => {
    const engine = new SttEngine(voicePrefs.language, false)
    engine.onStart = () => setMicActive(true)
    engine.onStop = () => setMicActive(false)
    engine.onInterim = (txt) => setInterim(txt)
    engine.onError = (m) => {
      setMicActive(false)
      console.warn('[STT]', m)
    }
    // onFinal mengirim transkrip KUMULATIF → replace, jangan di-append
    // (append menyebabkan teks dobel/kacau saat ada beberapa potongan final).
    engine.onFinal = (txt) => {
      setInterim('')
      setValue((typedBaseRef.current ? typedBaseRef.current + ' ' : '') + txt.trim())
    }
    sttRef.current = engine
    return () => {
      engine.cancel()
      if (finalizeTimer.current) window.clearTimeout(finalizeTimer.current)
    }
  }, [voicePrefs.language])

  function startMic() {
    const engine = sttRef.current
    if (!engine || !engine.isAvailable()) return
    if (engine.isListening()) return
    typedBaseRef.current = value.trim()
    setInterim('')
    engine.start()
  }

  /** Gabungkan teks ketikan + hasil voice (final + sisa interim), lalu kirim bila diminta. */
  function finalizeMic(send: boolean) {
    const engine = sttRef.current
    if (!engine) return

    const finalText = engine.finalText.trim()
    // Interim = slot hasil aktif yang belum difinalisasi Chrome (bukan duplikat final).
    const pending = engine.interimText.trim()
    const combined = [typedBaseRef.current, finalText, pending]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(' ')

    // Hentikan total & bersihkan state engine agar event telat tidak menimpa.
    engine.cancel()
    setInterim('')
    setValue(combined)

    if (send && combined && !busy) {
      onSend(combined)
      setValue('')
    }
    typedBaseRef.current = ''
  }

  function stopMic(send = false) {
    const engine = sttRef.current
    if (!engine) return
    // Chrome bisa berhenti lebih dulu saat hening → izinkan finalize dari transkrip tersisa.
    if (!engine.isListening() && !engine.hasTranscript()) return

    engine.stop()

    // Beri jeda singkat agar Chrome sempat mengirim hasil final terakhir,
    // lalu kunci hasil dan (opsional) kirim otomatis.
    if (finalizeTimer.current) window.clearTimeout(finalizeTimer.current)
    finalizeTimer.current = window.setTimeout(() => {
      finalizeTimer.current = null
      finalizeMic(send)
    }, 450)
  }

  function toggleMic(e: React.MouseEvent) {
    e.preventDefault()
    if (!sttAvailable || !voicePrefs.sttEnabled) return
    const engine = sttRef.current
    if (!engine) return
    if (engine.isListening()) {
      stopMic(false)
    } else {
      startMic()
    }
  }

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.target && /input|textarea|select/i.test((e.target as HTMLElement).tagName)) {
        // biarin field lain normal
        if (document.activeElement?.tagName !== 'INPUT') return
      }
      if (e.code !== 'Space' || e.repeat) return
      if (busy || disabled) return
      // Hanya enter key mode jika fokus input tidak menangkap space
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      e.preventDefault()
      spaceDownAt.current = Date.now()
      setHoldHint(true)
      startMic()
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      if (!spaceDownAt.current) return
      spaceDownAt.current = null
      setHoldHint(false)
      const heldMs = Date.now() - (spaceDownAt.current ?? Date.now())
      stopMic(heldMs < 2000 ? false : true)
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [busy, disabled, value])

  function submit(event: FormEvent) {
    event.preventDefault()
    const message = (value + (interim ? ' ' + interim : '')).trim()
    if (!message || busy) return
    onSend(message)
    setValue('')
    setInterim('')
  }

  const composingValue = value + (interim ? (value ? ' ' : '') + interim : '')
  const micDisabled = disabled || busy || !sttAvailable || !voicePrefs.sttEnabled

  return (
    <form onSubmit={submit} className="glass box-glow-cyan flex items-center gap-2 rounded-2xl p-2 pl-4">
      <span className="hidden text-xs font-semibold tracking-[0.3em] text-jarvis-cyan/60 sm:block">
        &gt;
      </span>
      <div className="min-w-0 flex-1">
        {(interim || value) && (
          <div className="pointer-events-none mb-0.5 text-[10px] uppercase tracking-[0.3em] text-jarvis-cyan/60">
            {micActive && !interim ? 'mendengarkan…' : holdHint ? 'tahan space untuk bicara' : ''}
          </div>
        )}
        <input
          value={composingValue}
          onChange={(e) => setValue(e.target.value)}
          placeholder={
            disabled
              ? 'Sistem offline…'
              : micDisabled
                ? 'Berikan perintah kepada JARVIS…'
                : 'Ketik / tahan Space / klik mic'
          }
          disabled={disabled || busy}
          className="w-full min-w-0 bg-transparent py-2.5 text-[15px] tracking-wide text-cyan-50 placeholder:text-cyan-200/25 disabled:opacity-40 outline-none"
        />
      </div>
      <button
        type="button"
        title={micDisabled ? (voicePrefs.sttEnabled ? 'STT tidak tersedia' : 'STT dimatikan di pengaturan') : 'Klik / tahan Space untuk bicara (lepaskan = kirim)'}
        disabled={micDisabled}
        onClick={toggleMic}
        onMouseDown={() => !micDisabled && startMic()}
        onMouseUp={() => !micDisabled && stopMic(true)}
        onMouseLeave={() => micActive && !micDisabled && stopMic(false)}
        onTouchStart={(e) => {
          e.preventDefault()
          if (!micDisabled) startMic()
        }}
        onTouchEnd={(e) => {
          e.preventDefault()
          if (!micDisabled) stopMic(true)
        }}
        aria-label="Voice input"
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition ${
          micActive
            ? 'border-red-400/60 bg-red-500/15 animate-pulse'
            : 'border-jarvis-cyan/20 bg-jarvis-navy/40 hover:border-jarvis-cyan/40 hover:bg-jarvis-cyan/10'
        } ${micDisabled ? 'opacity-40 cursor-not-allowed hover:border-jarvis-cyan/20 hover:bg-jarvis-navy/40' : ''}`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={`h-5 w-5 ${micActive ? 'text-red-400' : 'text-jarvis-cyan'}`}>
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
        </svg>
      </button>
      <button
        type="submit"
        disabled={disabled || busy || !composingValue.trim()}
        aria-label="Kirim perintah"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-jarvis-cyan/50 bg-jarvis-cyan/15 transition hover:bg-jarvis-cyan/30 disabled:cursor-not-allowed disabled:opacity-30"
      >
        {busy ? (
          <svg viewBox="0 0 24 24" className="h-5 w-5 animate-spin text-jarvis-cyan" fill="none">
            <circle cx="12" cy="12" r="9" strokeOpacity="0.2" stroke="currentColor" strokeWidth="2.5" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5 text-jarvis-cyan">
            <path d="M5 12h13m0 0-5.5-5.5M18 12l-5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
    </form>
  )
}
