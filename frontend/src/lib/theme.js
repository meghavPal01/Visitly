import { useCallback, useEffect, useState } from 'react'

const read = () => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'

export function useTheme() {
  const [theme, setTheme] = useState(read)
  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])
  const toggle = useCallback(() => {
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark'
      try { localStorage.setItem('visitly.theme', next) } catch { /* storage unavailable: theme still changes for this visit */ }
      return next
    })
  }, [])
  return { theme, toggle }
}
