import { createContext, useContext, useState, useCallback } from 'react'
import { api, session } from '../lib/api'

const Ctx = createContext(null)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => session.get('staff')?.user || null)
  const login = useCallback(async (email, password) => {
    const res = await api('/api/auth/login', { method: 'POST', body: { email, password }, kind: 'staff' })
    session.set('staff', res); setUser(res.user); return res.user
  }, [])
  const logout = useCallback(() => { session.clear('staff'); setUser(null) }, [])
  return <Ctx.Provider value={{ user, login, logout }}>{children}</Ctx.Provider>
}
