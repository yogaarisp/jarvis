export interface User {
  id: number
  name: string
  email: string
}

export type MessageRole = 'user' | 'assistant' | 'system'

export interface ChatMessage {
  id: number
  role: MessageRole
  content: string
  created_at?: string
}

export interface ConversationSummary {
  id: number
  title: string | null
  model: string | null
  last_message_at: string | null
}

/** PRD §10 — agent registry entry. */
export interface Agent {
  id: number
  key: string
  name: string
  role: string
  description: string | null
  allowed_tools: string[] | null
  permission_level: 'read' | 'controlled' | 'dangerous'
  status: 'active' | 'inactive'
}

/** PRD §11 — mission engine. */
export type MissionStatus =
  | 'queued'
  | 'running'
  | 'waiting_approval'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

export interface MissionStep {
  id: number
  step_order: number
  name: string
  tool: string
  params: Record<string, unknown> | null
  status: StepStatus
  output: Record<string, unknown> | null
}

export interface Mission {
  id: number
  agent_key: string
  title: string
  instruction: string | null
  status: MissionStatus
  result_summary: Record<string, unknown> | null
  approved_at: string | null
  started_at: string | null
  finished_at: string | null
  created_at?: string
  steps?: MissionStep[]
}

/** JARVIS core states (PRD §4). EXECUTING is used from Phase 5 onward. */
export type JarvisState =
  | 'IDLE'
  | 'LISTENING'
  | 'THINKING'
  | 'EXECUTING'
  | 'SPEAKING'
  | 'COMPLETE'
  | 'ERROR'

/** PRD §5 — Wake Engine preferences. */
export interface WakeSettings {
  id?: number
  user_id?: number
  clap_enabled: boolean
  claps_required: 2 | 3
  sensitivity: 'low' | 'medium' | 'high'
  window_ms: number
  cooldown_ms: number
  updated_at?: string
  created_at?: string
}

/** PRD §7 — voice preferences (all client-side; no personal data). */
export interface VoicePrefs {
  sttEnabled: boolean
  ttsEnabled: boolean
  ttsRate: number
  ttsPitch: number
  /** BCP-47 language tag, default 'id-ID'. */
  language: string
  /** Name of selected SpeechSynthesisVoice (browser). */
  voiceName?: string
  /** Mesin TTS: server = neural JARVIS (Edge TTS), browser = speechSynthesis lokal. */
  ttsEngine?: 'server' | 'browser'
  /** Voice neural server, mis. en-GB-RyanNeural (pria Inggris ala JARVIS). */
  ttsServerVoice?: string
}

export interface VoicePreviewItem {
  filename: string
  name: string
  voice_id: string
  group: string
  lang: 'EN' | 'ID' | string
  format: string
  size_bytes: number
  size_formatted: string
  title: string
  description: string
  accent: string
  url: string
}

/** PRD §13 — Research agent result. */
export interface ResearchSource {
  url: string
  title: string
  snippet?: string
  read?: boolean
}

export interface ResearchResult {
  summary: string
  sources: ResearchSource[]
  steps: string[]
  depth: number
}

/** Settings UI — editor AI / 9Router / Hermes / JARVIS. */
export interface AppSettingItem {
  key: string
  value: string | number | boolean | null
  is_filled: boolean
  type: 'string' | 'integer' | 'boolean'
  secret: boolean
  label: string
  group: 'ai' | 'hermes' | 'jarvis'
  placeholder?: string
  help?: string
}

export interface AppSettingsBundle {
  groups: Record<string, string>
  items: Record<string, AppSettingItem>
}

export interface ConnectionTest {
  ok: boolean
  message: string
  latency_ms: number | null
  provider?: string
}

/** PRD §17 — skill registry (gudang keahlian ala Hermes agent). */
export interface Skill {
  id: number
  name: string
  category: string
  description: string | null
  content: string
  tags: string[] | null
  source: string
  usage_count: number
  last_used_at: string | null
}

/** PRD §17 — memori jangka panjang (importance >= 3 selalu disuntikkan ke konteks). */
export interface MemoryEntry {
  id: number
  category: string
  key: string
  value: string
  importance: number
}

/** Phase 10 — telemetri hardware server (real; null = tidak tersedia di platform tsb). */
export interface SystemTelemetry {
  hostname: string
  platform: string
  cores: number | null
  cpu_percent: number | null
  ram_total_mb: number | null
  ram_used_percent: number | null
  disk_total_gb: number | null
  disk_used_percent: number | null
  temperature_c: number | null
  uptime_seconds: number | null
}

/** Phase 10 — telemetri lingkungan (IP pengunjung, geolokasi, cuaca real). */
export interface EnvTelemetry {
  visitor_ip: string | null
  city: string | null
  country_code: string | null
  temperature_c: number | null
  condition: string | null
}

