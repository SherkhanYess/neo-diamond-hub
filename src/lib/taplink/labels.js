// Человекочитаемые подписи для кодов событий таплинка. Только данные.
export const TARGET_LABELS = {
  whatsapp_top: 'WhatsApp',
  catalog: 'Онлайн-каталог',
  route_almaty: 'Маршрут · Алматы',
  route_astana: 'Маршрут · Астана',
  rating_2gis: 'Рейтинг 2ГИС',
};

export const CITY_LABELS = {
  almaty: 'Алматы',
  astana: 'Астана',
  other: 'Другой город',
};

export const DEVICE_LABELS = {
  mobile: 'Моб.',
  desktop: 'Десктоп',
};

export function targetLabel(key) { return TARGET_LABELS[key] || key || '—'; }
export function cityLabel(key) { return CITY_LABELS[key] || key || '—'; }
export function deviceLabel(key) { return DEVICE_LABELS[key] || key || '—'; }

// Хост из referrer; пусто/битый → «Прямой / без источника».
export function sourceLabel(referrer) {
  if (!referrer) return 'Прямой / без источника';
  try {
    const h = new URL(referrer).hostname.replace(/^www\./, '');
    if (/instagram/.test(h)) return 'Instagram';
    return h;
  } catch { return 'Прямой / без источника'; }
}
