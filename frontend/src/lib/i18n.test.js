import { describe, expect, it } from 'vitest'
import { LANGS, T } from './i18n'

describe('translations', () => {
  const keys = (o) => Object.keys(o).sort()
  it('has an entry for every language option', () => { LANGS.forEach((l) => expect(T[l.code]).toBeDefined()) })
  it('has the same keys in every language', () => { LANGS.forEach((l) => expect(keys(T[l.code])).toEqual(keys(T.en))) })
  it('keeps list lengths aligned across languages', () => {
    LANGS.forEach((l) => ['chips', 'chipsBooked', 'chipsOpen'].forEach((k) => expect(T[l.code][k]).toHaveLength(T.en[k].length)))
  })
  it('interpolates names in greetings and the staff banner', () => {
    LANGS.forEach((l) => { expect(T[l.code].greet('Meera')).toContain('Meera'); expect(T[l.code].chatting('Ravi')).toContain('Ravi') })
  })
})
