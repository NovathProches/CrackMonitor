import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api, clearToken, getToken, setToken } from './api'

export interface AuthUser {
  id: string
  email: string
  name: string
  code: string
  avatar_url: string | null
}

interface AuthContextValue {
  user: AuthUser | null
  token: string | null
  loading: boolean
  signOut: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setTokenState] = useState<string | null>(getToken)
  const [loading, setLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    const t = getToken()
    if (!t) {
      setUser(null)
      setLoading(false)
      return
    }
    try {
      const u = await api.get<AuthUser>('/api/auth/me/')
      setUser(u)
    } catch {
      clearToken()
      setTokenState(null)
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshUser()
  }, [refreshUser])

  function signOut() {
    api.post('/api/auth/logout/').catch(() => {})
    clearToken()
    setTokenState(null)
    setUser(null)
  }

  // Expose a way for Login to push the token in
  ;(window as unknown as Record<string, unknown>).__cmSetAuth = (t: string, u: AuthUser) => {
    setToken(t)
    setTokenState(t)
    setUser(u)
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, signOut, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
