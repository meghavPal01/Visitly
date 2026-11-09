import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api, session } from '../../lib/api'
import { useFetch } from '../../lib/hooks'
import { LANGS } from '../../lib/i18n'
import { Btn, Field, Input, Select } from '../../components/ui'
import Logo from '../../components/Logo'

const SOURCES = ['portal', 'social', 'website', 'hoarding']

const range = (o) => `₹${o.indicative_price_lakh_min}–${o.indicative_price_lakh_max} lakh`

function ProjectCard({ p, onPick, picked }) {
  return (
    <article className={`rounded-xl border bg-paper p-4 ${picked ? 'border-pine' : 'border-line'}`}>
      <div className="flex items-start justify-between gap-2">
        <div><h3 className="font-display font-bold text-lg">{p.name}</h3><p className="text-sm text-moss">{p.location}</p></div>
        {p.is_demo_data && <span className="text-[11px] rounded-full bg-marigold-soft px-2 py-0.5 font-medium shrink-0">Sample data</span>}
      </div>
      {p.overview && <p className="text-sm mt-2">{p.overview}</p>}
      {p.bhk_options.length > 0 && <ul className="mt-2 flex flex-wrap gap-1.5">{p.bhk_options.map((o) => <li key={o.bhk} className="text-xs rounded-md bg-plaster border border-line px-2 py-1"><strong>{o.bhk} BHK</strong> · {o.carpet_sqft} sq ft · {range(o)}</li>)}</ul>}
      {p.amenities.length > 0 && <p className="text-xs text-moss mt-2">{p.amenities.join(' · ')}</p>}
      <p className="text-xs text-moss mt-2">RERA {p.rera_number || 'to be confirmed'} · Possession: {p.possession || 'to be confirmed'}</p>
      <div className="flex gap-3 mt-3 items-center">
        <button type="button" onClick={onPick} aria-pressed={picked} className="min-h-10 rounded-lg border border-pine px-3 text-sm font-medium cursor-pointer hover:bg-marigold-soft">{picked ? 'Selected' : 'Enquire about this'}</button>
        {p.map_url && <a href={p.map_url} target="_blank" rel="noreferrer noopener" className="text-sm underline underline-offset-4">View on map</a>}
      </div>
    </article>
  )
}

export default function Enquire() {
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const src = SOURCES.includes(sp.get('src')) ? sp.get('src') : 'website'
  const projects = useFetch(() => api('/api/public/projects', { kind: 'buyer' }), [])
  const [f, setF] = useState({ name: '', phone: '', language: 'en', project_id: '', consent: false })
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const existing = session.get('buyer')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  const submit = async (e) => {
    e.preventDefault(); setErr(null); setBusy(true)
    try {
      const res = await api('/api/public/enquiry', { method: 'POST', kind: 'buyer', body: { ...f, source: src, project_id: f.project_id ? +f.project_id : null } })
      session.set('buyer', { token: res.token, name: f.name.trim(), language: f.language })
      nav('/chat')
    } catch (x) { setErr(x.message) } finally { setBusy(false) }
  }

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="px-5 md:px-12 py-4 flex items-center justify-between"><Logo /><Link to="/staff" className="text-sm text-moss underline underline-offset-4">Sales team sign in</Link></header>
      <main className="flex-1 grid md:grid-cols-[1.1fr_1fr] gap-8 md:gap-16 px-5 md:px-12 pb-12 max-w-6xl w-full mx-auto items-start md:pt-10">
        <div className="md:pt-6">
          <h1 className="text-4xl md:text-6xl font-bold leading-[1.02]">See your next home in person.</h1>
          <p className="text-lg mt-4 max-w-md text-pine-2">Tell us what you’re looking for. Our assistant answers in English, Hindi or Gujarati and books a site visit at a time that’s actually free.</p>
          <div className="mt-8 flex flex-col gap-3" aria-label="Our projects">
            {projects.loading && <div className="h-24 rounded-xl bg-line/60 animate-pulse" />}
            {projects.data?.map((p) => <ProjectCard key={p.id} p={p} onPick={() => setF((x) => ({ ...x, project_id: String(p.id) }))} picked={f.project_id === String(p.id)} />)}
          </div>
        </div>
        <form onSubmit={submit} noValidate className="bg-paper border border-line rounded-2xl p-5 md:p-7 flex flex-col gap-4 shadow-[0_1px_0_#c9d3cf]">
          {existing && <p className="text-sm bg-marigold-soft rounded-lg p-3">You have a chat open. <Link to="/chat" className="font-semibold underline">Continue as {existing.name}</Link></p>}
          <h2 className="text-xl font-bold">Start your enquiry</h2>
          <Field label="Your name" htmlFor="n"><Input id="n" autoComplete="name" value={f.name} onChange={set('name')} minLength={2} maxLength={120} required /></Field>
          <Field label="Mobile number" htmlFor="p" hint="10-digit Indian mobile, with or without +91"><Input id="p" type="tel" inputMode="tel" autoComplete="tel" value={f.phone} onChange={set('phone')} required /></Field>
          <fieldset><legend className="text-sm font-medium mb-1.5">Chat language</legend>
            <div className="grid grid-cols-3 gap-2" role="radiogroup">{LANGS.map((l) => (
              <label key={l.code} className={`min-h-11 rounded-lg border text-center flex items-center justify-center cursor-pointer text-sm font-medium has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-marigold ${f.language === l.code ? 'bg-pine text-paper border-pine' : 'border-line hover:border-pine'}`}>
                <input type="radio" name="lang" value={l.code} checked={f.language === l.code} onChange={set('language')} className="sr-only" />{l.label}</label>))}</div>
          </fieldset>
          <Field label="Project (optional)" htmlFor="pr"><Select id="pr" value={f.project_id} onChange={set('project_id')}><option value="">Not sure yet</option>{projects.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          <label className="flex gap-3 text-sm cursor-pointer items-start"><input type="checkbox" checked={f.consent} onChange={set('consent')} className="size-5 mt-0.5 accent-pine shrink-0" />
            <span>I agree that Visitly may contact me about this enquiry and related offers by phone, SMS or WhatsApp. I can stop this any time. <span className="text-moss">Optional. You can still chat and book a visit without it.</span></span></label>
          {err && <p role="alert" className="text-sm text-brick bg-brick-soft rounded-lg p-3">{err}</p>}
          <Btn type="submit" variant="accent" loading={busy} disabled={f.name.trim().length < 2 || !f.phone}>Start chat</Btn>
          <p className="text-xs text-moss">We use your number only to answer this enquiry and manage your visit. Sample data only in this demo.</p>
        </form>
      </main>
    </div>
  )
}
