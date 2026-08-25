# HAI JARVIS — PRD EXECUTION v1.1

## 1. Vision
HAI JARVIS is a personal AI Command Center accessible through Web/PWA. It is not a generic chatbot or admin dashboard. It should feel like a futuristic personal AI operating system.

Core capabilities:
- Text chat
- Voice input/output
- Manual activation
- Press-to-talk
- Double-clap wake
- Future wake word: “Hai Jarvis”
- AI model switching through 9Router
- Agent execution through Hermes
- Web research
- Controlled scraping
- Server monitoring
- Project management
- Memory
- Automation
- Audit and permissions

## 2. Architecture

```text
USER
 ├── VOICE ───────┐
 └── CLAP 👏👏 ───┤
                  v
             WAKE ENGINE
                  |
             JARVIS ACTIVE
                  |
             VOICE / TEXT
                  |
          JARVIS ORCHESTRATOR
             /                    9ROUTER        HERMES
          AI             AGENT
                         |
                 SERVER / WEB / DEV
                 DATABASE / PROJECTS
```

Responsibilities:
- React/PWA: UI, animation, microphone UX, client-side wake detection.
- Laravel: API, auth, orchestration, memory, missions, permissions, provider management, audit.
- 9Router: AI model gateway.
- Hermes: execution/agent layer.
- MySQL/MariaDB: persistent data.
- Redis: queue/realtime support.
- Python: optional worker only for tools that benefit from Python.
- Proxmox: infrastructure.
- aaPanel: application hosting.

## 3. Stack
Frontend: React, TypeScript, Tailwind CSS, Framer Motion, PWA.
Backend: Laravel, PHP 8+.
Data: MySQL/MariaDB, Redis.
Realtime: SSE for MVP.
AI: 9Router.
Agent: Hermes.
Web: Nginx, aaPanel, HTTPS.

## 4. JARVIS Core UI
The main page must be a cinematic AI command center, not a standard dashboard.

Visuals:
- deep black/navy background
- cyan/electric-blue holographic elements
- subtle gold accents
- glassmorphism
- holographic circular HUD
- central AI core/avatar
- agent nodes
- particles and data streams
- voice waveform
- system telemetry
- mission timeline
- command input

Agents:
JARVIS, RESEARCH, SYSTEM, DEV, DATABASE, MONITOR, DEPLOYMENT, SECURITY.

States:
IDLE, LISTENING, THINKING, EXECUTING, SPEAKING, COMPLETE, ERROR.

## 5. Wake Engine
Create a unified WakeEngine.

Methods:
1. Manual activation
2. Press-to-talk
3. Double clap
4. Future wake word: “Hai Jarvis”

### Clap detection
Run client-side with Web Audio API:
Microphone -> AudioContext -> AnalyserNode -> amplitude/transient detection -> timing analysis -> double-clap detection -> wake.

Defaults:
- Double Clap
- 500–700 ms detection window
- 2 second cooldown
- Medium sensitivity

Use amplitude peak, transient detection, timing window, sensitivity, cooldown and false-positive protection.

Do not send raw microphone audio to the backend just to detect a clap.

When detected: IDLE -> LISTENING.

User settings:
- enable/disable clap wake
- clap pattern
- sensitivity
- detection window
- cooldown

Future wake word should preferably be local/client-side. Always-listening is not enabled by default.

## 6. Voice
Flow:
Microphone -> STT -> JARVIS -> 9Router -> Hermes when needed -> response -> TTS.

MVP:
- press-to-talk
- microphone permissions
- listening/speaking states
- error handling

Future:
- wake word
- continuous conversation
- multi-device wake

## 7. Chat
POST /api/chat.

Flow:
Authentication -> Conversation -> Memory Context -> JARVIS Orchestrator -> 9Router -> streaming response.

Store conversation, messages, model, token usage if available, latency, status, timestamps.

Use SSE.

## 8. 9Router
Create:
- AIProviderInterface
- AIProviderManager
- NineRouterProvider

