import { useEffect, useRef } from 'react'
import type { ChatMessage } from '../types'

interface TerminalFeedProps {
  messages: ChatMessage[]
  thinking: boolean
  onClear?: () => void
}

function formatTerminalTime(iso?: string | number): string {
  if (!iso) {
    const now = new Date()
    return now.toTimeString().split(' ')[0]
  }
  const d = typeof iso === 'number' ? new Date(iso) : new Date(iso)
  return isNaN(d.getTime()) ? new Date().toTimeString().split(' ')[0] : d.toTimeString().split(' ')[0]
}

export function TerminalFeed({ messages, thinking }: TerminalFeedProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, thinking])

  return (
    <div className="hud-panel flex h-full flex-col rounded-lg p-3.5">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-cyan-500/20">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_10px_#00e5ff] animate-pulse" />
          <span className="font-mono-tech text-xs font-bold tracking-[0.2em] text-cyan-400 text-glow-cyan">
            JARVIS // TERMINAL_FEED
          </span>
        </div>
        <span className="font-mono-tech rounded border border-cyan-500/40 bg-cyan-950/50 px-2 py-0.5 text-[9px] font-semibold tracking-wider text-cyan-300">
          LIVE_LOGS
        </span>
      </div>

      {/* Terminal Message Stream */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-3.5 overflow-y-auto py-3 pr-1.5 font-mono-tech text-xs select-text"
      >
        {messages.length === 0 && (
          <div className="rounded border border-cyan-500/10 bg-cyan-950/20 p-2.5 text-cyan-400/60 leading-relaxed">
            <div className="flex items-center gap-1.5 text-cyan-400">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
              <span className="font-bold">SYSTEM_READY</span>
            </div>
            <p className="mt-1 text-[11px]">All defensive protocols and neural speech subsystems initialized. Awaiting command...</p>
          </div>
        )}

        {messages.map((msg) => {
          const isUser = msg.role === 'user'
          const time = formatTerminalTime(msg.created_at ?? msg.id)

          return (
            <div
              key={msg.id}
              className={`rounded-lg border p-2.5 transition-all ${
                isUser
                  ? 'border-cyan-500/20 bg-cyan-950/30'
                  : 'border-cyan-400/35 bg-cyan-900/15 shadow-[0_0_12px_rgba(0,229,255,0.06)]'
              }`}
            >
              {/* Message Header */}
              <div className="flex items-center justify-between text-[10px] tracking-wider mb-1.5">
                <div className="flex items-center gap-1.5">
                  {isUser ? (
                    <span className="font-bold text-amber-300 tracking-widest">&gt; USER_COMMAND</span>
                  ) : (
                    <div className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#00e5ff]" />
                      <span className="font-bold text-cyan-300 text-glow-cyan tracking-widest">JARVIS_AI</span>
                    </div>
                  )}
                </div>
                <span className="text-cyan-400/50">{time}</span>
              </div>

              {/* Message Content */}
              <div
                className={`text-[12px] leading-relaxed whitespace-pre-wrap break-words ${
                  isUser ? 'text-cyan-100/90' : 'text-cyan-50'
                }`}
              >
                {msg.content || (
                  <span className="animate-pulse text-cyan-400/70">Connecting neural stream...</span>
                )}
              </div>
            </div>
          )
        })}

        {/* Thinking Indicator */}
        {thinking && (
          <div className="rounded-lg border border-cyan-400/40 bg-cyan-900/20 p-2.5">
            <div className="flex items-center gap-2 text-[10px] text-cyan-300 font-bold tracking-widest">
              <span className="h-2 w-2 animate-ping rounded-full bg-cyan-400" />
              JARVIS_AI // PROCESSING_QUERY...
            </div>
            <div className="mt-2 flex gap-1">
              <span className="h-1.5 w-4 animate-pulse rounded bg-cyan-400" style={{ animationDelay: '0ms' }} />
              <span className="h-1.5 w-4 animate-pulse rounded bg-cyan-400" style={{ animationDelay: '200ms' }} />
              <span className="h-1.5 w-4 animate-pulse rounded bg-cyan-400" style={{ animationDelay: '400ms' }} />
            </div>
          </div>
        )}
      </div>

      {/* Terminal Footer */}
      <div className="pt-2 border-t border-cyan-500/20 text-center font-mono-tech text-[9px] tracking-[0.25em] text-cyan-400/50">
        --- ENCRYPTED TRANSMISSION STREAM ---
      </div>
    </div>
  )
}
