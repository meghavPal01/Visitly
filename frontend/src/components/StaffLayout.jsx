import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { BarChart3, Users, Building2, CalendarClock, MessageSquareText, LogOut, Inbox, ScrollText, Keyboard, X } from 'lucide-react'
import { useAuth } from '../context/auth'
import { api } from '../lib/api'
import Logo from './Logo'
import ThemeToggle from './ThemeToggle'

const NAV = [
  { to: '/app/inbox', label: 'Inbox', icon: Inbox, key: 'i', badge: true },
  { to: '/app', label: 'Dashboard', icon: BarChart3, end: true, key: 'd' },
  { to: '/app/leads', label: 'Leads', icon: Users, key: 'l' },
  { to: '/app/slots', label: 'Visit slots', icon: CalendarClock, key: 's' },
  { to: '/app/comms', label: 'Messages', icon: MessageSquareText, key: 'm' },
  { to: '/app/project', label: 'Project facts', icon: Building2, admin: true, key: 'p' },
  { to: '/app/audit', label: 'Activity log', icon: ScrollText, admin: true, key: 'a' },
]
const isTyping = (e) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName) || e.target?.isContentEditable

function useInboxCount() {
  const [n, setN] = useState(0)
  const { pathname } = useLocation()
  useEffect(() => {
    let live = true
    const load = () => api('/api/inbox').then((d) => live && setN(d.count)).catch(() => {})
    load()
    const t = setInterval(() => !document.hidden && load(), 30000)
    return () => { live = false; clearInterval(t) }
  }, [pathname])
  return n
}

function ShortcutHelp({ items, onClose }) {
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onClick={(e) => e.stopPropagation()} className="bg-paper rounded-2xl p-5 w-full max-w-sm">
        <div className="flex items-center justify-between mb-3"><h2 className="text-lg font-bold">Keyboard shortcuts</h2><button onClick={onClose} aria-label="Close" className="p-2 -m-2 cursor-pointer"><X className="size-5" /></button></div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {items.map((n) => <div key={n.key} className="contents"><dt><kbd className="rounded border border-line bg-plaster px-1.5 py-0.5 text-xs">g</kbd> <kbd className="rounded border border-line bg-plaster px-1.5 py-0.5 text-xs">{n.key}</kbd></dt><dd>Go to {n.label}</dd></div>)}
          <div className="contents"><dt><kbd className="rounded border border-line bg-plaster px-1.5 py-0.5 text-xs">/</kbd></dt><dd>Search leads</dd></div>
          <div className="contents"><dt><kbd className="rounded border border-line bg-plaster px-1.5 py-0.5 text-xs">?</kbd></dt><dd>Show this help</dd></div>
        </dl>
      </div>
    </div>
  )
}

export default function StaffLayout() {
  const { user, logout } = useAuth()
  const nav = useNavigate()
  const count = useInboxCount()
  const [help, setHelp] = useState(false)
  const items = NAV.filter((n) => !n.admin || user.role === 'admin')

  useEffect(() => {
    let armed = null
    const onKey = (e) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '/') { e.preventDefault(); nav('/app/leads?focus=search'); return }
      if (e.key === '?') { setHelp(true); return }
      if (armed) { const hit = items.find((n) => n.key === e.key); armed = null; if (hit) nav(hit.to); return }
      if (e.key === 'g') { armed = true; setTimeout(() => { armed = null }, 1200) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [items, nav])

  const link = ({ isActive }) =>
    `flex items-center gap-3 rounded-lg px-3 min-h-11 text-sm font-medium transition-colors ${isActive ? 'bg-marigold text-ink' : 'text-on-chrome/80 hover:bg-chrome-2 hover:text-on-chrome'}`
  const out = () => { logout(); nav('/staff') }
  const Badge = ({ n }) => n > 0 ? <span className="ml-auto rounded-full bg-marigold text-ink text-xs font-bold min-w-5 h-5 px-1.5 inline-flex items-center justify-center" aria-label={`${n} waiting`}>{n}</span> : null
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[236px_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-marigold focus:text-ink focus:px-3 focus:py-2 focus:rounded-lg">Skip to content</a>
      <aside className="hidden md:flex flex-col bg-chrome p-4 gap-6 sticky top-0 h-dvh">
        <Logo light className="px-2 pt-2" />
        <nav className="flex flex-col gap-1" aria-label="Main">
          {items.map(({ to, label, icon: I, end, badge }) => <NavLink key={to} to={to} end={end} className={link}><I className="size-5" aria-hidden />{label}{badge && <Badge n={count} />}</NavLink>)}
        </nav>
        <div className="mt-auto rounded-lg bg-chrome-2 p-3 text-on-chrome">
          <p className="text-sm font-semibold truncate">{user.name}</p>
          <p className="text-xs text-on-chrome/70 mb-2">{user.role === 'admin' ? 'Sales head' : 'Sales executive'}</p>
          <div className="flex items-center gap-1 -ml-1">
            <button onClick={out} className="flex items-center gap-2 text-xs text-on-chrome/80 hover:text-marigold cursor-pointer min-h-10 px-1"><LogOut className="size-4" aria-hidden />Sign out</button>
            <ThemeToggle className="ml-auto text-on-chrome/80 hover:text-marigold" />
            <button onClick={() => setHelp(true)} aria-label="Keyboard shortcuts" className="size-10 inline-flex items-center justify-center text-on-chrome/80 hover:text-marigold cursor-pointer"><Keyboard className="size-5" /></button>
          </div>
        </div>
      </aside>
      <div className="min-w-0 pb-24 md:pb-0">
        <header className="md:hidden flex items-center justify-between bg-chrome px-4 h-14 sticky top-0 z-20">
          <Logo light />
          <div className="flex items-center"><ThemeToggle className="text-on-chrome/80" /><button onClick={out} aria-label="Sign out" className="text-on-chrome/80 p-2 cursor-pointer"><LogOut className="size-5" /></button></div>
        </header>
        <main id="main" className="p-4 md:p-8 max-w-6xl mx-auto"><Outlet /></main>
      </div>
      <nav aria-label="Main" className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-chrome grid pb-[env(safe-area-inset-bottom)]" style={{ gridTemplateColumns: `repeat(${Math.min(items.length, 5)}, 1fr)` }}>
        {items.slice(0, 5).map(({ to, label, icon: I, end, badge }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `relative flex flex-col items-center gap-0.5 py-2 text-[11px] ${isActive ? 'text-marigold' : 'text-on-chrome/75'}`}>
            <I className="size-5" aria-hidden />{label.split(' ')[0]}
            {badge && count > 0 && <span className="absolute top-1 left-1/2 ml-2 rounded-full bg-marigold text-ink text-[10px] font-bold min-w-4 h-4 px-1 inline-flex items-center justify-center" aria-label={`${count} waiting`}>{count}</span>}
          </NavLink>
        ))}
      </nav>
      {help && <ShortcutHelp items={items} onClose={() => setHelp(false)} />}
    </div>
  )
}