Environment:
```env
9ROUTER_BASE_URL=
9ROUTER_API_KEY=
9ROUTER_MODEL=
```

API key must remain server-side. Support model selection, connection test and fallback model.

## 9. Hermes
Create HermesClient and HermesService.

Frontend never calls Hermes directly.

Flow:
JARVIS Backend -> Permission Engine -> Hermes Client -> Hermes -> Tool -> Result -> JARVIS.

## 10. Agent Registry
Initial agents:
- JARVIS: orchestration
- RESEARCH: web research
- SYSTEM: infrastructure
- DEV: development
- DATABASE: database
- MONITOR: monitoring
- DEPLOYMENT: deployment
- SECURITY: security

Each agent has id, name, description, system prompt, allowed tools, permission level, status.

## 11. Mission Engine
Complex tool tasks become Missions.

States:
QUEUED, RUNNING, WAITING_APPROVAL, COMPLETED, FAILED, CANCELLED.

Create:
- missions
- mission_steps
- tool_executions

Stream mission progress to UI.

## 12. Permission Engine
Levels:
- READ
- CONTROLLED
- DANGEROUS

Dangerous operations always require explicit confirmation. Never provide unrestricted root shell access.

Examples:
- destructive database actions
- production deletion
- shutdown/reboot
- destructive filesystem commands
- irreversible deployment

## 13. Web Research
Example: “Jarvis, cari di internet siapa Prabowo Subianto.”

Flow:
JARVIS -> RESEARCH -> Search -> Read sources -> Analyze -> Answer.

Return source references.

## 14. Scraping
Example: “Jarvis, ambil daftar produk dari website ini.”

Flow:
URL -> Permission -> Scraper -> Extract -> Normalize -> JSON/CSV.

Keep an abstraction so a Python worker can later handle Playwright/browser automation/advanced scraping/data processing.

## 15. Server Monitoring
Track:
CPU, RAM, disk, network, load, uptime.

Services:
Nginx, PHP-FPM, MySQL, Redis, Docker.

Website health:
HTTP status, response time, SSL status.

## 16. Projects
Project fields:
name, repository, branch, server, domain, environment, deployment method.

Future integrations:
GitHub, Docker, aaPanel, deployment pipelines.

## 17. Memory
Categories:
USER, PROJECT, SERVER, MISSION.

Use contextual retrieval. Do not inject all memory into every prompt.

## 18. Automation
Support scheduled missions such as database backups, health checks, monitoring and reports.

## 19. Audit
Log:
user_id, mission_id, agent_id, tool, target, action, permission, status, result_summary, IP, created_at.

## 20. Security
Mandatory:
- authentication
- RBAC
- HTTPS
- server-side API keys
- Hermes authentication
- rate limiting
- input validation
- timeout
- audit logging
- permission checks
- secret protection
- least privilege

Never expose 9Router keys, Hermes credentials or server credentials.

## 21. Database
Migrations:
users, conversations, messages, memories, ai_providers, ai_models, agents, tools, tool_permissions, servers, server_services, projects, missions, mission_steps, tool_executions, automations, monitoring_checks, monitoring_results, notifications, audit_logs, settings, wake_settings.

## 22. API
Auth:
- POST /api/auth/login
- POST /api/auth/logout
- GET /api/me

Chat:
- POST /api/chat

Conversations:
- GET /api/conversations
- GET /api/conversations/{id}
- DELETE /api/conversations/{id}

Agents:
- GET /api/agents
- GET /api/agents/{id}

Missions:
- GET /api/missions
- GET /api/missions/{id}
- POST /api/missions/{id}/approve
- POST /api/missions/{id}/cancel

Providers:
- GET /api/providers
- POST /api/providers/test

Servers:
- GET /api/servers
- POST /api/servers
- GET /api/servers/{id}
- GET /api/servers/{id}/metrics
- GET /api/servers/{id}/logs

Projects:
- GET /api/projects
- POST /api/projects
- GET /api/projects/{id}

