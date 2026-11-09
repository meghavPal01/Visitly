import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { CheckCircle2, AlertTriangle, X } from 'lucide-react'

const Ctx = createContext({ toast: () => {} })
export const useToast = () => useContext(Ctx)

/** Short confirmations for actions. `action` adds a button (used for Undo). Errors stay until dismissed. */
export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const id = useRef(0)
  const timers = useRef(new Map())
  const dismiss = useCallback((i) => { clearTimeout(timers.current.get(i)); timers.current.delete(i); setItems((l) => l.filter((t) => t.id !== i)) }, [])
  const toast = useCallback((message, opts = {}) => {
    const i = ++id.current
    setItems((l) => [...l.slice(-3), { id: i, message, tone: opts.tone || 'ok', action: opts.action }])
    if (opts.tone !== 'error') timers.current.set(i, setTimeout(() => dismiss(i), opts.action ? 8000 : 4000))
    return i
  }, [dismiss])
  useEffect(() => { const m = timers.current; return () => m.forEach(clearTimeout) }, [])
  return (
    <Ctx.Provider value={{ toast, dismiss }}>
      {children}
      <div className="fixed z-50 bottom-20 md:bottom-6 inset-x-4 md:inset-x-auto md:right-6 flex flex-col gap-2 items-stretch md:w-96 pointer-events-none" role="region" aria-label="Notifications">
        {items.map((t) => (
          <div key={t.id} role={t.tone === 'error' ? 'alert' : 'status'} className={`pointer-events-auto pass-in flex items-center gap-3 rounded-xl px-4 py-3 text-sm shadow-lg border ${t.tone === 'error' ? 'bg-brick-soft text-brick border-brick/30' : 'bg-chrome text-on-chrome border-chrome-2'}`}>
            {t.tone === 'error' ? <AlertTriangle className="size-5 shrink-0" aria-hidden /> : <CheckCircle2 className="size-5 shrink-0 text-marigold" aria-hidden />}
            <span className="flex-1">{t.message}</span>
            {t.action && <button onClick={() => { t.action.run(); dismiss(t.id) }} className="font-semibold underline underline-offset-4 text-marigold min-h-8 px-1 cursor-pointer">{t.action.label}</button>}
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="p-1 -m-1 opacity-70 hover:opacity-100 cursor-pointer"><X className="size-4" /></button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
