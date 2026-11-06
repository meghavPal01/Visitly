import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { CalendarPlus, LogOut, SendHorizontal, UserRound } from 'lucide-react'
import { api, session } from '../../lib/api'
import { useFetch } from '../../lib/hooks'
import { LANGS, T } from '../../lib/i18n'
import { fmtDateTime } from '../../lib/format'
import { Btn, ErrorState, Skeleton } from '../../components/ui'
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
  const end = useRef(null)
  const t = T[lang]

  useEffect(() => { if (hist.data) setMsgs(hist.data) }, [hist.data])
  useEffect(() => { if (me.data?.lead.language) setLang(me.data.lead.language); if (me.data?.consent === 'opted_out') setOptedOut(true) }, [me.data])
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
      setMsgs((m) => [...m.filter((x) => x.id !== tmp.id), ...res])
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
    setMsgs((m) => [...m, { id: `pass-${Date.now()}-${b.id}`, sender: 'ai', content: b.status === 'confirmed' ? '' : 'Your visit has been cancelled. You can pick a new time whenever you like.', meta: b.status === 'confirmed' ? { booking: b } : null }])
  }
  const stop = async () => { try { await api('/api/buyer/opt-out', { method: 'POST', kind: 'buyer' }); setOptedOut(true) } catch (e) { setFail({ message: e.message }) } }

  const up = me.data?.upcoming_booking
  const empty = hist.data && msgs.length === 0
  return (
    <div className="h-dvh flex flex-col max-w-2xl mx-auto bg-plaster sm:border-x border-line">
      <header className="bg-pine text-paper px-4 py-3 flex items-center gap-3 shrink-0">
        <Logo light className="!text-lg" />
        <div className="ml-auto flex items-center gap-1" role="group" aria-label="Language">
          {LANGS.map((l) => <button key={l.code} onClick={() => changeLang(l.code)} aria-pressed={lang === l.code} className={`rounded-full px-2.5 min-h-8 text-xs font-medium cursor-pointer ${lang === l.code ? 'bg-marigold text-pine' : 'text-paper/80 hover:bg-pine-2'}`}>{l.label}</button>)}
          <button onClick={() => { session.clear('buyer'); nav('/') }} aria-label="Leave chat" className="p-2 text-paper/70 hover:text-marigold cursor-pointer"><LogOut className="size-4" /></button>
        </div>
      </header>

      {up && (
        <button onClick={() => setPicker(true)} className="shrink-0 bg-marigold-soft px-4 py-2 text-sm text-left flex justify-between gap-2 cursor-pointer border-b border-line">
          <span><strong>{t.next}:</strong> {fmtDateTime(up.slot.start_time)}</span><span className="underline underline-offset-4 font-medium">Change</span>
        </button>
      )}

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
            {m.content && <Bubble who={m.sender}>{m.content}</Bubble>}
            {m.meta?.booking && <SitePass booking={m.meta.booking}>{m.meta.handoff?.executive && <p className="text-xs mt-2 font-medium">Your contact: {m.meta.handoff.executive}</p>}</SitePass>}
            {!m.meta?.booking && m.meta?.handoff?.executive && <span className="inline-flex items-center gap-1.5 text-xs bg-paper border border-line rounded-full px-3 py-1"><UserRound className="size-3.5" aria-hidden />{m.meta.handoff.executive} will contact you</span>}
          </div>
        ))}
        {sending && <div className="self-start bg-paper border border-line rounded-2xl rounded-bl-md px-4 py-3 flex gap-1" role="status" aria-label={t.typing}>{[0, 1, 2].map((i) => <span key={i} className="size-2 rounded-full bg-moss animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />)}</div>}
        {fail && <ErrorState compact error={fail} onRetry={fail.body ? () => send(fail.body) : undefined} />}
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

function Bubble({ who, children }) {
  const buyer = who === 'buyer'
  return <p className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ${buyer ? 'bg-pine text-paper rounded-br-md' : 'bg-paper border border-line rounded-bl-md'}`}>{children}</p>
}