Research:
- POST /api/research

Memory:
- GET /api/memory

Audit:
- GET /api/audit-logs

## 23. Pages
Required:
1. Login
2. JARVIS Core
3. Chat/Conversation
4. Missions
5. Mission Detail
6. Agents
7. System Monitoring
8. Projects
9. Web Research
10. Scraper
11. Memory
12. Automation
13. Audit Logs
14. Settings

Settings:
AI Provider, Model, 9Router, Voice, Wake Engine, Clap Sensitivity, Notifications, Security, Memory.

Mobile bottom navigation:
CORE, MISSIONS, SYSTEM, AGENTS, MORE.

## 24. Implementation Phases
### Phase 0
Inspect repository, current frontend/backend, package manager, DB, auth, routes, components and environment. Do not overwrite working code. Produce implementation plan.

### Phase 1
Authentication, database, API structure, JARVIS Core, responsive layout, basic chat.

### Phase 2
9Router provider manager, model selection, streaming, connection test.

### Phase 3
Hermes client, execution service, authentication, basic tool invocation.

### Phase 4
AgentRegistry and initial agents.

### Phase 5
Mission Engine, mission timeline, SSE progress.

### Phase 6
Permission engine, approval UI, audit.

### Phase 7
Voice, STT, TTS, press-to-talk.

### Phase 8
Wake Engine, double-clap detection, settings, cooldown, false-positive protection, wake-word abstraction.

### Phase 9
Research agent and web sources.

### Phase 10
Server monitoring.

### Phase 11
Projects.

### Phase 12
Memory.

### Phase 13
Scraping and optional Python worker.

### Phase 14
Automation.

### Phase 15
Production deployment on aaPanel/Nginx/HTTPS with Redis worker, scheduler, backups, logs and security hardening.

## 25. Testing
After every phase:
- backend tests
- frontend build
- migrations
- API tests
- console checks
- responsive tests
- permission tests
- mission execution tests

Wake tests:
- no microphone permission
- single clap
- double clap
- triple clap
- keyboard noise
- background noise
- cooldown
- disabled clap wake
- sensitivity changes

Do not claim completion until tested.

## 26. Definition of Done
MVP is complete when the user can:
1. Open the web app.
2. Login.
3. See JARVIS Core.
4. Chat through 9Router.
5. Receive streamed responses.
6. Press microphone and speak.
7. Hear TTS.
8. Double-clap to activate listening.
9. Ask for a server read-only check.
10. JARVIS routes it to Hermes.
11. Mission progress appears.
12. Dangerous actions require confirmation.
13. Web research returns sources.
14. Important executions are audited.
15. UI works on desktop and mobile.

## 27. Engineering Rules
- Inspect before modifying.
- Do not overwrite working code.
- Do not implement all phases at once.
- Keep provider logic abstract.
- Keep Hermes integration abstract.
- Keep tools permission-aware.
- Keep secrets server-side.
- Keep clap detection client-side.
- Do not stream raw microphone audio for clap detection.
- Do not expose unrestricted shell access.
- Avoid unnecessary dependencies.
- Use migrations, validation and tests.
- Keep UI faithful to approved Google Stitch design.

## 28. Deployment
```text
Internet
  |
HTTPS
  |
Nginx / aaPanel
  |
HAI JARVIS
  |
+-- Laravel
+-- React/PWA
+-- MySQL/MariaDB
+-- Redis
  |
9Router
  |
Hermes
```

Infrastructure:
```text
Proxmox
  |
  +-- aaPanel / HAI JARVIS
  +-- Hermes environment
  +-- supporting services
```

## 29. Final Agent Instruction
Do not build the whole application in one response.

START WITH PHASE 0.

After Phase 0 report:
- repository structure
- current architecture
- detected technologies
- existing functionality
- missing components
- implementation plan
- risks
- required environment variables

Then wait for approval before Phase 1.

Goal: production-ready, maintainable HAI JARVIS — not a quick prototype.
