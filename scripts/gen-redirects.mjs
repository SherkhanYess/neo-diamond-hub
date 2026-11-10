// Пишет public/_redirects: короткие ссылки профиля → WhatsApp, затем SPA.
// Запуск: node scripts/gen-redirects.mjs (после правки src/lib/v2/referenceLinks.js).
import { writeFileSync } from 'node:fs'
import { profileLinks } from '../src/lib/v2/referenceLinks.js'

export function redirectsText() {
  const lines = ['# Короткие ссылки профиля (генерируется scripts/gen-redirects.mjs)']
  for (const b of profileLinks()) for (const p of b.placements) for (const l of p.links) lines.push(`${l.path}  ${l.url}  302`)
  lines.push('', '/*    /index.html   200', '')
  return lines.join('\n')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(new URL('../public/_redirects', import.meta.url), redirectsText())
  console.log('public/_redirects updated')
}
