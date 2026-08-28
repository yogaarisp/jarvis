import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { JarvisState, VoicePrefs } from '../types'

interface VoiceHudCenterProps {
  state: JarvisState
  micActive: boolean
  wakeRunning?: boolean
  wakeListening: boolean
  micDisabled: boolean
  voicePrefs: VoicePrefs
  sttAvailable: boolean
  latestTransmission: string
  inputText: string
  onInputChange: (val: string) => void
  onSubmit: (e: FormEvent) => void
  onToggleMic: (e: React.MouseEvent) => void
  onToggleWake?: () => void
  onMouseDownMic: () => void
  onMouseUpMic: () => void
  onMouseLeaveMic: () => void
  onTouchStartMic: (e: React.TouchEvent) => void
  onTouchEndMic: (e: React.TouchEvent) => void
  busy: boolean
}

export function VoiceHudCenter({
  state,
  micActive,
  wakeRunning,
  micDisabled,
  latestTransmission,
  inputText,
  onInputChange,
  onSubmit,
  onToggleMic,
  onToggleWake,
  onMouseDownMic,
  onMouseUpMic,
  onMouseLeaveMic,
  onTouchStartMic,
  onTouchEndMic,
  busy,
}: VoiceHudCenterProps) {
  const isListening = micActive || state === 'LISTENING'
  const [showInput, setShowInput] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-focus input saat muncul (cleanup timer agar tidak reopen keyboard saat bar ditutup)
  useEffect(() => {
    if (!showInput) return
    const t = setTimeout(() => inputRef.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [showInput])

  function handleSubmit(e: FormEvent) {
    onSubmit(e)
    // Blur sebelum menyembunyikan bar agar keyboard virtual HP ikut menutup otomatis.
    inputRef.current?.blur()
    setShowInput(false)
  }

  function toggleInput() {
    if (showInput) {
      inputRef.current?.blur()
      setShowInput(false)
    } else {
      setShowInput(true)
    }
  }

  return (
    <div className="relative flex flex-col items-center justify-between h-full w-full max-w-2xl px-2 py-2 sm:py-3">

      {/* Top: Latest Transmission */}
      <div className="w-full max-w-md">
        <div className="rounded-xl border border-cyan-400/25 bg-cyan-950/30 backdrop-blur-sm px-4 py-2.5 text-center">
          <div className={`font-mono-tech text-xs sm:text-sm font-medium tracking-wide leading-snug ${
            state === 'ERROR' ? 'text-rose-400' : 'text-cyan-200/90'
          }`}>
            {latestTransmission || (
              <span className="text-cyan-400/50 text-[11px] tracking-widest">JARVIS ONLINE</span>
            )}
          </div>
        </div>
      </div>

      {/* Spacer — globe di background */}
      <div className="flex-1 pointer-events-none" />

      {/* Bottom Controls */}
      <div className="flex flex-col items-center gap-3 w-full max-w-sm z-20">

        {/* Status label */}
        <div className="font-mono-tech flex items-center gap-2 text-[10px] tracking-[0.2em] text-cyan-400/60">
          <span className={`h-1.5 w-1.5 rounded-full transition-colors ${
            isListening
              ? 'bg-rose-400 shadow-[0_0_6px_#f43f5e] animate-ping'
              : wakeRunning
                ? 'bg-emerald-400 shadow-[0_0_6px_#34d399] animate-pulse'
                : 'bg-cyan-500/40'
          }`} />
          <span>
            {isListening ? 'LISTENING' : wakeRunning ? 'WAKE ACTIVE' : 'STANDBY'}
          </span>
        </div>

        {/* Mic + Keyboard buttons */}
        <div className="flex items-center gap-4">

          {/* Mic Button */}
          <button
            type="button"
            disabled={micDisabled}
            onClick={onToggleMic}
            onMouseDown={onMouseDownMic}
            onMouseUp={onMouseUpMic}
            onMouseLeave={onMouseLeaveMic}
            onTouchStart={onTouchStartMic}
            onTouchEnd={onTouchEndMic}
            title="Tahan untuk bicara"
            aria-label="Voice input"
            className={`relative flex h-14 w-14 items-center justify-center rounded-full border-2 transition-all duration-300 ${
              isListening
                ? 'border-rose-400 bg-rose-500/20 shadow-[0_0_28px_#f43f5e,0_0_60px_rgba(244,63,94,0.2)]'
                : state === 'SPEAKING'
                  ? 'border-amber-400 bg-amber-500/15 shadow-[0_0_28px_#fbbf24]'
                  : 'border-cyan-400/70 bg-cyan-950/50 shadow-[0_0_20px_rgba(0,229,255,0.3)] hover:shadow-[0_0_32px_rgba(0,229,255,0.5)] hover:scale-105 active:scale-95'
            } ${micDisabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            {/* Outer ring pulse saat listening */}
            {isListening && (
              <span className="absolute inset-0 rounded-full border border-rose-400/40 animate-ping" />
            )}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className={`h-5 w-5 ${
                isListening ? 'text-rose-300 animate-pulse' :
                state === 'SPEAKING' ? 'text-amber-300' : 'text-cyan-300'
              }`}
            >
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
            </svg>
          </button>

          {/* Keyboard Button */}
          <button
            type="button"
            onClick={toggleInput}
            title="Ketik pesan"
            aria-label="Keyboard input"
            className={`flex h-14 w-14 items-center justify-center rounded-full border-2 transition-all duration-300 ${
              showInput
                ? 'border-cyan-400 bg-cyan-500/20 shadow-[0_0_20px_rgba(0,229,255,0.4)]'
                : 'border-cyan-400/30 bg-cyan-950/40 text-cyan-400/60 hover:border-cyan-400/60 hover:text-cyan-300 hover:shadow-[0_0_16px_rgba(0,229,255,0.25)]'
            } cursor-pointer`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
              className={`h-5 w-5 ${showInput ? 'text-cyan-300' : 'text-cyan-400/60'}`}
            >
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="M8 8h.01M12 8h.01M16 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10" strokeLinecap="round" />
            </svg>
          </button>

          {/* Wake Engine Button */}
          {onToggleWake && (
            <button
              type="button"
              onClick={onToggleWake}
              disabled={busy}
              title={wakeRunning ? 'Matikan Wake Engine' : 'Aktifkan Wake Engine'}
              aria-label="Wake engine toggle"
              className={`flex h-14 w-14 items-center justify-center rounded-full border-2 transition-all duration-300 ${
                wakeRunning
                  ? 'border-emerald-400/80 bg-emerald-950/40 shadow-[0_0_20px_rgba(52,211,153,0.35)]'
                  : 'border-cyan-400/30 bg-cyan-950/40 hover:border-emerald-400/40 hover:shadow-[0_0_16px_rgba(52,211,153,0.2)]'
              } ${busy ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              {/* Wave/Sound icon */}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
                className={`h-5 w-5 ${wakeRunning ? 'text-emerald-300' : 'text-cyan-400/60'}`}
              >
                <path d="M12 1v22M8 5v14M4 9v6M16 5v14M20 9v6" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>

        {/* Input bar — muncul saat showInput = true */}
        <div className={`w-full overflow-hidden transition-all duration-300 ease-in-out ${
          showInput ? 'max-h-20 opacity-100 translate-y-0' : 'max-h-0 opacity-0 -translate-y-1 pointer-events-none'
        }`}>
          <form onSubmit={handleSubmit} className="w-full">
            <div className="flex items-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-950/60 backdrop-blur-sm px-3 py-2 shadow-[0_0_20px_rgba(0,229,255,0.1)]">
              <span className="font-mono-tech text-cyan-400/70 font-bold text-sm">&gt;</span>
              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={(e) => onInputChange(e.target.value)}
                disabled={busy}
                enterKeyHint="send"
                autoComplete="off"
                placeholder="Type your command..."
                className="font-mono-tech flex-1 bg-transparent py-1 text-xs sm:text-sm text-cyan-100 placeholder:text-cyan-400/30 outline-none tracking-wide"
              />
              <button
                type="submit"
                disabled={busy || !inputText.trim()}
                className="font-mono-tech rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-[10px] font-bold tracking-widest text-cyan-300 transition-all hover:bg-cyan-500/20 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {busy ? '···' : 'SEND'}
              </button>
            </div>
          </form>
        </div>

      </div>
    </div>
  )
}
