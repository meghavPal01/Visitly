const BASE = import.meta.env.VITE_API_BASE_URL || ''
const KEYS = { staff: 'visitly.staff', buyer: 'visitly.buyer' }

export class ApiError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code }
}

export const session = {
  get: (kind) => { try { return JSON.parse(localStorage.getItem(KEYS[kind])) } catch { return null } },
  set: (kind, v) => localStorage.setItem(KEYS[kind], JSON.stringify(v)),
  clear: (kind) => localStorage.removeItem(KEYS[kind]),
}

function readError(data, status) {
  const d = data?.detail
  if (typeof d === 'string') return [d, undefined]
  if (Array.isArray(d)) return [d[0]?.msg?.replace(/^Value error, /, '') || 'Check the highlighted fields', 'validation']
  if (d?.message) return [d.message, d.code]
  if (status === 429) return ['Too many messages in this chat. A salesperson will take it from here.', 'limit']
  return ['Something went wrong. Try again in a moment.', undefined]
}

export async function api(path, { method = 'GET', body, kind = 'staff', signal } = {}) {
  const tok = session.get(kind)?.token
  let res
  try {
    res = await fetch(BASE + path, {
      method, signal,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (e) {
    if (e.name === 'AbortError') throw e
    throw new ApiError('Can’t reach the server. Check your connection and try again.', 0)
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    if (res.status === 401 && tok) { session.clear(kind); if (kind === 'staff') window.location.assign('/staff') }
    const [msg, code] = readError(data, res.status)
    throw new ApiError(msg, res.status, code)
  }
  return data
}
