// Обращение из текста первого сообщения: код → конвертер и UTM.
//
// Salesbot amoCRM записывает текст первого сообщения дня в поле «Код обращения»
// (424891). Функция amocrm-hook разбирает его этим модулем, оставляет в поле
// только код и заполняет UTM-поля сделки — дальше источник и конвертер считает
// общее правило хаба (resolve_utm). Полный текст нигде не хранится.
//
// Порядок правил — от самого точного признака к общему:
//   1. ad_id от Kelesu («📢 Лид с рекламы … ad_id: 1202…») → Реклама → WhatsApp
//   2. код сайта taena v2            [T·ib-ОБ·g], [T·ia:7fq2m-ПР·m]
//   3. код профиля                   [T·ib], [N·is]
//   4. старый код сайта taena        [К-ПР·vitrina], [П-ОБ]
//   5. текст 2ГИС                    «Пишу из приложения 2ГИС»
//   6. Директ без кода               канал instagram_business
//   7. остальное                     WhatsApp без источника
// Формат кодов — docs/tz/2026-11-11-taena-lead-code-v2.md.

/** Тип обращения в коде → ключ. */
export const TYPES = { ОБ: 'price', ПР: 'fitting', ПД: 'help', НМ: 'hint', ИД: 'custom' }

/** Страница сайта, с которой нажали WhatsApp. */
export const PAGES = { f: 'feed', m: 'model', g: 'guide', o: 'other' }

/** Откуда человек пришёл (на сайт или сразу в чат). */
export const ENTRIES = {
  ib: { source: 'instagram', medium: 'bio', label: 'Instagram · bio' },
  is: { source: 'instagram', medium: 'stories', label: 'Instagram · сторис' },
  ip: { source: 'instagram', medium: 'post', label: 'Instagram · пост / reels' },
  ia: { source: 'instagram', medium: 'cpc', label: 'Instagram · реклама' },
  tb: { source: 'tiktok', medium: 'bio', label: 'TikTok · профиль' },
  ta: { source: 'tiktok', medium: 'cpc', label: 'TikTok · реклама' },
  gs: { source: '2gis', medium: 'card', label: '2ГИС · карточка' },
  wm: { source: 'none', medium: 'manager', label: 'Менеджер прислал ссылку в чате' },
  ht: { source: 'none', medium: 'hint', label: 'Ссылка-намёк' },
  sh: { source: 'none', medium: 'share', label: 'Поделились ссылкой' },
  dd: { source: 'none', medium: 'direct', label: 'Прямой заход' },
  xx: { source: 'none', medium: 'other', label: 'Другие метки' },
}

const BRANDS = { T: 'taena', N: 'neodiamond' }
const OLD_ENTRY = { К: 'ia', П: 'ip', Г: 'dd', С: 'dd' }

const TYPE_RE = '(ОБ|ПР|ПД|НМ|ИД)'
// [T·ib-ОБ·g] / [T·ia:7fq2m-ПР·m] / [T·ib]. Разделитель «·», допускаем «.».
const V2_RE = new RegExp(`\\[([TN])[·.]([a-z]{2})(?::([0-9a-z]{5}))?(?:-${TYPE_RE}[·.]([fmgo]))?\\]`)
const OLD_RE = new RegExp(`\\[([КПГС])-${TYPE_RE}(?:·([^\\]\\s]{1,60}))?\\]`)
const AD_RE = /(?:ad_id\s*[:=]?\s*|\[ad·)(\d{6,})/i
const GIS_RE = /2\s*(гис|gis)/i

/** Короткий номер объявления: 5 знаков base36 из номера Meta. */
export function adShort(adId) {
  if (!/^\d{6,}$/.test(String(adId ?? ''))) return null
  return (BigInt(adId) % 60466176n).toString(36).padStart(5, '0')
}

/** Канал по origin сообщения amoCRM. */
export function channelOf(origin) {
  const o = String(origin ?? '')
  if (o.startsWith('instagram')) return 'direct'
  if (o) return 'whatsapp'
  return null
}

/**
 * Разбор текста. Возвращает код для поля amoCRM, вид обращения и UTM.
 * @param {string} text   текст первого сообщения (или уже код)
 * @param {string|null} channel  'whatsapp' | 'direct' | null
 */
export function parseInquiry(text, channel = null) {
  const s = String(text ?? '')
  const base = { brand: null, entry: null, type: null, page: null, adId: null, adShort: null }

  const ad = s.match(AD_RE)
  if (ad) {
    return {
      ...base,
      kind: 'ctwa',
      code: `[ad·${ad[1]}]`,
      adId: ad[1],
      adShort: adShort(ad[1]),
      utm: { utm_source: 'instagram', utm_medium: 'ctwa', utm_term: ad[1] },
    }
  }

  const v2 = s.match(V2_RE)
  if (v2 && ENTRIES[v2[2]]) {
    const [code, b, entry, short, typeCode, page] = v2
    const e = ENTRIES[entry]
    if (!typeCode) {
      // Код профиля: ссылка из bio / сторис сразу в чат, без сайта.
      return {
        ...base,
        kind: 'profile',
        code,
        brand: BRANDS[b],
        entry,
        utm: { utm_source: e.source, utm_medium: e.medium, utm_content: 'wa' },
      }
    }
    return {
      ...base,
      kind: 'site',
      code,
      brand: BRANDS[b],
      entry,
      type: TYPES[typeCode],
      page: PAGES[page],
      adShort: short ?? null,
      utm: {
        utm_source: e.source,
        utm_medium: 'site',
        utm_campaign: PAGES[page],
        utm_content: entry,
        ...(short ? { utm_term: short } : {}),
      },
    }
  }

  const old = s.match(OLD_RE)
  if (old) {
    const [code, letter, typeCode, campaign] = old
    const entry = OLD_ENTRY[letter]
    return {
      ...base,
      kind: 'site',
      code,
      brand: 'taena',
      entry,
      type: TYPES[typeCode],
      page: letter === 'Г' ? 'guide' : null,
      utm: {
        utm_source: ENTRIES[entry].source,
        utm_medium: 'site',
        utm_content: entry,
        ...(campaign ? { utm_campaign: campaign } : {}),
      },
    }
  }

  if (GIS_RE.test(s)) {
    return { ...base, kind: '2gis', code: '[2ГИС]', entry: 'gs', utm: { utm_source: '2gis', utm_medium: 'card' } }
  }

  if (channel === 'direct') {
    return { ...base, kind: 'direct', code: '[Директ]', utm: { utm_source: 'instagram', utm_medium: 'direct' } }
  }

  return { ...base, kind: 'none', code: '[WhatsApp]', utm: { utm_source: 'none', utm_medium: 'whatsapp' } }
}

/** Сколько живёт «новая» сделка: слабый признак старше этого — ответ в разговоре. */
export const NEW_LEAD_SECONDS = 2 * 86400

/** Нет кода: канал без кода считает сам инфоцентр по событиям чатов, в amoCRM не пишем. */
export const isWeak = (kind) => kind === 'none' || kind === 'direct'

/**
 * Можно ли по этому обращению ставить источник сделке в amoCRM.
 * Только код, ad_id и 2ГИС (человек пришёл по ссылке). Без кода — никогда:
 * конвертер по каналу ставит синхронизация в инфоцентре.
 */
export function attributable(kind) {
  return !isWeak(kind)
}

/** Поле уже содержит только код (наша же запись) — разбирать повторно не нужно. */
export function isCodeOnly(value) {
  const v = String(value ?? '').trim()
  if (!/^\[[^\]]+\]$/.test(v)) return false
  return parseInquiry(v, null).code === v || v === '[Директ]'
}
