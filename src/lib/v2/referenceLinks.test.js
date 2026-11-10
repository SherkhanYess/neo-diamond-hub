import { describe, it, expect } from 'vitest'
import { profileLinks, OFFICIAL_LINKS } from './referenceLinks'
import { parseInquiry } from '../../../supabase/functions/_shared/inquiry.js'

describe('profileLinks', () => {
  const all = profileLinks()

  it('2 бренда × 2 размещения × единый лид-центр', () => {
    expect(all).toHaveLength(2)
    expect(all.flatMap((b) => b.placements.flatMap((p) => p.links))).toHaveLength(4)
  })

  it('каждый текст несёт код, который понимает вебхук', () => {
    for (const b of all)
      for (const p of b.placements)
        for (const l of p.links) {
          const r = parseInquiry(p.message, 'whatsapp')
          expect(r.kind).toBe('profile')
          expect(r.entry).toBe(p.entry)
          expect(r.brand).toBe(b.letter === 'T' ? 'taena' : 'neodiamond')
          expect(l.url.startsWith(`https://wa.me/${l.phone}?text=`)).toBe(true)
        }
  })

  it('официальные короткие ссылки: код в тексте совпадает с ключом', () => {
    for (const [key, o] of Object.entries(OFFICIAL_LINKS)) {
      const [letter, entry] = key.split('-')
      expect(o.url).toMatch(/^https:\/\/wa\.me\/message\/[A-Z0-9]+$/)
      const r = parseInquiry(o.text, 'whatsapp')
      expect(r).toMatchObject({ kind: 'profile', entry, brand: letter === 'T' ? 'taena' : 'neodiamond' })
    }
    expect(all[1].placements[0].links[0].official?.url).toBe('https://wa.me/message/LRSSKRO3FST6C1')
  })
})
