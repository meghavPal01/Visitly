import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, session } from './api'

const reply = (status, body) => vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body })
afterEach(() => vi.unstubAllGlobals())

describe('api error mapping', () => {
  it('uses a string detail as the message', async () => {
    vi.stubGlobal('fetch', reply(404, { detail: 'Project not found' }))
    await expect(api('/x')).rejects.toMatchObject({ message: 'Project not found', status: 404 })
  })
  it('turns a validation list into a readable message', async () => {
    vi.stubGlobal('fetch', reply(422, { detail: [{ msg: 'Value error, Enter a valid 10-digit Indian mobile number' }] }))
    await expect(api('/x')).rejects.toMatchObject({ message: 'Enter a valid 10-digit Indian mobile number', code: 'validation' })
  })
  it('keeps the retry-after style message for throttled logins', async () => {
    vi.stubGlobal('fetch', reply(429, { detail: 'Too many attempts. Try again in 5 minutes.' }))
    await expect(api('/x')).rejects.toMatchObject({ status: 429, message: expect.stringContaining('Too many attempts') })
  })
  it('falls back to a friendly message for unknown errors', async () => {
    vi.stubGlobal('fetch', reply(500, null))
    await expect(api('/x')).rejects.toMatchObject({ message: expect.stringContaining('Something went wrong') })
  })
  it('reports network failure as status 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('failed')))
    const err = await api('/x').catch((e) => e)
    expect(err).toBeInstanceOf(ApiError); expect(err.status).toBe(0)
  })
  it('sends the token for the requested session kind only', async () => {
    session.set('buyer', { token: 'b-token' })
    const f = reply(200, {}); vi.stubGlobal('fetch', f)
    await api('/y', { kind: 'buyer' })
    expect(f.mock.calls[0][1].headers.Authorization).toBe('Bearer b-token')
    await api('/y')
    expect(f.mock.calls[1][1].headers.Authorization).toBeUndefined()
  })
  it('clears a buyer session on 401', async () => {
    session.set('buyer', { token: 'old' })
    vi.stubGlobal('fetch', reply(401, { detail: 'Invalid token' }))
    await api('/z', { kind: 'buyer' }).catch(() => {})
    expect(session.get('buyer')).toBeNull()
  })
})
