import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { CalendarPlus, LogOut, SendHorizontal, UserRound } from 'lucide-react'
import { api, session } from '../../lib/api'
import { useFetch } from '../../lib/hooks'
import { LANGS, T } from '../../lib/i18n'
import { fmtDateTime } from '../../lib/format'
import { Btn, ErrorState, Skeleton } from '../../components/ui'
import ThemeToggle from '../../components/ThemeToggle'
import Logo from '../../components/Logo'
import SitePass from '../../components/SitePass'
import VisitPicker from '../../components/VisitPicker'

const scriptLang = (t) => (/[઀-૿]/.test(t) ? 'gu' : /[ऀ-ॿ]/.test(t) ? 'hi' : null)

export default function Chat() {
  const nav = useNavigate()
  const sess = session.get('buyer')
  const me = useFetch(() => api('/api/buyer/me', { kind: 'buyer' }), [])
  const hist = useFetch(() => api('/api/buyer/messages', { kind: 'buyer' }), [])
  const [msgs, setMsgs] = useState([])
  const [lang, setLang] = useState(sess?.language || 'en')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [fail, setFail] = useState(null)
  const [picker, setPicker] = useState(false)
  const [optedOut, setOptedOut] = useState(false)
  const [conv, setConv] = useState(null)
  const end = useRef(null)
  const t = T[lang]

  useEffect(() => { if (hist.data) setMsgs(hist.data) }, [hist.data])
  // Poll for replies from a salesperson. Only messages with ids we don't have are appended, so nothing duplicates or reorders.
  useEffect(() => {
    if (!sess) return undefined
    const tick = async () => {
      if (document.hidden) return
      try {
        const [rows, m] = await Promise.all([api('/api/buyer/messages', { kind: 'buyer' }), api('/api/buyer/me', { kind: 'buyer' })])
        setMsgs((cur) => { const have = new Set(cur.map((x) => x.id)); const add = rows.filter((r) => !have.has(r.id)); return add.length ? [...cur.filter((x) => !String(x.id).startsWith('tmp-')), ...add] : cur })
        setConv(m.conversation)
      } catch { /* next tick retries */ }
    }
    const id = setInterval(tick, 8000)
    return () => clearInterval(id)
  }, [sess])
  useEffect(() => { if (me.data?.lead.language) setLang(me.data.lead.language); if (me.data?.consent === 'opted_out') setOptedOut(true); if (me.data?.conversation) setConv(me.data.conversation) }, [me.data])
  useEffect(() => { end.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'end' }) }, [msgs, sending])
  useEffect(() => { if (me.error?.status === 401 || hist.error?.status === 401) { session.clear('buyer'); nav('/') } }, [me.error, hist.error, nav])

  if (!sess) return <Navigate to="/" replace />

  const send = async (raw) => {
    const body = raw.trim()
    if (!body || sending) return
    setFail(null); setText(''); setSending(true)
    const tmp = { id: `tmp-${Date.now()}`, sender: 'buyer', content: body }
    setMsgs((m) => [...m, tmp])
    const l = scriptLang(body); if (l) setLang(l)
    try {
      const res = await api('/api/buyer/messages', { method: 'POST', kind: 'buyer', body: { text: body } })
      setMsgs((m) => { const have = new Set(m.map((x) => x.id)); return [...m.filter((x) => x.id !== tmp.id), ...res.filter((r) => !have.has(r.id))] })
      if (res.some((r) => r.meta?.booking || r.meta?.handoff)) me.reload()
    } catch (e) { setMsgs((m) => m.filter((x) => x.id !== tmp.id)); setFail({ message: e.message, body }) } finally { setSending(false) }
  }
  const human = async () => {
    setSending(true); setFail(null)
    try { setMsgs((m) => [...m, ...[]]); const res = await api('/api/buyer/handoff', { method: 'POST', kind: 'buyer' }); setMsgs((m) => [...m, ...res]); me.reload() }
    catch (e) { setFail({ message: e.message }) } finally { setSending(false) }
  }
  const changeLang = async (code) => { setLang(code); try { await api('/api/buyer/language', { method: 'POST', kind: 'buyer', body: { language: code } }) } catch { /* UI language still switches */ } }
  const booked = (b) => {
    setPicker(false); me.reload()
    setMsgs((m) => [...m, { id: `pass-${Date.now()}-${b.id}`, sender: 'ai', content: b.status === 'confirmed' ? '' : 'Your visit has been cancelled. You can pick a new time whenever you like.', meta: b.status === 'confirmed' ? { booking: b, handoff: b.executive ? { executive: b.executive } : null } : null }])
  }
  const stop = async () => { try { await api('/api/buyer/opt-out', { method: 'POST', kind: 'buyer' }); setOptedOut(true) } catch (e) { setFail({ message: e.message }) } }

  const up = me.data?.upcoming_booking
  const empty = hist.data && msgs.length === 0
  return (
    <div className="h-dvh flex flex-col max-w-2xl mx-auto bg-plaster sm:border-x border-line">
      <header className="bg-chrome text-on-chrome px-4 py-3 flex items-center gap-3 shrink-0">
        <Logo light className="!text-lg" />
        <div className="ml-auto flex items-center gap-1" role="group" aria-label="Language">
          {LANGS.map((l) => <button key={l.code} onClick={() => changeLang(l.code)} aria-pressed={lang === l.code} className={`rounded-full px-2.5 min-h-8 text-xs font-medium cursor-pointer ${lang === l.code ? 'bg-marigold text-ink' : 'text-on-chrome/80 hover:bg-chrome-2'}`}>{l.label}</button>)}
          <ThemeToggle />
          <button onClick={() => { session.clear('buyer'); nav('/') }} aria-label="Leave chat" className="p-2 text-on-chrome/70 hover:text-marigold cursor-pointer"><LogOut className="size-4" /></button>
        </div>
      </header>

      {up && (
        <button onClick={() => setPicker(true)} className="shrink-0 bg-marigold-soft px-4 py-2 text-sm text-left flex justify-between gap-2 cursor-pointer border-b border-line">
          <span><strong>{t.next}:</strong> {fmtDateTime(up.slot.start_time)}</span><span className="underline underline-offset-4 font-medium">Change</span>
        </button>
      )}

      {conv?.status === 'human_active' && conv.executive && <p role="status" className="shrink-0 bg-ok-soft text-ok px-4 py-2 text-sm font-medium flex items-center gap-2 border-b border-line"><UserRound className="size-4" aria-hidden />{t.chatting(conv.executive)}</p>}
      {conv?.status === 'human_requested' && <p role="status" className="shrink-0 bg-marigold-soft px-4 py-2 text-sm border-b border-line">{t.waiting}</p>}

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3" aria-live="polite" aria-relevant="additions">
        {(me.loading || hist.loading) && <><Skeleton className="h-12 w-3/4" /><Skeleton className="h-12 w-2/3 self-end" /></>}
        {(me.error || hist.error) && <ErrorState error={me.error || hist.error} onRetry={() => { me.reload(); hist.reload() }} />}
        {empty && me.data && (
          <>
            <Bubble who="ai">{t.greet(me.data.lead.name.split(' ')[0])}</Bubble>
            <div className="flex flex-wrap gap-2">{t.chips.map((c) => <button key={c} onClick={() => send(c)} className="rounded-full border border-pine/40 bg-paper px-3.5 min-h-10 text-sm hover:bg-marigold-soft cursor-pointer">{c}</button>)}</div>
          </>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={`flex flex-col gap-2 ${m.sender === 'buyer' ? 'items-end' : 'items-start'}`}>
            {m.content && <Bubble who={m.sender} label={m.sender === 'executive' ? (conv?.executive || t.teamMember) : null}>{m.content}</Bubble>}
            {m.meta?.booking && <SitePass booking={m.meta.booking}>{m.meta.handoff?.executive && <p className="text-xs mt-2 font-medium">Your contact: {m.meta.handoff.executive}</p>}</SitePass>}
            {!m.meta?.booking && m.meta?.handoff?.executive && <span className="inline-flex items-center gap-1.5 text-xs bg-paper border border-line rounded-full px-3 py-1"><UserRound className="size-3.5" aria-hidden />{m.meta.handoff.executive} will contact you</span>}
          </div>
        ))}
        {sending && <div className="self-start bg-paper border border-line rounded-2xl rounded-bl-md px-4 py-3 flex gap-1" role="status" aria-label={t.typing}>{[0, 1, 2].map((i) => <span key={i} className="size-2 rounded-full bg-moss animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />)}</div>}
        {fail && <ErrorState compact error={fail} onRetry={fail.body ? () => send(fail.body) : undefined} />}
        {!empty && !sending && msgs.length > 0 && conv?.status !== 'human_active' && !msgs.some((m) => m.sender === 'buyer' && m.id?.toString().startsWith('tmp-')) && (
          <div className="flex flex-wrap gap-2" aria-label="Suggested questions">{(up ? t.chipsBooked : t.chipsOpen).map((c) => <button key={c} onClick={() => send(c)} className="rounded-full border border-pine/40 bg-paper px-3.5 min-h-10 text-sm hover:bg-marigold-soft cursor-pointer">{c}</button>)}</div>)}
        <div ref={end} />
      </div>

      <div className="shrink-0 border-t border-line bg-paper p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex gap-2 mb-2 overflow-x-auto">
          <Btn variant="ghost" onClick={() => setPicker(true)} className="!min-h-10 shrink-0"><CalendarPlus className="size-4" aria-hidden />{t.pick}</Btn>
          <Btn variant="ghost" onClick={human} disabled={sending} className="!min-h-10 shrink-0"><UserRound className="size-4" aria-hidden />{t.human}</Btn>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); send(text) }} className="flex gap-2">
          <textarea value={text} rows={1} maxLength={1000} placeholder={t.placeholder} aria-label={t.placeholder}
            onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text) } }}
            className="flex-1 resize-none min-h-11 max-h-32 rounded-lg border border-line px-3 py-2.5 text-base focus:border-pine" />
          <Btn type="submit" variant="accent" disabled={!text.trim() || sending} aria-label={t.send} className="!px-3.5"><SendHorizontal className="size-5" aria-hidden /></Btn>
        </form>
        <p className="text-[11px] text-moss mt-2 text-center">{optedOut ? 'You’ve opted out. We won’t send you further messages.' : <button onClick={stop} className="underline underline-offset-2 cursor-pointer">{t.stop}</button>}</p>
      </div>

      {picker && <VisitPicker projectId={me.data?.lead.project_id} existing={up} onClose={() => setPicker(false)} onDone={booked} />}
    </div>
  )
}

function Bubble({ who, label, children }) {
  const buyer = who === 'buyer'
  const staff = who === 'executive'
  return (
    <div className={`max-w-[85%] flex flex-col ${buyer ? 'items-end' : 'items-start'}`}>
      {label && <span className="text-xs font-semibold text-moss mb-1 px-1">{label}</span>}
      <p className={`whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ${buyer ? 'bg-pine text-paper rounded-br-md' : staff ? 'bg-marigold-soft border border-marigold rounded-bl-md' : 'bg-paper border border-line rounded-bl-md'}`}>{children}</p>
    </div>
  )
}
