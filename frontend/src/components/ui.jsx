import { forwardRef } from 'react'
import { AlertTriangle, Inbox, Loader2 } from 'lucide-react'

const BTN = {
  primary: 'bg-pine text-paper hover:bg-pine-2 disabled:bg-moss/60',
  accent: 'bg-marigold text-ink hover:brightness-95 disabled:opacity-60',
  ghost: 'bg-transparent text-pine border border-line hover:border-pine hover:bg-paper disabled:opacity-50',
  danger: 'bg-brick-soft text-brick hover:bg-brick hover:text-paper disabled:opacity-50',
}
export function Btn({ variant = 'primary', loading, className = '', children, ...p }) {
  return (
    <button {...p} disabled={p.disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 min-h-11 text-sm font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed ${BTN[variant]} ${className}`}>
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}{children}
    </button>
  )
}

export const Card = ({ className = '', children, ...p }) => (
  <section {...p} className={`rounded-xl border border-line bg-paper ${className}`}>{children}</section>
)

const TONES = {
  neutral: 'bg-plaster text-pine-2', warn: 'bg-marigold-soft text-pine', ok: 'bg-ok-soft text-ok', bad: 'bg-brick-soft text-brick', ink: 'bg-pine text-paper',
}
export const Badge = ({ tone = 'neutral', children, title }) => (
  <span title={title} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${TONES[tone]}`}>{children}</span>
)

export const Skeleton = ({ className = 'h-5 w-full' }) => <div className={`skeleton ${className}`} aria-hidden />

export function EmptyState({ icon: Icon = Inbox, title, body, action }) {
  return (
    <div className="flex flex-col items-center text-center gap-2 py-12 px-6">
      <Icon className="size-9 text-moss" aria-hidden />
      <h3 className="text-lg font-bold">{title}</h3>
      {body && <p className="text-sm text-moss max-w-sm">{body}</p>}
      {action}
    </div>
  )
}

export function ErrorState({ error, onRetry, compact }) {
  return (
    <div role="alert" className={`flex ${compact ? 'items-center gap-3 p-3' : 'flex-col items-center text-center gap-2 py-12 px-6'} rounded-xl bg-brick-soft/60 text-brick`}>
      <AlertTriangle className="size-6 shrink-0" aria-hidden />
      <div className={compact ? 'flex-1 text-sm' : ''}>
        {!compact && <h3 className="text-lg font-bold">Couldn’t load this</h3>}
        <p className="text-sm">{error?.message || 'Something went wrong.'}</p>
      </div>
      {onRetry && <Btn variant="ghost" onClick={onRetry} className="bg-paper">Try again</Btn>}
    </div>
  )
}

export function Field({ label, hint, error, children, htmlFor }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">{label}</label>
      {children}
      {error ? <p role="alert" className="text-xs text-brick">{error}</p> : hint ? <p className="text-xs text-moss">{hint}</p> : null}
    </div>
  )
}
export const inputCls = 'w-full min-h-11 rounded-lg border border-line bg-paper px-3 text-base placeholder:text-moss/70 focus:border-pine'
export const Input = forwardRef(function Input(p, ref) { return <input ref={ref} {...p} className={`${inputCls} ${p.className || ''}`} /> })
export const Select = ({ children, ...p }) => <select {...p} className={`${inputCls} ${p.className || ''}`}>{children}</select>
