import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, streamChat } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { HoloSphere } from '../components/HoloSphere'
import { ChronoSyncPanel } from '../components/ChronoSyncPanel'
import { SysHardwarePanel } from '../components/SysHardwarePanel'
import { EnvTelemetryPanel } from '../components/EnvTelemetryPanel'
import { TerminalFeed } from '../components/TerminalFeed'
import { VoiceHudCenter } from '../components/VoiceHudCenter'
import {
  DEFAULT_VOICE_PREFS,
  SttEngine,
  TtsEngine,
  isSttAvailable,
  isTtsAvailable,
  loadVoicePrefs,
  saveVoicePrefs,
} from '../lib/voice'
import type { ChatMessage, ConversationSummary, JarvisState, VoicePrefs } from '../types'

export function CorePage() {
  const { logout, booting } = useAuth()
  const navigate = useNavigate()

  const [state, setState] = useState<JarvisState>('IDLE')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversationId, setConversationId] = useState<number | null>(null)
  const [, setConversations] = useState<ConversationSummary[]>([])
  const [voicePrefs, setVoicePrefs] = useState<VoicePrefs>(DEFAULT_VOICE_PREFS)
  const [showLogs, setShowLogs] = useState(true)
  const [micLevel] = useState(0)
  const [micActive, setMicActive] = useState(false)
  const [inputText, setInputText] = useState('')
  const [latestTransmission, setLatestTransmission] = useState<string>('')

  const stateTimers = useRef<number[]>([])
  const ttsRef = useRef<TtsEngine | null>(null)
  const continuousSttRef = useRef<SttEngine | null>(null)
  const pushToTalkRef = useRef<SttEngine | null>(null)
  const busyRef = useRef(false)
  const spaceDownAt = useRef<number | null>(null)
  const continuousDesiredRef = useRef(false)

  const clearStateTimers = useCallback(() => {
    stateTimers.current.forEach((t) => window.clearTimeout(t))
    stateTimers.current = []
  }, [])

  const scheduleIdle = useCallback(
    (delay: number) => {
      stateTimers.current.push(window.setTimeout(() => setState('IDLE'), delay))
    },
    [],
  )

  useEffect(() => clearStateTimers, [clearStateTimers])

  const sttAvailable = useMemo(() => isSttAvailable(), [])
  const ttsAvailable = useMemo(() => isTtsAvailable(), [])

  // Load persistent voice settings on mount — only after auth token is ready
  useEffect(() => {
    setVoicePrefs(loadVoicePrefs())
  }, [booting])

  // Sync voice prefs
  useEffect(() => {
    saveVoicePrefs(voicePrefs)
    ttsRef.current?.updatePrefs(voicePrefs)
  }, [voicePrefs])

  // Resume continuous STT setelah JARVIS selesai menjawab (dipanggil dari TTS onEnd).
  const maybeResumeContinuous = useCallback(() => {
    if (!continuousDesiredRef.current) return
    if (!sttAvailable || !voicePrefs.sttEnabled) return
    if (busyRef.current) return
    window.setTimeout(() => {
      if (continuousDesiredRef.current && !continuousSttRef.current && !busyRef.current) {
        startContinuousStt()
      }
    }, 400)
  }, [sttAvailable, voicePrefs.sttEnabled])

  // Bootstrap TTS engine
  useEffect(() => {
    if (!ttsAvailable) return
    const engine = new TtsEngine(voicePrefs)
    engine.onStart = () => setState((s) => (s === 'COMPLETE' || s === 'IDLE' ? 'SPEAKING' : s))
    engine.onEnd = () => {
      setState((s) => (s === 'SPEAKING' ? 'COMPLETE' : s))
      maybeResumeContinuous()
    }
    ttsRef.current = engine
    return () => engine.cancel()
  }, [ttsAvailable, voicePrefs, maybeResumeContinuous])

  // Initial welcome greeting — time-aware, ditampilkan & diucapkan tiap halaman dibuka/refresh.
  // Catatan: browser memblokir audio sebelum interaksi pertama (autoplay policy),
  // jadi briefing suara diantrekan dan diucapkan pada klik/tekan tombol pertama.
  useEffect(() => {
    const h = new Date().getHours()
    const waktu =
      h >= 4 && h <= 10 ? 'pagi' : h >= 11 && h <= 14 ? 'siang' : h >= 15 && h <= 17 ? 'sore' : 'malam'
    const greeting = `Hai Keenan, selamat ${waktu}! I'm JARVIS.`

    setLatestTransmission(greeting)
    setMessages((prev) =>
      prev.length === 0 ? [{ id: Date.now(), role: 'assistant', content: greeting }] : prev,
    )

    let pending = greeting
    const speakPending = () => {
      if (!pending) return
      const g = pending
      pending = ''
      ttsRef.current?.speak(g)
      window.removeEventListener('pointerdown', speakPending)
      window.removeEventListener('keydown', speakPending)
    }
    window.addEventListener('pointerdown', speakPending)
    window.addEventListener('keydown', speakPending)
    return () => {
      window.removeEventListener('pointerdown', speakPending)
      window.removeEventListener('keydown', speakPending)
    }
  }, [])

  const loadConversations = useCallback(() => {
    if (booting) return
    api
      .get<{ conversations: ConversationSummary[] }>('/conversations')
      .then((res) => setConversations(res.data.conversations))
      .catch(() => undefined)
  }, [booting])

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  // Push to talk engine setup
  useEffect(() => {
    const engine = new SttEngine(voicePrefs.language, false)
    engine.onStart = () => {
      setMicActive(true)
      setState('LISTENING')
    }
    engine.onStop = () => {
      setMicActive(false)
      setState((s) => (s === 'LISTENING' ? 'IDLE' : s))
    }
    engine.onInterim = (txt) => {
      if (txt) setInputText(txt)
    }
    engine.onError = (m) => {
      setMicActive(false)
      setLatestTransmission(`MIC: ${m}`)
      console.warn('[STT]', m)
    }
    engine.onFinal = (txt) => {
      // txt kumulatif dari engine → assign langsung, jangan di-append (hindari dobel).
      if (txt.trim()) setInputText(txt)
    }
    pushToTalkRef.current = engine
    return () => engine.cancel()
  }, [voicePrefs.language])

  function startContinuousStt() {
    if (!sttAvailable || !voicePrefs.sttEnabled) return
    if (continuousSttRef.current) return
    continuousDesiredRef.current = true
    const engine = new SttEngine(voicePrefs.language, true)
    let finalCumulative = ''
    let latestInterim = ''
    let silenceTimer: number | null = null

    const armSend = () => {
      if (silenceTimer) window.clearTimeout(silenceTimer)
      silenceTimer = window.setTimeout(() => {
        silenceTimer = null
        const combined = `${finalCumulative} ${latestInterim}`.trim()
        if (!combined || busyRef.current) return
        // Hentikan mic dulu agar tidak merekam suara jawaban JARVIS sendiri;
        // akan di-resume otomatis lewat maybeResumeContinuous setelah TTS selesai.
        continuousDesiredRef.current = false
        continuousSttRef.current = null
        engine.cancel()
        handleSend(combined)
      }, 1400)
    }

    engine.onStart = () => setState('LISTENING')
    engine.onInterim = (txt) => {
      latestInterim = txt
      if (txt) {
        setLatestTransmission(txt)
        armSend()
      }
    }
    engine.onFinal = (txt) => {
      // txt bersifat kumulatif dari engine — assign, jangan append (hindari duplikat).
      finalCumulative = txt
      latestInterim = ''
      armSend()
    }
    engine.onStop = () => {
      continuousSttRef.current = null
      setState((s) => (s === 'LISTENING' ? 'IDLE' : s))
    }
    engine.onError = (msg) => {
      setLatestTransmission(`MIC: ${msg}`)
      console.warn('[continuousStt]', msg)
    }

    engine.start()
    continuousSttRef.current = engine
  }

  function stopContinuousStt() {
    continuousDesiredRef.current = false
    continuousSttRef.current?.cancel()
    continuousSttRef.current = null
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopContinuousStt()
      pushToTalkRef.current?.cancel()
    }
  }, [])

  // Spacebar push-to-talk handler
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.target && /input|textarea|select/i.test((e.target as HTMLElement).tagName)) {
        return
      }
      if (e.code !== 'Space' || e.repeat) return
      if (busyRef.current) return
      e.preventDefault()
      spaceDownAt.current = Date.now()
      if (pushToTalkRef.current && !pushToTalkRef.current.isListening()) {
        pushToTalkRef.current.start()
      }
    }

    const onUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      if (!spaceDownAt.current) return
      spaceDownAt.current = null
      if (pushToTalkRef.current && pushToTalkRef.current.isListening()) {
        const engine = pushToTalkRef.current
        // Final + sisa interim (slot berbeda, bukan duplikat).
        const spoken = [engine.stop().trim(), engine.interimText.trim()]
          .filter(Boolean)
          .join(' ')
        if (spoken) {
          handleSend(spoken)
          setInputText('')
        }
      }
    }

    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [])

  async function handleSend(messageText: string) {
    const message = messageText.trim()
    if (!message || busyRef.current) return

    clearStateTimers()
    busyRef.current = true
    setState('THINKING')
    ttsRef.current?.cancel()
    setLatestTransmission(`ANALYZING: "${message}"`)

    const userMessage: ChatMessage = {
      id: Date.now(),
      role: 'user',
      content: message,
    }
    const assistantId = Date.now() + 1

    setMessages((prev) => [
      ...prev,
      userMessage,
      { id: assistantId, role: 'assistant', content: '' },
    ])

    let firstDelta = true
    let gotAnyDelta = false
    let finalText = ''

    try {
      await streamChat(
        { message, conversation_id: conversationId },
        {
          onMeta: (meta) => setConversationId(meta.conversation_id),
          onStatus: (status) => {
            if (!gotAnyDelta) setLatestTransmission(status)
          },
          onDelta: (text) => {
            if (firstDelta) {
              firstDelta = false
              gotAnyDelta = true
              setState('SPEAKING')
            }
            finalText += text
            setLatestTransmission(finalText)
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: m.content + text } : m,
              ),
            )
          },
          onDone: () => {
            setState('COMPLETE')
            scheduleIdle(3000)
            loadConversations()
            if (voicePrefs.ttsEnabled && finalText.trim() && ttsRef.current) {
              // Resume continuous STT ditangani TtsEngine.onEnd setelah bicara selesai.
              ttsRef.current.speak(finalText)
            } else {
              maybeResumeContinuous()
            }
            busyRef.current = false
          },
          onError: (errorMessage) => {
            const err = `SYSTEM ERROR: ${errorMessage}`
            setLatestTransmission(err)
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId && m.content === ''
                  ? { ...m, content: `⚠ ${errorMessage}` }
                  : m,
              ),
            )
            setState('ERROR')
            scheduleIdle(3000)
            maybeResumeContinuous()
            busyRef.current = false
          },
        },
      )
    } catch {
      const err = 'SYSTEM ERROR: UNABLE TO CONTACT JARVIS CORE'
      setLatestTransmission(err)
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId && m.content === ''
            ? { ...m, content: '⚠ Koneksi ke JARVIS terputus.' }
            : m,
        ),
      )
      setState('ERROR')
      scheduleIdle(3000)
      maybeResumeContinuous()
      busyRef.current = false
      if (!gotAnyDelta) finalText = ''
    }
  }

  function handleFormSubmit(e: FormEvent) {
    e.preventDefault()
    if (!inputText.trim() || busyRef.current) return
    const text = inputText
    setInputText('')
    handleSend(text)
  }

  function handleToggleMic(e: React.MouseEvent) {
    e.preventDefault()
    if (!sttAvailable || !voicePrefs.sttEnabled) return
    const engine = pushToTalkRef.current
    if (!engine) return

    if (engine.isListening()) {
      const finalText = engine.stop().trim()
      if (finalText) {
        handleSend(finalText)
        setInputText('')
      }
    } else {
      engine.start()
    }
  }

  const busy = state === 'THINKING' || state === 'SPEAKING' || busyRef.current
  const micDisabled = busy || !sttAvailable || !voicePrefs.sttEnabled

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-jarvis-bg text-cyan-50 tech-grid">
      {/* Top HUD Header Bar */}
      <header className="relative z-30 flex shrink-0 items-center justify-between px-2 sm:px-4 py-1.5 sm:py-2 border-b border-cyan-500/20 bg-cyan-950/40 backdrop-blur-md">
        {/* Left Badge: KEETECH // JARVIS */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="hud-badge rounded px-2 sm:px-3 py-1 border border-cyan-400/40 bg-cyan-950/60">
            <div className="font-mono-tech text-[10px] sm:text-[11px] font-bold tracking-[0.15em] sm:tracking-[0.2em] text-cyan-400 text-glow-cyan whitespace-nowrap">
              KEETECH // JARVIS
            </div>
            <div className="font-mono-tech hidden sm:flex items-center gap-1.5 text-[9px] tracking-wider text-cyan-300/70">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_6px_#00e5ff]" />
              <span>@ SYS_ONLINE // VOICE DETECT</span>
            </div>
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2.5">
          {/* Navigation Links - desktop only */}
          <div className="hidden lg:flex items-center gap-1 font-mono-tech text-xs tracking-widest text-cyan-400/70 mr-2">
            <button onClick={() => navigate('/missions')} className="px-2.5 py-1 rounded hover:bg-cyan-500/10 hover:text-cyan-300">
              MISSIONS
            </button>
            <button onClick={() => navigate('/research')} className="px-2.5 py-1 rounded hover:bg-cyan-500/10 hover:text-cyan-300">
              RESEARCH
            </button>
            <button onClick={() => navigate('/agents')} className="px-2.5 py-1 rounded hover:bg-cyan-500/10 hover:text-cyan-300">
              AGENTS
            </button>
          </div>

          {/* HIDE / SHOW LOGS Toggle - hidden on mobile (logs column is hidden anyway) */}
          <button
            onClick={() => setShowLogs((prev) => !prev)}
            className="hud-btn font-mono-tech hidden sm:flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-semibold tracking-widest text-cyan-300"
          >
            <span>{showLogs ? 'HIDE LOGS' : 'SHOW LOGS'}</span>
            <span
              className={`h-2.5 w-5 rounded-full border border-cyan-400/60 transition-colors p-0.5 flex items-center ${
                showLogs ? 'bg-cyan-500/40 justify-end' : 'bg-cyan-950/60 justify-start'
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_4px_#00e5ff]" />
            </span>
          </button>

          {/* Settings Button — buka Pengaturan Sistem di halaman Agents */}
          <button
            onClick={() => navigate('/agents?settings=1')}
            title="Pengaturan Sistem (di halaman Agents)"
            className="hud-btn flex h-7 w-7 items-center justify-center rounded border border-cyan-500/40 text-cyan-300"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z" />
            </svg>
          </button>

          {/* Terminate Button - compact on mobile */}
          <button
            onClick={async () => {
              await logout()
              navigate('/login', { replace: true })
            }}
            className="hud-btn-danger font-mono-tech flex items-center gap-1 sm:gap-1.5 rounded px-2 sm:px-2.5 py-1 text-[10px] font-bold tracking-widest text-rose-300"
          >
            <span className="hidden sm:inline">TERMINATE</span>
            <span className="text-xs">✕</span>
          </button>
        </div>
      </header>

      {/* Main 3-Column Sci-Fi HUD Viewport */}
      <main className="relative flex flex-1 min-h-0 w-full p-2 sm:p-3 gap-2 sm:gap-3 pb-20 md:pb-3">
        {/* LEFT COLUMN: System Telemetry Panels (Hidden on very small screens, visible on md+) */}
        <div className="hidden md:flex w-72 shrink-0 flex-col gap-3 z-20 overflow-y-auto">
          <ChronoSyncPanel />
          {!booting && <SysHardwarePanel />}
          {!booting && <EnvTelemetryPanel />}
        </div>

        {/* CENTER COLUMN: 3D Holographic Particle Globe + Voice HUD */}
        <div className="relative flex flex-1 flex-col items-center justify-between min-w-0 h-full overflow-hidden">
          {/* Background 3D Particle Cloud Sphere */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
            <HoloSphere state={state} micLevel={micLevel} />
          </div>

          {/* Interactive Center HUD Content (Transmission, Voice Button, Input Prompt) */}
          <VoiceHudCenter
            state={state}
            micActive={micActive}
            wakeListening={state === 'LISTENING'}
            micDisabled={micDisabled}
            voicePrefs={voicePrefs}
            sttAvailable={sttAvailable}
            latestTransmission={latestTransmission}
            inputText={inputText}
            onInputChange={setInputText}
            onSubmit={handleFormSubmit}
            onToggleMic={handleToggleMic}
            onMouseDownMic={() => !micDisabled && pushToTalkRef.current?.start()}
            onMouseUpMic={() => {
              if (!micDisabled && pushToTalkRef.current?.isListening()) {
                const text = pushToTalkRef.current.stop().trim()
                if (text) {
                  handleSend(text)
                  setInputText('')
                }
              }
            }}
            onMouseLeaveMic={() => {
              if (pushToTalkRef.current?.isListening()) {
                pushToTalkRef.current.stop()
              }
            }}
            onTouchStartMic={(e) => {
              e.preventDefault()
              if (!micDisabled) pushToTalkRef.current?.start()
            }}
            onTouchEndMic={(e) => {
              e.preventDefault()
              if (!micDisabled && pushToTalkRef.current?.isListening()) {
                const text = pushToTalkRef.current.stop().trim()
                if (text) {
                  handleSend(text)
                  setInputText('')
                }
              }
            }}
            busy={busy}
          />
        </div>

        {/* RIGHT COLUMN: Terminal Feed (Collapsible via showLogs) */}
        {showLogs && (
          <div className="hidden lg:flex w-80 shrink-0 flex-col z-20 h-full">
            <TerminalFeed
              messages={messages}
              thinking={state === 'THINKING'}
              onClear={() => setMessages([])}
            />
          </div>
        )}
      </main>
    </div>
  )
}
