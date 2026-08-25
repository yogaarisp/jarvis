import { useEffect, useRef } from 'react'
import type { ChatMessage } from '../types'

function formatTime(iso?: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

export function MessageList({
  messages,
  thinking,
}: {
  messages: ChatMessage[]
  thinking: boolean
}) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, thinking])

  return (
    <div className="flex flex-col gap-4">
      {messages.map((message) => {
        const isUser = message.role === 'user'
        return (
          <div key={message.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] sm:max-w-[70%] ${isUser ? 'items-end' : 'items-start'}`}>
              {!isUser && (
                <p className="font-display mb-1 text-[10px] font-semibold tracking-[0.35em] text-jarvis-gold/80">
                  JARVIS
                </p>
              )}
              <div
                className={
                  isUser
                    ? 'glass rounded-2xl rounded-br-md border-jarvis-cyan/30 px-4 py-3 text-[15px] leading-relaxed text-cyan-50'
                    : 'glass-soft rounded-2xl rounded-bl-md px-4 py-3 text-[15px] leading-relaxed text-cyan-100/90'
                }
              >
                {message.content}
              </div>
              {message.created_at && (
                <p className={`mt-1 text-[10px] tracking-wider text-cyan-200/30 ${isUser ? 'text-right' : ''}`}>
                  {formatTime(message.created_at)}
                </p>
              )}
            </div>
          </div>
        )
      })}

      {thinking && (
        <div className="flex justify-start">
          <div className="glass-soft flex items-center gap-2 rounded-2xl rounded-bl-md px-4 py-3">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-1.5 w-1.5 animate-bounce rounded-full bg-jarvis-cyan"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        </div>
      )}
      <div ref={endRef} />
    </div>
  )
}
