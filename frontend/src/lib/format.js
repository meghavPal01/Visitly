const TZ = 'Asia/Kolkata'
export const fmtDate = (iso) => new Intl.DateTimeFormat('en-IN', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso))
export const fmtTime = (iso) => new Intl.DateTimeFormat('en-IN', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso)).toUpperCase()
export const fmtDateTime = (iso) => `${fmtDate(iso)}, ${fmtTime(iso)}`
export const fmtFullDate = (iso) => new Intl.DateTimeFormat('en-IN', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso))
export const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`)
export const inr = (v) => (v == null ? '—' : v >= 1e7 ? `₹${(v / 1e7).toFixed(1)} Cr` : v >= 1e5 ? `₹${(v / 1e5).toFixed(1)} L` : `₹${Math.round(v).toLocaleString('en-IN')}`)
export function duration(sec) {
  if (sec == null) return '—'
  if (sec < 90) return `${Math.round(sec)} sec`
  if (sec < 3600) return `${(sec / 60).toFixed(1)} min`
  return `${(sec / 3600).toFixed(1)} hr`
}
export const ymd = (d) => { const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d); return p }
export const statusLabel = (s) => ({ new: 'New', contacted: 'Contacted', visit_booked: 'Visit booked', visited: 'Visited', negotiation: 'Negotiation', won: 'Won', lost: 'Lost' }[s] || s)
export const sourceLabel = (s) => ({ portal: 'Property portal', social: 'Social media', website: 'Website', hoarding: 'Hoarding' }[s] || s)

/** Change versus the previous period. kind 'ratio' compares fractions in percentage points; others compare relatively. */
export function delta(cur, prev, { lowerIsBetter = false, kind = 'count' } = {}) {
  if (cur == null || prev == null) return null
  let diff, label
  if (kind === 'ratio') { diff = (cur - prev) * 100; label = `${Math.abs(Math.round(diff))} pts` }
  else { if (prev === 0) return null; diff = ((cur - prev) / prev) * 100; label = `${Math.abs(Math.round(diff))}%` }
  if (Math.round(Math.abs(diff)) === 0) return { dir: 'flat', label: 'no change', good: null }
  const up = diff > 0
  return { dir: up ? 'up' : 'down', label, good: lowerIsBetter ? !up : up }
}
