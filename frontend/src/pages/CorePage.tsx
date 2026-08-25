import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, streamChat, getWakeSettings, updateWakeSettings } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { HoloSphere } from '../components/HoloSphere'
import { ChronoSyncPanel } from '../components/ChronoSyncPanel'
import { SysHardwarePanel } from '../components/SysHardwarePanel'
import { EnvTelemetryPanel } from '../components/EnvTelemetryPanel'
import { TerminalFeed } from '../components/TerminalFeed'
import { VoiceHudCenter } from '../components/VoiceHudCenter'
import { SettingsPanel } from '../components/SettingsPanel'
import {
  DEFAULT_VOICE_PREFS,
  SttEngine,
  TtsEngine,
  isSttAvailable,
  isTtsAvailable,
  loadVoicePrefs,
  saveVoicePrefs,
} from '../lib/voice'
import { WakeEngine } from '../lib/wake'
import type { ChatMessage, ConversationSummary, JarvisState, VoicePrefs, WakeSettings } from '../types'

const DEFAULT_WAKE: WakeSettings = {
  clap_enabled: false,
  claps_required: 2,
  sensitivity: 'medium',
  window_ms: 650,
  cooldown_ms: 2000,
}

export function CorePage() {
  const { logout, booting } = useAuth()
  const navigate = useNavigate()

  const [state, setState] = useState<JarvisState>('IDLE')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversationId, setConversationId] = useState<number | null>(null)
  const [, setConversations] = useState<ConversationSummary[]>([])
  const [voicePrefs, setVoicePrefs] = useState<VoicePrefs>(DEFAULT_VOICE_PREFS)
  const [wakeSettings, setWakeSettings] = useState<WakeSettings>(DEFAULT_WAKE)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [showLogs, setShowLogs] = useState(true)
  const [wakeRunning, setWakeRunning] = useState(false)
  const [, setWakeError] = useState<string | null>(null)
  const [micLevel, setMicLevel] = useState(0)
  const [micActive, setMicActive] = useState(false)
  const [inputText, setInputText] = useState('')
  const [latestTransmission, setLatestTransmission] = useState<string>('')

  const stateTimers = useRef<number[]>([])
  const ttsRef = useRef<TtsEngine | null>(null)
  const wakeRef = useRef<WakeEngine | null>(null)
  const continuousSttRef = useRef<SttEngine | null>(null)
  const pushToTalkRef = useRef<SttEngine | null>(null)
  const wakeSettingsRef = useRef<WakeSettings>(wakeSettings)
  const busyRef = useRef(false)
  const spaceDownAt = useRef<number | null>(null)

  useEffect(() => {
    wakeSettingsRef.current = wakeSettings
    if (wakeRef.current) wakeRef.current.updateSettings(wakeSettings)
  }, [wakeSettings])

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

  // Load persistent voice + wake settings on mount — only after auth token is ready
  useEffect(() => {
    setVoicePrefs(loadVoicePrefs())
    if (booting) return
    getWakeSettings()
      .then((s) => setWakeSettings({ ...DEFAULT_WAKE, ...s }))
      .catch(() => undefined)
  }, [booting])

  // Sync voice prefs
  useEffect(() => {
    saveVoicePrefs(voicePrefs)
    ttsRef.current?.updatePrefs(voicePrefs)
  }, [voicePrefs])

  // Sync wake settings
  useEffect(() => {
    if (wakeSettings.id) {
      updateWakeSettings(wakeSettings).catch(() => undefined)
    }
  }, [wakeSettings.clap_enabled, wakeSettings.claps_required, wakeSettings.sensitivity, wakeSettings.window_ms, wakeSettings.cooldown_ms])

  // Bootstrap TTS engine
  useEffect(() => {
    if (!ttsAvailable) return
    const engine = new TtsEngine(voicePrefs)
    engine.onStart = () => setState((s) => (s === 'COMPLETE' || s === 'IDLE' ? 'SPEAKING' : s))
    engine.onEnd = () => setState((s) => (s === 'SPEAKING' ? 'COMPLETE' : s))
    ttsRef.current = engine
    return () => engine.cancel()
  }, [ttsAvailable, voicePrefs])

  // Initial welcome greeting — time-aware, ditampilkan & diucapkan tiap halaman dibuka/refresh
  useEffect(() => {
    const h = new Date().getHours()
    const waktu =
      h >= 4 && h <= 10 ? 'pagi' : h >= 11 && h <= 14 ? 'siang' : h >= 15 && h <= 17 ? 'sore' : 'malam'
    const greeting = `Selamat ${waktu}, Keenan! My Name is JARVIS, Asisten AI.`

    setLatestTransmission(greeting)
    setMessages((prev) =>
      prev.length === 0 ? [{ id: Date.now(), role: 'assistant', content: greeting }] : prev,
    )
    const t = window.setTimeout(() => ttsRef.current?.speak(greeting), 700)
    return () => window.clearTimeout(t)
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
      console.warn('[STT]', m)
    }
    engine.onFinal = (txt) => {
      if (txt.trim()) {
        setInputText((prev) => (prev ? prev + ' ' : '') + txt)
      }
    }
    pushToTalkRef.current = engine
    return () => engine.cancel()
  }, [voicePrefs.language])

  function startContinuousStt() {
    if (!sttAvailable || !voicePrefs.sttEnabled) return
    if (continuousSttRef.current) return
    const engine = new SttEngine(voicePrefs.language, true)
    let buffer = ''
    let silenceTimer: number | null = null

    engine.onStart = () => setState('LISTENING')
    engine.onInterim = (txt) => {
      if (silenceTimer) window.clearTimeout(silenceTimer)
      if (txt) {
        setLatestTransmission(txt)
        silenceTimer = window.setTimeout(() => {
          if (!buffer.trim() && !txt.trim()) return
          const combined = (buffer + (buffer ? ' ' : '') + txt).trim()
          engine.cancel()
          if (combined) handleSend(combined)
        }, 1200)
      }
    }
    engine.onFinal = (txt) => {
      buffer += (buffer ? ' ' : '') + txt
    }
    engine.onStop = () => {
      continuousSttRef.current = null
      setState((s) => (s === 'LISTENING' ? 'IDLE' : s))
    }
    engine.onError = (msg) => {
      console.warn('[continuousStt]', msg)
    }

    engine.start()
    continuousSttRef.current = engine
  }

  async function toggleWakeEngine(want: boolean) {
    setWakeError(null)
    if (want) {
      if (!wakeRef.current) {
        const engine = new WakeEngine(wakeSettingsRef.current)
        engine.onWake = () => {
          ttsRef.current?.speak(
            voicePrefs.language.startsWith('id') ? 'Ya, Bos.' : 'Yes, Boss.',
          )
          setState('LISTENING')
          startContinuousStt()
        }
        engine.onError = (m) => setWakeError(m)
        engine.onLevel = (rms) => setMicLevel(rms)
        engine.onReady = () => setWakeRunning(true)
        engine.onStopped = () => setWakeRunning(false)
        wakeRef.current = engine
      }
      await wakeRef.current.start()
    } else {
      wakeRef.current?.stop()
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wakeRef.current?.stop()
      continuousSttRef.current?.cancel()
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
        const finalText = pushToTalkRef.current.stop().trim()
        if (finalText) {
          handleSend(finalText)
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
              ttsRef.current.speak(finalText)
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

          {/* Settings Button */}
          <button
            onClick={() => setSettingsOpen(true)}
            title="Pengaturan JARVIS"
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
            wakeRunning={wakeRunning}
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

      {/* Settings Modal */}
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        voicePrefs={voicePrefs}
        onChangeVoice={setVoicePrefs}
        wakeSettings={wakeSettings}
        onChangeWake={setWakeSettings}
        wakeRunning={wakeRunning}
        wakeError={null}
        onToggleWake={toggleWakeEngine}
        micLevel={micLevel}
      />
    </div>
  )
}
