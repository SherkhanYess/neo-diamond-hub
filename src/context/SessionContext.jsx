import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { getSession, onAuthChange, loadProfile, signOut as apiSignOut } from '../lib/api/auth'

const SessionContext = createContext(null)

export function SessionProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const refreshProfile = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null)
      return
    }
    try {
      setProfile(await loadProfile(userId))
    } catch {
      setProfile(null)
    }
  }, [])

  useEffect(() => {
    let active = true
    getSession().then(async (s) => {
      if (!active) return
      setSession(s)
      await refreshProfile(s?.user?.id)
      setLoading(false)
    })
    const unsub = onAuthChange(async (s) => {
      setSession(s)
      await refreshProfile(s?.user?.id)
    })
    return () => {
      active = false
      unsub()
    }
  }, [refreshProfile])

  const signOut = useCallback(async () => {
    await apiSignOut()
    setSession(null)
    setProfile(null)
  }, [])

  const value = {
    session,
    profile,
    loading,
    caps: profile?.caps ?? [],
    branchIds: profile?.branchIds ?? [],
    isActive: profile?.isActive ?? false,
    signOut,
  }

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within SessionProvider')
  return ctx
}
