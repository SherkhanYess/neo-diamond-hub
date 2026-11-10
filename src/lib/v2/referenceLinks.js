// Справочник: готовые ссылки WhatsApp с кодом обращения для профилей Instagram.
//
// Код в конце сообщения распознаёт вебхук amocrm-hook (_shared/inquiry.js):
// [N·ib] — Neo Diamond, шапка профиля; [T·is] — taena, сторис и т. д.

export const SHOWROOMS = [
  { city: 'Алматы', phone: '77766708505', slug: 'a' },
  { city: 'Астана', phone: '77776908505', slug: 's' },
]

// Instagram не принимает длинную ссылку wa.me с текстом, поэтому в bio и
// сторис ставятся официальные короткие ссылки WhatsApp (wa.me/message/…).
// Их создают в WhatsApp Manager → номер → «QR-коды и короткие ссылки»,
// текст — с кодом. Созданные ссылки записываются сюда: ключ бренд-вход-город.
export const OFFICIAL_LINKS = {
  'N-ib-a': {
    url: 'https://wa.me/message/QPTCPWFIIOSSJ1',
    text: 'Здравствуйте, хочу получить каталог и обсудить украшение! Код обращения - [N·ib]',
  },
  'T-ib-a': {
    url: 'https://wa.me/message/LRSSKRO3FST6C1',
    text: 'Здравствуйте! Хочу узнать про кольца и записаться на живой показ. [T·ib]',
  },
}

export const PROFILE_PLACEMENTS = [
  { entry: 'ib', label: 'Шапка профиля (bio)', text: 'Здравствуйте! Хотим узнать про кольца.' },
  { entry: 'is', label: 'Сторис', text: 'Здравствуйте! Увидели в сторис, хотим узнать подробнее.' },
]

export const PROFILE_BRANDS = [
  { letter: 'N', name: 'Neo Diamond' },
  { letter: 'T', name: 'taena' },
]

export const profileCode = (letter, entry) => `[${letter}·${entry}]`
export const profileMessage = (letter, placement) => `${placement.text} ${profileCode(letter, placement.entry)}`
export const waLink = (phone, text) => `https://wa.me/${phone}?text=${encodeURIComponent(text)}`

/** Все ссылки профиля: бренд → размещение → шоурум. */
export function profileLinks() {
  return PROFILE_BRANDS.map((b) => ({
    ...b,
    placements: PROFILE_PLACEMENTS.map((p) => {
      const message = profileMessage(b.letter, p)
      return {
        ...p,
        code: profileCode(b.letter, p.entry),
        message,
        links: SHOWROOMS.map((s) => {
          const official = OFFICIAL_LINKS[`${b.letter}-${p.entry}-${s.slug}`] ?? null
          return { ...s, url: waLink(s.phone, message), official }
        }),
      }
    }),
  }))
}

/** Расшифровка того, что вебхук оставляет в поле «Код обращения». */
export const CODE_LEGEND = [
  { code: '[ad·1202…]', meaning: 'Реклама сразу в WhatsApp (номер объявления от Kelesu)', result: 'Instagram → Реклама → WhatsApp' },
  { code: '[T·ia:51l97-ПР·m]', meaning: 'Сайт taena: вход · объявление (5 знаков) · тип · страница', result: 'Источник по входу → Сайт-каталог' },
  { code: '[N·ib] / [T·is]', meaning: 'Ссылка из профиля сразу в чат', result: 'Instagram → Профиль (bio, сторис)' },
  { code: '[К-ПР·…] / [П-ОБ]', meaning: 'Старый код сайта taena', result: 'Instagram / без источника → Сайт-каталог' },
  { code: '[2ГИС]', meaning: '«Пишу из приложения 2ГИС»', result: '2ГИС → Карточка 2ГИС' },
  { code: '[Директ]', meaning: 'Сообщение в Директ без кода', result: 'Instagram → Профиль (bio, сторис)' },
  { code: '[WhatsApp]', meaning: 'WhatsApp без кода (код стёрли)', result: 'Без источника → WhatsApp' },
]

export const SITE_PARTS = {
  entries: [
    ['ib', 'Instagram, bio'],
    ['is', 'Instagram, сторис'],
    ['ip', 'Instagram, пост / reels'],
    ['ia', 'Instagram, реклама'],
    ['tb', 'TikTok, профиль'],
    ['ta', 'TikTok, реклама'],
    ['gs', '2ГИС → сайт'],
    ['wm', 'менеджер прислал ссылку'],
    ['ht', 'ссылка-намёк'],
    ['sh', 'поделились'],
    ['dd', 'прямой заход'],
    ['xx', 'другие метки'],
  ],
  types: [
    ['ОБ', 'узнать стоимость'],
    ['ПР', 'примерка'],
    ['ПД', 'подбор'],
    ['НМ', 'намёк'],
    ['ИД', 'свой дизайн'],
  ],
  pages: [
    ['f', 'лента'],
    ['m', 'модель'],
    ['g', 'гид'],
    ['o', 'прочее'],
  ],
}
