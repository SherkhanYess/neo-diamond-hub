import { describe, it, expect } from 'vitest'
import { profileLinks } from './referenceLinks'
import { parseInquiry } from '../../../supabase/functions/_shared/inquiry.js'

describe('profileLinks', () => {
  const all = profileLinks()

  it('2 бренда × 2 размещения × 2 шоурума', () => {
    expect(all).toHaveLength(2)
    expect(all.flatMap((b) => b.placements.flatMap((p) => p.links))).toHaveLength(8)
  })

  it('короткие ссылки есть в public/_redirects и ведут на ту же длинную', async () => {
    const { readFileSync } = await import('node:fs')
    const { redirectsText } = await import('../../../scripts/gen-redirects.mjs')
    const file = readFileSync(`${process.cwd()}/public/_redirects`, 'utf8')
    expect(file).toBe(redirectsText())
    for (const b of all) for (const p of b.placements) for (const l of p.links) expect(file).toContain(`${l.path}  ${l.url}  302`)
    expect(file.trim().endsWith('/*    /index.html   200')).toBe(true)
    expect(all[0].placements[0].links[0].short.length).toBeLessThan(50)
  })

  it('каждая ссылка несёт код, который понимает вебхук', () => {
    for (const b of all)
      for (const p of b.placements)
        for (const l of p.links) {
          const text = decodeURIComponent(new URL(l.url).searchParams.get('text'))
          const r = parseInquiry(text, 'whatsapp')
          expect(r.kind).toBe('profile')
          expect(r.entry).toBe(p.entry)
          expect(r.brand).toBe(b.letter === 'T' ? 'taena' : 'neodiamond')
        }
  })
})
