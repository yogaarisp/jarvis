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
  onMouseDownMic,
  onMouseUpMic,
  onMouseLeaveMic,
  onTouchStartMic,
  onTouchEndMic,
  busy,
}: VoiceHudCenterProps) {
  const isListening = micActive || state === 'LISTENING'

  return (
    <div className="relative flex flex-col items-center justify-between h-full w-full max-w-2xl px-2 py-2 sm:py-3">
      {/* Top Center: LATEST TRANSMISSION Box */}
      <div className="hud-corner-box w-full max-w-lg rounded-lg sm:rounded-xl border border-cyan-400/40 p-2 sm:p-3 text-center shadow-[0_0_20px_rgba(0,229,255,0.12)]">
        <div className="font-mono-tech text-[9px] sm:text-[10px] font-semibold tracking-[0.2em] sm:tracking-[0.3em] text-cyan-400/60 uppercase">
          LATEST TRANSMISSION
        </div>
        <div className="font-mono-tech mt-1 text-[11px] sm:text-xs md:text-sm font-bold tracking-wider text-cyan-100 min-h-[1.2rem] sm:min-h-[1.5rem] max-h-[3rem] overflow-y-auto no-scrollbar flex items-center justify-center">
          {latestTransmission ? (
            <span className={state === 'ERROR' ? 'text-rose-400 text-glow-red' : 'text-cyan-200 text-glow-cyan'}>
              {latestTransmission}
            </span>
          ) : (
            <span className="text-cyan-300/80">SYSTEM ONLINE: JARVIS CORE READY</span>
          )}
        </div>
      </div>

      {/* Spacer for 3D Globe in the background */}
      <div className="flex-1 min-h-[80px] sm:min-h-[140px] pointer-events-none" />

      {/* Center Bottom: Arc Reactor Voice HUD */}
      <div className="relative flex flex-col items-center z-20 mt-auto mb-1 sm:mb-2">
        {/* Pulsing Arc Rings when listening / speaking */}
        <div className="relative flex items-center justify-center">
          {/* Animated concentric pulse rings */}
          <div
            className={`absolute h-24 w-24 rounded-full border border-cyan-400/30 transition-all duration-700 ${
              isListening ? 'animate-ping opacity-60' : 'opacity-20'
            }`}
          />
          <div
            className={`absolute h-20 w-20 rounded-full border border-cyan-300/40 transition-all ${
              isListening ? 'animate-spin-core border-dashed' : 'border-dotted opacity-30'
            }`}
          />

          {/* Central Circular Mic / Arc Reactor Button */}
          <button
            type="button"
            disabled={micDisabled}
            onClick={onToggleMic}
            onMouseDown={onMouseDownMic}
            onMouseUp={onMouseUpMic}
            onMouseLeave={onMouseLeaveMic}
            onTouchStart={onTouchStartMic}
            onTouchEnd={onTouchEndMic}
            title="Klik atau tahan untuk bicara (Lepas = Kirim)"
            aria-label="Voice Activation"
            className={`group relative flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full border-2 transition-all duration-300 ${
              isListening
                ? 'border-rose-400 bg-rose-500/20 shadow-[0_0_25px_#f43f5e]'
                : state === 'SPEAKING'
                  ? 'border-amber-400 bg-amber-500/20 shadow-[0_0_25px_#fbbf24]'
                  : 'border-cyan-400 bg-cyan-950/60 shadow-[0_0_20px_#00e5ff] hover:shadow-[0_0_30px_#00e5ff] hover:scale-105 active:scale-95'
            } ${micDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            {/* Inner Core Glow */}
            <div
              className={`h-9 w-9 rounded-full flex items-center justify-center transition-all ${
                isListening
                  ? 'bg-rose-500/40'
                  : state === 'SPEAKING'
                    ? 'bg-amber-400/40'
                    : 'bg-cyan-500/20 group-hover:bg-cyan-500/40'
              }`}
            >
              {/* Mic Icon */}
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={`h-5 w-5 ${
                  isListening
                    ? 'text-rose-300 animate-pulse'
                    : state === 'SPEAKING'
                      ? 'text-amber-300'
                      : 'text-cyan-300'
                }`}
              >
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
              </svg>
            </div>
          </button>
        </div>

        {/* Listening Status Badge */}
        <div className="mt-2 sm:mt-3">
          <div className="font-mono-tech flex items-center gap-1.5 sm:gap-2 rounded-full border border-cyan-500/40 bg-cyan-950/70 px-2.5 sm:px-3.5 py-1 text-[9px] sm:text-[11px] font-bold tracking-[0.15em] sm:tracking-[0.2em] text-cyan-300 shadow-[0_0_12px_rgba(0,229,255,0.2)]">
            <span
              className={`h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full ${
                isListening
                  ? 'bg-rose-400 shadow-[0_0_8px_#f43f5e] animate-ping'
                  : 'bg-cyan-400 shadow-[0_0_8px_#00e5ff]'
              }`}
            />
            <span>
              {isListening
                ? 'RECORDING...'
                : wakeRunning
                  ? 'WAKE AKTIF // TEPUK LALU BICARA'
                  : 'STANDBY // VOICE READY'}
            </span>
          </div>
        </div>
      </div>

      {/* Cyber Command Prompt Input Bar */}
      <form onSubmit={onSubmit} className="w-full z-20 mt-1">
        <div className="hud-panel flex items-center gap-1.5 sm:gap-2 rounded-lg sm:rounded-xl p-1 sm:p-1.5 pl-2 sm:pl-3 border border-cyan-500/40 shadow-[0_0_15px_rgba(0,229,255,0.15)]">
          <span className="font-mono-tech text-cyan-400 font-bold text-xs sm:text-sm tracking-widest">&gt;</span>
          <input
            type="text"
            value={inputText}
            onChange={(e) => onInputChange(e.target.value)}
            disabled={busy}
            placeholder="TYPE COMMAND..."
            className="font-mono-tech w-full bg-transparent py-1.5 sm:py-2 text-[11px] sm:text-xs md:text-sm text-cyan-100 placeholder:text-cyan-400/30 outline-none tracking-wider"
          />
          <button
            type="submit"
            disabled={busy || !inputText.trim()}
            className="font-mono-tech hud-btn rounded-md sm:rounded-lg px-2.5 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs font-bold tracking-[0.15em] sm:tracking-[0.2em] text-cyan-300 whitespace-nowrap disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {busy ? '...' : 'EXEC'}
          </button>
        </div>
      </form>
    </div>
  )
}
