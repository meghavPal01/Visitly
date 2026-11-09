import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/auth'
import { Btn, Field, Input } from '../../components/ui'
import Logo from '../../components/Logo'

const DEMO = [
  { label: 'Sales head (admin)', email: 'admin@visitly.demo' },
  { label: 'Sales executive', email: 'priya@visitly.demo' },
]

export default function Login() {
  const { user, login } = useAuth()
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  if (user) return <Navigate to={user.role === 'admin' ? '/app' : '/app/inbox'} replace />
  const submit = async (e) => {
    e.preventDefault(); setErr(null); setBusy(true)
    try { const u = await login(email.trim(), password); nav(u.role === 'admin' ? '/app' : '/app/inbox') } catch (x) { setErr(x.message) } finally { setBusy(false) }
  }
  return (
    <div className="min-h-dvh grid md:grid-cols-2">
      <div className="bg-chrome text-on-chrome p-8 md:p-14 flex flex-col justify-between gap-10">
        <Logo light />
        <div>
          <h1 className="text-4xl md:text-5xl font-bold leading-[1.05] max-w-md">Every enquiry answered in minutes, every visit on the calendar.</h1>
          <p className="mt-4 text-on-chrome/75 max-w-sm">Sign in to see which leads need you, what each buyer asked, and which site visits are coming up.</p>
        </div>
        <p className="text-sm text-on-chrome/60 hidden md:block">Demo workspace with sample data only.</p>
      </div>
      <div className="p-6 md:p-14 flex items-center">
        <form onSubmit={submit} className="w-full max-w-sm mx-auto flex flex-col gap-4" noValidate>
          <h2 className="text-2xl font-bold">Sales team sign in</h2>
          <Field label="Email" htmlFor="email"><Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
          <Field label="Password" htmlFor="pw"><Input id="pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
          {err && <p role="alert" className="text-sm text-brick bg-brick-soft rounded-lg p-3">{err}</p>}
          <Btn type="submit" loading={busy} disabled={!email || !password}>Sign in</Btn>
          <div className="rounded-lg border border-dashed border-line p-3 text-sm">
            <p className="font-medium mb-2">Demo accounts</p>
            <div className="flex flex-wrap gap-2">
              {DEMO.map((d) => <button type="button" key={d.email} onClick={() => { setEmail(d.email); setPassword('Visitly@Demo1') }} className="rounded-full bg-marigold-soft px-3 py-1.5 text-xs font-medium hover:bg-marigold hover:text-ink cursor-pointer">{d.label}</button>)}
            </div>
            <p className="text-xs text-moss mt-2">Tap one to fill the form. Demo password: Visitly@Demo1</p>
          </div>
          <Link to="/" className="text-sm text-moss underline underline-offset-4 text-center">Looking for the buyer experience? Start an enquiry</Link>
        </form>
      </div>
    </div>
  )
}
