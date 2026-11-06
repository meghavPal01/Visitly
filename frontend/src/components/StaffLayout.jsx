import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { BarChart3, Users, Building2, CalendarClock, MessageSquareText, LogOut } from 'lucide-react'
import { useAuth } from '../context/auth'
import Logo from './Logo'

const NAV = [
  { to: '/app', label: 'Dashboard', icon: BarChart3, end: true },
  { to: '/app/leads', label: 'Leads', icon: Users },
  { to: '/app/slots', label: 'Visit slots', icon: CalendarClock },
  { to: '/app/comms', label: 'Messages', icon: MessageSquareText },
  { to: '/app/project', label: 'Project facts', icon: Building2, admin: true },
]

export default function StaffLayout() {
  const { user, logout } = useAuth()
  const nav = useNavigate()
  const items = NAV.filter((n) => !n.admin || user.role === 'admin')
  const link = ({ isActive }) =>
    `flex items-center gap-3 rounded-lg px-3 min-h-11 text-sm font-medium transition-colors ${isActive ? 'bg-marigold text-pine' : 'text-paper/80 hover:bg-pine-2 hover:text-paper'}`
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[236px_1fr]">
      <aside className="hidden md:flex flex-col bg-pine p-4 gap-6 sticky top-0 h-dvh">
        <Logo light className="px-2 pt-2" />
        <nav className="flex flex-col gap-1" aria-label="Main">
          {items.map(({ to, label, icon: I, end }) => <NavLink key={to} to={to} end={end} className={link}><I className="size-5" aria-hidden />{label}</NavLink>)}
        </nav>
        <div className="mt-auto rounded-lg bg-pine-2 p-3 text-paper">
          <p className="text-sm font-semibold truncate">{user.name}</p>
          <p className="text-xs text-paper/70 mb-2">{user.role === 'admin' ? 'Sales head' : 'Sales executive'}</p>
          <button onClick={() => { logout(); nav('/staff') }} className="flex items-center gap-2 text-xs text-paper/80 hover:text-marigold cursor-pointer min-h-8"><LogOut className="size-4" aria-hidden />Sign out</button>
        </div>
      </aside>
      <div className="min-w-0 pb-24 md:pb-0">
        <header className="md:hidden flex items-center justify-between bg-pine px-4 h-14 sticky top-0 z-20">
          <Logo light />
          <button onClick={() => { logout(); nav('/staff') }} aria-label="Sign out" className="text-paper/80 p-2 cursor-pointer"><LogOut className="size-5" /></button>
        </header>
        <main className="p-4 md:p-8 max-w-6xl mx-auto"><Outlet /></main>
      </div>
      <nav aria-label="Main" className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-pine grid pb-[env(safe-area-inset-bottom)]" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
        {items.map(({ to, label, icon: I, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[11px] ${isActive ? 'text-marigold' : 'text-paper/75'}`}><I className="size-5" aria-hidden />{label.split(' ')[0]}</NavLink>
        ))}
      </nav>
    </div>
  )
}
