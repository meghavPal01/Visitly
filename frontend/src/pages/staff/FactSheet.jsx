import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { api } from '../../lib/api'
import { useFetch } from '../../lib/hooks'
import { Btn, Card, ErrorState, Field, Input, Select, Skeleton } from '../../components/ui'
import { useToast } from '../../components/Toast'

const TA = 'w-full rounded-lg border border-line bg-paper px-3 py-2 text-base focus:border-pine'
const lines = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean)

export default function FactSheet() {
  const projects = useFetch(() => api('/api/projects'), [])
  const [pid, setPid] = useState(null)
  useEffect(() => { if (projects.data?.length && !pid) setPid(projects.data[0].id) }, [projects.data, pid])
  const fs = useFetch(() => (pid ? api(`/api/projects/${pid}/fact-sheet`) : Promise.resolve(null)), [pid])
  const [f, setF] = useState(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const { toast } = useToast()

  useEffect(() => {
    if (!fs.data) return
    const c = fs.data.content || {}
    setF({ location: fs.data.project.location || '', map_url: fs.data.project.map_url || '', rera_number: fs.data.project.rera_number || '',
      overview: c.overview || '', possession: c.possession || '', amenities: (c.amenities || []).join('\n'), location_highlights: (c.location_highlights || []).join('\n'),
      bhk_options: c.bhk_options || [], faqs: c.faqs || [] }); setMsg(null)
  }, [fs.data])
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const save = async () => {
    setSaving(true); setMsg(null)
    const num = (v) => (v === '' || v == null ? null : Number(v))
    try {
      const r = await api(`/api/projects/${pid}/fact-sheet`, { method: 'PUT', body: {
        location: f.location, map_url: f.map_url || null, rera_number: f.rera_number || null,
        content: { overview: f.overview, possession: f.possession || null, amenities: lines(f.amenities), location_highlights: lines(f.location_highlights),
          bhk_options: f.bhk_options.map((b) => ({ bhk: Number(b.bhk), carpet_sqft: num(b.carpet_sqft), indicative_price_lakh_min: num(b.indicative_price_lakh_min), indicative_price_lakh_max: num(b.indicative_price_lakh_max) })),
          faqs: f.faqs.filter((x) => x.q.trim() && x.a.trim()) } } })
      setMsg({ ok: true, text: `Saved as version ${r.version}. The assistant uses it immediately.` }); toast(`Project facts saved (version ${r.version})`); fs.reload()
    } catch (e) { setMsg({ ok: false, text: e.message }) } finally { setSaving(false) }
  }

  return (
    <div className="flex flex-col gap-5 pb-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-3xl font-bold">Project facts</h1><p className="text-moss text-sm max-w-xl">The assistant answers only from what’s written here. Anything missing is passed to a salesperson instead of guessed.</p></div>
        {projects.data && <Select aria-label="Project" value={pid || ''} onChange={(e) => setPid(+e.target.value)} className="!w-auto">{projects.data.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>}
      </div>
      {(projects.error || fs.error) && <ErrorState error={projects.error || fs.error} onRetry={() => { projects.reload(); fs.reload() }} />}
      {(projects.loading || fs.loading) && !f && <Skeleton className="h-96" />}
      {f && (
        <>
          <Card className="p-5 grid md:grid-cols-2 gap-4">
            <h2 className="text-lg font-bold md:col-span-2">Registration and location <span className="text-sm font-normal text-moss">version {fs.data.version}</span></h2>
            <Field label="RERA registration number" htmlFor="rera" hint="Shown to buyers. Enter the number issued by the regulator."><Input id="rera" value={f.rera_number} onChange={set('rera_number')} maxLength={80} /></Field>
            <Field label="Possession" htmlFor="pos"><Input id="pos" value={f.possession} onChange={set('possession')} maxLength={200} /></Field>
            <Field label="Address" htmlFor="loc"><Input id="loc" value={f.location} onChange={set('location')} maxLength={255} /></Field>
            <Field label="Map link" htmlFor="map" hint="Must start with https://"><Input id="map" type="url" value={f.map_url} onChange={set('map_url')} /></Field>
            <div className="md:col-span-2"><Field label="Overview" htmlFor="ov"><textarea id="ov" rows={3} value={f.overview} onChange={set('overview')} maxLength={2000} className={TA} /></Field></div>
          </Card>
          <Card className="p-5">
            <div className="flex justify-between items-center mb-3"><h2 className="text-lg font-bold">Home types</h2><Btn variant="ghost" onClick={() => setF({ ...f, bhk_options: [...f.bhk_options, { bhk: 2 }] })}><Plus className="size-4" />Add type</Btn></div>
            {f.bhk_options.length === 0 && <p className="text-sm text-moss">No home types yet. Add one so the assistant can describe sizes and indicative prices.</p>}
            <div className="flex flex-col gap-3">{f.bhk_options.map((b, i) => {
              const up = (k) => (e) => setF({ ...f, bhk_options: f.bhk_options.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)) })
              return <div key={i} className="grid grid-cols-2 md:grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 items-end">
                <Field label="BHK" htmlFor={`b${i}`}><Input id={`b${i}`} type="number" min={1} max={6} value={b.bhk ?? ''} onChange={up('bhk')} /></Field>
                <Field label="Carpet sq ft" htmlFor={`c${i}`}><Input id={`c${i}`} type="number" min={100} value={b.carpet_sqft ?? ''} onChange={up('carpet_sqft')} /></Field>
                <Field label="Price from (lakh)" htmlFor={`p${i}`}><Input id={`p${i}`} type="number" min={0} value={b.indicative_price_lakh_min ?? ''} onChange={up('indicative_price_lakh_min')} /></Field>
                <Field label="Price to (lakh)" htmlFor={`q${i}`}><Input id={`q${i}`} type="number" min={0} value={b.indicative_price_lakh_max ?? ''} onChange={up('indicative_price_lakh_max')} /></Field>
                <Btn variant="danger" aria-label={`Remove ${b.bhk} BHK`} onClick={() => setF({ ...f, bhk_options: f.bhk_options.filter((_, j) => j !== i) })}><Trash2 className="size-4" /></Btn></div> })}</div>
            <p className="text-xs text-moss mt-3">Prices are shared as indicative ranges only. The assistant never quotes a final price or discount.</p>
          </Card>
          <Card className="p-5 grid md:grid-cols-2 gap-4">
            <Field label="Amenities" htmlFor="am" hint="One per line"><textarea id="am" rows={5} value={f.amenities} onChange={set('amenities')} className={TA} /></Field>
            <Field label="Location highlights" htmlFor="lh" hint="One per line. Only add distances you have verified."><textarea id="lh" rows={5} value={f.location_highlights} onChange={set('location_highlights')} className={TA} /></Field>
          </Card>
          <Card className="p-5">
            <div className="flex justify-between items-center mb-3"><h2 className="text-lg font-bold">Questions and answers</h2><Btn variant="ghost" onClick={() => setF({ ...f, faqs: [...f.faqs, { q: '', a: '' }] })}><Plus className="size-4" />Add question</Btn></div>
            {f.faqs.length === 0 && <p className="text-sm text-moss">No questions yet. Add the ones buyers ask most.</p>}
            <div className="flex flex-col gap-3">{f.faqs.map((x, i) => {
              const up = (k) => (e) => setF({ ...f, faqs: f.faqs.map((y, j) => (j === i ? { ...y, [k]: e.target.value } : y)) })
              return <div key={i} className="grid gap-2 md:grid-cols-[1fr_1.5fr_auto] items-start">
                <Input aria-label={`Question ${i + 1}`} placeholder="Question" value={x.q} onChange={up('q')} maxLength={300} /><Input aria-label={`Answer ${i + 1}`} placeholder="Answer" value={x.a} onChange={up('a')} maxLength={1000} />
                <Btn variant="danger" aria-label={`Remove question ${i + 1}`} onClick={() => setF({ ...f, faqs: f.faqs.filter((_, j) => j !== i) })}><Trash2 className="size-4" /></Btn></div> })}</div>
          </Card>
          <div className="fixed md:sticky bottom-16 md:bottom-4 inset-x-4 md:inset-x-0 z-10 bg-paper border border-line rounded-xl p-3 flex items-center gap-3 shadow-lg">
            <p role="status" className={`flex-1 text-sm ${msg?.ok === false ? 'text-brick' : 'text-ok'}`}>{msg?.text}</p>
            <Btn variant="accent" loading={saving} onClick={save}>Save changes</Btn>
          </div>
        </>
      )}
    </div>
  )
}
