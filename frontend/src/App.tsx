import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from './context/AuthContext'
import { BottomNav } from './components/BottomNav'
import { CorePage } from './pages/CorePage'
import { AgentsPage } from './pages/AgentsPage'
import { MissionsPage } from './pages/MissionsPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import ResearchPage from './pages/ResearchPage'
import SkillsPage from './pages/SkillsPage'
import SettingsPage from './pages/SettingsPage'

function TopBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <header className="hud-panel sticky top-0 z-30 flex items-center justify-between border-b border-cyan-500/20 px-4 py-2 bg-cyan-950/40 backdrop-blur-md">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/')}
          className="font-mono-tech text-sm font-bold tracking-[0.25em] text-cyan-400 text-glow-cyan flex items-center gap-2"
        >
          <span className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#00e5ff]" />
          JARVIS // HUD
        </button>
        <span className="hidden rounded border border-amber-400/40 bg-amber-950/30 px-2 py-0.5 font-mono-tech text-[9px] font-bold tracking-widest text-amber-300 sm:block">
          KEETECH
        </span>
      </div>

      <div className="flex items-center gap-2 font-mono-tech">
        <button
          onClick={() => navigate('/')}
          className="hud-btn rounded px-2.5 py-1 text-xs text-cyan-300 font-semibold"
        >
          ← DASHBOARD
        </button>
        <span className="text-xs tracking-wider text-cyan-200/70 hidden sm:inline">{user?.name}</span>
        <button
          onClick={onOpenSettings}
          title="Pengaturan sistem"
          className="hud-btn flex h-7 w-7 items-center justify-center rounded border border-cyan-500/30 text-cyan-300"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l-.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z" />
          </svg>
        </button>
        <button
          onClick={async () => {
            await logout()
            navigate('/')
          }}
          className="hud-btn-danger rounded px-2 py-1 text-[10px] font-semibold tracking-widest text-rose-300"
        >
          RESET
        </button>
      </div>
    </header>
  )
}

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const location = useLocation()
  const isRoot = location.pathname === '/'

  return (
    <div className="h-full w-full bg-jarvis-bg select-none">
      {!isRoot && <TopBar onOpenSettings={() => setSettingsOpen(true)} />}
      <BottomNav />
      <Routes>
        <Route path="/" element={<CorePage />} />
        <Route path="/missions" element={<MissionsPage />} />
        <Route path="/research" element={<ResearchPage />} />
        <Route path="/skills" element={<SkillsPage />} />
        <Route
          path="/system"
          element={
            <PlaceholderPage
              title="SYSTEM MONITORING"
              phase="PHASE 10"
              description="Monitoring CPU, RAM, disk, jaringan, layanan server, dan kesehatan website."
            />
          }
        />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/settings" element={<Navigate to="/" replace />} />
        <Route
          path="/more"
          element={
            <PlaceholderPage
              title="MORE"
              phase="PHASE 6+"
              description="Projects, Memory, dan Automation."
            />
          }
        />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {settingsOpen && <SettingsPage onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
