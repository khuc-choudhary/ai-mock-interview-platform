import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, tokenStore } from '../services/api'
import type { User } from '../types'

interface AuthState {
  user: User | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (body: Record<string, unknown>) => Promise<void>
  signOut: () => Promise<void>
  setUser: (u: User) => void
  adoptToken: (token: string, user: User) => void
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState<boolean>(!!tokenStore.get())

  useEffect(() => {
    if (!tokenStore.get()) return
    api
      .me()
      .then(setUser)
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const onExpired = () => setUser(null)
    window.addEventListener('auth:expired', onExpired)
    return () => window.removeEventListener('auth:expired', onExpired)
  }, [])

  const adoptToken = useCallback((token: string, u: User) => {
    tokenStore.set(token)
    setUser(u)
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      setUser,
      adoptToken,
      async signIn(email, password) {
        const r = await api.login(email, password)
        adoptToken(r.access_token, r.user)
      },
      async signUp(body) {
        const r = await api.register(body)
        adoptToken(r.access_token, r.user)
      },
      async signOut() {
        try {
          await api.logout()
        } catch {
          /* token may already be invalid; still sign out locally */
        }
        tokenStore.clear()
        setUser(null)
      },
    }),
    [user, loading, adoptToken],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth outside AuthProvider')
  return v
}
