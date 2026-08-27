import axios from 'axios'
import type {
  Agent,
  AppSettingsBundle,
  ConnectionTest,
  ConversationSummary,
  EnvTelemetry,
  MemoryEntry,
  Mission,
  ResearchResult,
  Skill,
  SystemTelemetry,
  VoicePrefs,
  VoicePreviewItem,
  WakeSettings,
} from '../types'

export type { MemoryEntry, Skill }

const TOKEN_KEY = 'jarvis_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export const api = axios.create({
  baseURL: '/api',
  headers: {
    Accept: 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearToken()
    }
    return Promise.reject(error)
  },
)

/* ------------------------------------------------------------------ */
/* Short-hands that unwrap the unified envelope                       */
/* ------------------------------------------------------------------ */

async function unwrap<T>(
  promise: Promise<{ data: { data?: T; success?: boolean; message?: string } }>,
): Promise<T> {
  const { data } = await promise
  if (data && 'success' in data && data.success === false) {
    throw new Error(data.message ?? 'Request failed')
  }
  return data.data as T
}

export function listAgents(): Promise<Agent[]> {
  return unwrap(api.get('/agents'))
}

export function listConversations(): Promise<ConversationSummary[]> {
  return unwrap(api.get('/conversations'))
}

export function deleteConversation(id: number): Promise<void> {
  return api.delete(`/conversations/${id}`).then(() => undefined)
}

export function listMissions(): Promise<Mission[]> {
  return unwrap(api.get('/missions'))
}

export function createMission(payload: {
  agent_key: string
  title: string
  instruction?: string
}): Promise<Mission> {
  return unwrap(api.post('/missions', payload))
}

export function approveMission(id: number): Promise<Mission> {
  return unwrap(api.post(`/missions/${id}/approve`))
}

export function cancelMission(id: number): Promise<Mission> {
  return unwrap(api.post(`/missions/${id}/cancel`))
}

export function getWakeSettings(): Promise<WakeSettings> {
  return api.get('/wake-settings').then((r) => r.data.wake_settings)
}

export function updateWakeSettings(
  patch: Partial<WakeSettings>,
): Promise<WakeSettings> {
  return api
    .put('/wake-settings', patch)
    .then((r) => r.data.wake_settings)
}

export function runResearch(payload: {
  topic: string
  max_sources?: number
  max_iterations?: number
}): Promise<ResearchResult> {
  return unwrap(api.post('/research', payload))
}

/* ------------------------------------------------------------------ */
/* Skills & Memory (PRD §17)                                           */
/* ------------------------------------------------------------------ */

export function listSkills(): Promise<Skill[]> {
  return unwrap(api.get('/skills'))
}

export function createSkill(payload: {
  name: string
  content: string
  category?: string
  description?: string
}): Promise<Skill> {
  return unwrap(api.post('/skills', payload))
}

export function deleteSkill(id: number): Promise<void> {
  return api.delete(`/skills/${id}`).then(() => undefined)
}

export function listMemories(): Promise<MemoryEntry[]> {
  return unwrap(api.get('/memories'))
}

export function createMemory(payload: {
  key: string
  value: string
  category?: string
  importance?: number
}): Promise<MemoryEntry> {
  return unwrap(api.post('/memories', payload))
}

export function deleteMemory(id: number): Promise<void> {
  return api.delete(`/memories/${id}`).then(() => undefined)
}

/* ------------------------------------------------------------------ */
/* System telemetry (Phase 10)                                         */
/* ------------------------------------------------------------------ */

export function getSystemTelemetry(): Promise<SystemTelemetry> {
  return unwrap(api.get('/system/telemetry'))
}

export function getEnvTelemetry(): Promise<EnvTelemetry> {
  return unwrap(api.get('/system/env'))
}

/* ------------------------------------------------------------------ */
/* Settings UI                                                         */
/* ------------------------------------------------------------------ */

export function getSettings(): Promise<AppSettingsBundle> {
  return unwrap(api.get('/settings'))
}

export function updateSettings(
  patch: Record<string, unknown>,
): Promise<{ saved: string[]; items: AppSettingsBundle['items'] }> {
  return unwrap(api.put('/settings', patch))
}

/** Preferensi user per-akun (voice prefs, dll) — disimpan di DB, tidak hilang saat clear cache. */
export function getUserPreferences(): Promise<{
  voice_prefs: VoicePrefs | null
  updated_at: string | null
}> {
  return api.get('/user/preferences').then((r) => r.data)
}

export function updateUserPreferences(payload: {
  voice_prefs: VoicePrefs
}): Promise<{ voice_prefs: VoicePrefs | null; updated_at: string | null }> {
  return api.put('/user/preferences', payload).then((r) => r.data)
}

export function testAiConnection(): Promise<ConnectionTest> {
  return unwrap(api.post('/settings/test-ai'))
}

