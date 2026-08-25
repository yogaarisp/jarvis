import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { api, clearToken, getToken, setToken } from '../lib/api'
import type { User } from '../types'

interface AuthContextValue {
  user: User
  booting: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const DEFAULT_USER: User = {
  id: 1,
  name: 'Keenan',
  email: 'admin@jarvis.local',
}

const AuthContext = createContext<AuthContextValue | null>(null)

const AUTO_EMAIL = 'admin@jarvis.local'
const AUTO_PASSWORD = 'jarvis123'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>(DEFAULT_USER)
  // booting = true agar child tidak fire API calls sebelum token tersedia
  const [booting, setBooting] = useState(true)

  useEffect(() => {
    const token = getToken()

    if (token) {
      // Token sudah ada – validasi ke backend
      api
        .get<{ user: User }>('/me')
        .then((res) => {
          if (res.data?.user) setUser(res.data.user)
        })
        .catch(() => {
          // Token kadaluarsa, coba auto-login
          clearToken()
          doAutoLogin()
          return
        })
        .finally(() => setBooting(false))
    } else {
      doAutoLogin()
    }
  }, [])

  function doAutoLogin() {
    api
      .post<{ user: User; token: string }>('/auth/login', {
        email: AUTO_EMAIL,
        password: AUTO_PASSWORD,
      })
      .then((res) => {
        if (res.data?.token) setToken(res.data.token)
        if (res.data?.user) setUser(res.data.user)
      })
      .catch(() => {
        // Backend offline – tetap tampil dashboard, API calls akan gracefully fail
      })
      .finally(() => setBooting(false))
  }

  const login = useCallback(async (email: string, password: string) => {
    try {
      const res = await api.post<{ user: User; token: string }>('/auth/login', {
        email,
        password,
      })
      if (res.data?.token) setToken(res.data.token)
      if (res.data?.user) setUser(res.data.user)
    } catch {
      setUser(DEFAULT_USER)
    }
  }, [])

  const logout = useCallback(async () => {
    clearToken()
    setUser(DEFAULT_USER)
    setBooting(true)
    doAutoLogin()
  }, [])

  const value = useMemo(
    () => ({ user, booting, login, logout }),
    [user, booting, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