/** Daftar model dari AI Provider (GET {base_url}/models di sisi server). */
export function fetchAiModels(payload?: {
  base_url?: string | null
  api_key?: string | null
  provider_type?: string | null
}): Promise<{ ok: boolean; models: string[]; message?: string }> {
  return unwrap(api.post('/settings/ai-models', payload ?? {}))
}

/* ------------------------------------------------------------------ */
/* SSE chat streaming                                                  */
/* ------------------------------------------------------------------ */

export interface ChatStreamHandlers {
  onMeta?: (meta: { conversation_id: number; model: string }) => void
  onDelta: (text: string) => void
  /** Aksi agent (mis. "Mencari di internet: ...") sebelum jawaban final. */
  onStatus?: (message: string) => void
  onDone?: (info: { message_id: number; latency_ms: number | null }) => void
  onError?: (message: string) => void
}

interface SseEvent {
  event: string
  data: Record<string, unknown>
}

function parseSseBlock(block: string): SseEvent | null {
  let event = 'message'
  let data = ''

  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      data += line.slice(5).trim()
    }
  }

  if (!data) return null

  try {
    return { event, data: JSON.parse(data) }
  } catch {
    return null
  }
}

/**
 * Streaming chat via POST /api/chat (Server-Sent Events).
 * Menggunakan fetch biasa karena axios tidak mendukung pembacaan stream progresif.
 */
export async function streamChat(
  body: { message: string; conversation_id?: number | null },
  handlers: ChatStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const token = getToken()

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok || !response.body) {
    let message = `HTTP ${response.status}`
    try {
      const payload = await response.json()
      const errors = (payload.errors ?? {}) as Record<string, string[]>
      message = payload.message ?? Object.values(errors)[0]?.[0] ?? message
    } catch {
      // keep default
    }

    if (response.status === 401) {
      clearToken()
    }

    throw new Error(message)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    let separatorIndex: number
    while ((separatorIndex = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, separatorIndex)
      buffer = buffer.slice(separatorIndex + 2)

      const sse = parseSseBlock(block)
      if (!sse) continue

      switch (sse.event) {
        case 'meta':
          handlers.onMeta?.({
            conversation_id: Number(sse.data.conversation_id),
            model: String(sse.data.model ?? ''),
          })
          break
        case 'delta':
          if (typeof sse.data.content === 'string') {
            handlers.onDelta(sse.data.content)
          }
          break
        case 'status':
          if (typeof sse.data.message === 'string') {
            handlers.onStatus?.(sse.data.message)
          }
          break
        case 'done':
          handlers.onDone?.({
            message_id: Number(sse.data.message_id),
            latency_ms: Number(sse.data.latency_ms ?? 0),
          })
          break
        case 'error':
          handlers.onError?.(String(sse.data.message ?? 'Terjadi kesalahan.'))
          break
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* SSE mission progress streaming                                      */
/* ------------------------------------------------------------------ */

export interface MissionStreamHandlers {
  onMeta?: (mission: Record<string, unknown>) => void
  onStatus?: (status: string) => void
  onStep?: (step: Record<string, unknown>) => void
  onDone?: (info: { status: string; result_summary?: unknown }) => void
  onError?: (message: string) => void
}

/**
 * Progres misi via GET /api/missions/{id}/stream (Server-Sent Events).
 * Misi berstatus queued dieksekusi di dalam stream ini.
 */
export async function streamMission(
  missionId: number,
  handlers: MissionStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const token = getToken()

  const response = await fetch(`/api/missions/${missionId}/stream`, {
    method: 'GET',
    headers: {
      Accept: 'text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal,
  })

  if (!response.ok || !response.body) {
    let message = `HTTP ${response.status}`
    try {
      const payload = await response.json()
      message = payload.message ?? message
    } catch {
      // keep default
    }

    if (response.status === 401) {
      clearToken()
      window.location.href = '/login'
    }

    throw new Error(message)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    let separatorIndex: number
    while ((separatorIndex = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, separatorIndex)
      buffer = buffer.slice(separatorIndex + 2)

      const sse = parseSseBlock(block)
      if (!sse) continue

      switch (sse.event) {
        case 'meta':
          handlers.onMeta?.(sse.data.mission as Record<string, unknown>)
          break
        case 'status':
          handlers.onStatus?.(String(sse.data.status))
          break
        case 'step':
          handlers.onStep?.(sse.data.step as Record<string, unknown>)
          break
        case 'done':
          handlers.onDone?.({
            status: String(sse.data.status),
            result_summary: sse.data.result_summary,
          })
          break
        case 'error':
          handlers.onError?.(String(sse.data.message ?? 'Eksekusi misi gagal.'))
          break
      }
    }
  }
}

export function getVoicePreviews(): Promise<{ directory: string; files: VoicePreviewItem[] }> {
  return unwrap(api.get('/tts/previews'))
}
