# Neo Diamond Taplink — Фаза 2: дашборд «Таплинк» в neo-diamond-hub (план реализации)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить в `neo-diamond-hub` страницу «Таплинк» — дашборд аналитики таплинка (`link.neodiamond.kz`): просмотры, клики по кнопкам, выбор города, конверсия, устройства, источники, динамика по дням.

**Architecture:** Данные из таблицы `public.taplink_events` (Фаза 1) читаются авторизованным пользователем хаба через существующий `supabase` клиент (RLS: `select` разрешён роли `authenticated`). Тонкий data-слой `src/lib/api/taplink.js` тянет строки за период; чистый модуль `src/lib/taplink/aggregate.js` считает метрики (покрыт юнит-тестами). Страница `src/components/Taplink/TaplinkPage.jsx` рисует карточки в стиле существующего `Dashboard` (классы `dash__*`, inline-SVG `ProgressRing`, новый компактный `BarList`). Пункт меню и роут добавляются по тем же паттернам, что и остальные разделы.

**Tech Stack:** React 19 + react-router-dom, @supabase/supabase-js, vitest. Токены брендбука из `src/styles` (как в остальном хабе).

**Зависимость:** Фаза 1 задеплоена, таблица `taplink_events` существует и копит данные.

---

## Структура файлов

```
neo-diamond-hub/
├── src/lib/api/taplink.js                 # (new) загрузка событий за период из Supabase
├── src/lib/taplink/aggregate.js           # (new) чистые агрегаторы метрик
├── src/lib/taplink/aggregate.test.js      # (new) юнит-тесты агрегаторов
├── src/lib/taplink/labels.js              # (new) карты человекочитаемых подписей
├── src/components/Taplink/TaplinkPage.jsx # (new) страница-дашборд
├── src/components/Taplink/TaplinkCharts.jsx # (new) BarList (одно-рядный бар-виджет)
├── src/components/Taplink/Taplink.css     # (new) стили бар-листа и мелочей
├── src/lib/permissions.js                 # (modify) +пункт меню «Таплинк»
├── src/components/Shell/Sidebar.jsx       # (modify) +иконка 'taplink'
└── src/App.jsx                            # (modify) +роут /taplink
```

Ответственность:
- `api/taplink.js` — только запрос к Supabase, без логики агрегации.
- `taplink/aggregate.js` — чистые функции (вход: массив строк, выход: готовые метрики), тестируемые без сети.
- `taplink/labels.js` — только словари подписей (данные).
- `TaplinkCharts.jsx` — презентационный `BarList`, без данных.
- `TaplinkPage.jsx` — склейка: грузит, агрегирует, рисует карточки; состояния loading/empty.

Метрики (определения, чтобы не разъехалось):
- **views** — число событий `page_view`.
- **viewers** — число уникальных `session_id` среди `page_view`.
- **clicks** — число событий `click`.
- **clickers** — число уникальных `session_id`, у которых есть хотя бы один `click`.
- **conversion** — `clickers / viewers` (0..1); если viewers=0 → 0.
- **byTarget** — счётчик `click` по `target`, по убыванию.
- **byCity** — счётчик `city_select` по `city` (almaty/astana/other).
- **byDevice** — счётчик `page_view` по `device`.
- **bySource** — счётчик `page_view` по хосту `referrer` (пусто → «Прямой / без источника»).
- **byDay** — по дням (локальная дата): `{ date, views, clicks }`, по возрастанию.

---

## Task 1: Карты подписей (labels)

**Files:** Create `src/lib/taplink/labels.js`; Test covered via aggregate tests (labels are plain data).

- [ ] **Step 1: Создать `src/lib/taplink/labels.js`:**
```js
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
```

- [ ] **Step 2: Commit**
```bash
git add src/lib/taplink/labels.js
git commit -m "feat(taplink): label maps for dashboard"
```

---

## Task 2: Агрегаторы метрик (TDD)

**Files:** Create `src/lib/taplink/aggregate.js`; Test `src/lib/taplink/aggregate.test.js`

- [ ] **Step 1: Написать падающий тест** — create `src/lib/taplink/aggregate.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { aggregate } from './aggregate';

const row = (o) => ({ event_type: 'page_view', target: null, city: null, device: 'mobile', referrer: null, utm: null, session_id: 's1', created_at: '2026-10-10T08:00:00Z', ...o });

const sample = [
  row({ session_id: 'a', event_type: 'page_view', device: 'mobile', referrer: 'https://instagram.com/' }),
  row({ session_id: 'a', event_type: 'click', target: 'whatsapp_top' }),
  row({ session_id: 'a', event_type: 'city_select', target: 'almaty', city: 'almaty' }),
  row({ session_id: 'b', event_type: 'page_view', device: 'desktop', referrer: '' }),
  row({ session_id: 'b', event_type: 'click', target: 'catalog' }),
  row({ session_id: 'c', event_type: 'page_view', device: 'mobile', referrer: 'https://instagram.com/' }),
  // c посмотрел, но не кликал
];

describe('aggregate', () => {
  it('считает просмотры, зрителей, клики, кликеров, конверсию', () => {
    const a = aggregate(sample);
    expect(a.views).toBe(3);
    expect(a.viewers).toBe(3);     // a, b, c
    expect(a.clicks).toBe(2);
    expect(a.clickers).toBe(2);    // a, b
    expect(a.conversion).toBeCloseTo(2 / 3, 5);
  });

  it('клики по кнопкам — с подписями и счётчиками', () => {
    const a = aggregate(sample);
    expect(a.byTarget.map((t) => t.key).sort()).toEqual(['catalog', 'whatsapp_top']);
    expect(a.byTarget.every((t) => t.count === 1)).toBe(true);
    const wa = a.byTarget.find((t) => t.key === 'whatsapp_top');
    expect(wa.label).toBe('WhatsApp');
  });

  it('byTarget отсортирован по убыванию count', () => {
    const rows = [
      row({ session_id: 'x', event_type: 'click', target: 'catalog' }),
      row({ session_id: 'y', event_type: 'click', target: 'catalog' }),
      row({ session_id: 'z', event_type: 'click', target: 'whatsapp_top' }),
    ];
    const a = aggregate(rows);
    expect(a.byTarget[0]).toEqual({ key: 'catalog', label: 'Онлайн-каталог', count: 2 });
  });

  it('города из city_select', () => {
    const a = aggregate(sample);
    expect(a.byCity).toEqual([{ key: 'almaty', label: 'Алматы', count: 1 }]);
  });

  it('устройства из page_view', () => {
    const a = aggregate(sample);
    const m = Object.fromEntries(a.byDevice.map((d) => [d.key, d.count]));
    expect(m.mobile).toBe(2);
    expect(m.desktop).toBe(1);
  });

  it('источники: instagram и прямой', () => {
    const a = aggregate(sample);
    const m = Object.fromEntries(a.bySource.map((s) => [s.label, s.count]));
    expect(m['Instagram']).toBe(2);
    expect(m['Прямой / без источника']).toBe(1);
  });

  it('по дням: просмотры и клики', () => {
    const a = aggregate(sample);
    const day = a.byDay.find((d) => d.views > 0);
    expect(day.views).toBe(3);
    expect(day.clicks).toBe(2);
  });

  it('пустой вход не падает', () => {
    const a = aggregate([]);
    expect(a.views).toBe(0);
    expect(a.conversion).toBe(0);
    expect(a.byTarget).toEqual([]);
  });
});
```

- [ ] **Step 2: Запустить — упасть** — `npx vitest run src/lib/taplink/aggregate.test.js` → не резолвится `./aggregate`.

- [ ] **Step 3: Реализовать `src/lib/taplink/aggregate.js`:**
```js
import { targetLabel, cityLabel, deviceLabel, sourceLabel } from './labels';

function countBy(rows, keyFn, labelFn) {
  const m = new Map();
  for (const r of rows) {
    const key = keyFn(r);
    if (key == null || key === '') continue;
    m.set(key, (m.get(key) || 0) + 1);
  }
  return [...m.entries()]
    .map(([key, count]) => ({ key, label: labelFn(key), count }))
    .sort((a, b) => b.count - a.count);
}

function dayKey(iso) {
  const d = new Date(iso);
  // локальная дата YYYY-MM-DD
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function aggregate(rows = []) {
  const pageViews = rows.filter((r) => r.event_type === 'page_view');
  const clicks = rows.filter((r) => r.event_type === 'click');
  const citySelects = rows.filter((r) => r.event_type === 'city_select');

  const viewers = new Set(pageViews.map((r) => r.session_id).filter(Boolean)).size;
  const clickers = new Set(clicks.map((r) => r.session_id).filter(Boolean)).size;

  // источники: группировка по подписи (instagram/host/прямой)
  const bySourceMap = new Map();
  for (const r of pageViews) {
    const label = sourceLabel(r.referrer);
    bySourceMap.set(label, (bySourceMap.get(label) || 0) + 1);
  }
  const bySource = [...bySourceMap.entries()]
    .map(([label, count]) => ({ key: label, label, count }))
    .sort((a, b) => b.count - a.count);

  // по дням
  const byDayMap = new Map();
  for (const r of rows) {
    if (r.event_type !== 'page_view' && r.event_type !== 'click') continue;
    const k = dayKey(r.created_at);
    const cur = byDayMap.get(k) || { date: k, views: 0, clicks: 0 };
    if (r.event_type === 'page_view') cur.views += 1;
    else cur.clicks += 1;
    byDayMap.set(k, cur);
  }
  const byDay = [...byDayMap.values()].sort((a, b) => a.date.localeCompare(b.date));

  return {
    views: pageViews.length,
    viewers,
    clicks: clicks.length,
    clickers,
    conversion: viewers ? clickers / viewers : 0,
    byTarget: countBy(clicks, (r) => r.target, targetLabel),
    byCity: countBy(citySelects, (r) => r.city, cityLabel),
    byDevice: countBy(pageViews, (r) => r.device, deviceLabel),
    bySource,
    byDay,
  };
}
```

- [ ] **Step 4: Запустить — пройти** — `npx vitest run src/lib/taplink/aggregate.test.js`.

- [ ] **Step 5: Прогнать весь набор хаба** — `npm test` → остаётся зелёным.

- [ ] **Step 6: Commit**
```bash
git add src/lib/taplink/aggregate.js src/lib/taplink/aggregate.test.js
git commit -m "feat(taplink): metric aggregators with tests"
```

---

## Task 3: Data-слой — загрузка событий

**Files:** Create `src/lib/api/taplink.js`

- [ ] **Step 1: Создать `src/lib/api/taplink.js`:**
```js
import { supabase } from '../supabaseClient';

// Загружает события таплинка за последние sinceDays дней.
// RLS: select разрешён роли authenticated — читает авторизованный пользователь хаба.
export async function loadTaplinkEvents({ sinceDays = 30 } = {}) {
  const since = new Date(Date.now() - sinceDays * 86400000).toISOString();
  const { data, error } = await supabase
    .from('taplink_events')
    .select('event_type,target,city,device,referrer,utm,session_id,created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(50000);
  if (error) throw error;
  return data || [];
}
```

- [ ] **Step 2: Commit**
```bash
git add src/lib/api/taplink.js
git commit -m "feat(taplink): supabase data loader for events"
```

---

## Task 4: Виджет BarList

**Files:** Create `src/components/Taplink/TaplinkCharts.jsx`, `src/components/Taplink/Taplink.css`

- [ ] **Step 1: Создать `src/components/Taplink/TaplinkCharts.jsx`:**
```jsx
// Одно-рядный горизонтальный бар-лист (один ряд значений).
export function BarList({ items }) {
  if (!items || items.length === 0) return <p className="dash__empty">Нет данных</p>;
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div className="tl-bars">
      {items.map((i) => (
        <div className="tl-bars__row" key={i.key}>
          <span className="tl-bars__label">{i.label}</span>
          <div className="tl-bars__track">
            <span className="tl-bars__bar" style={{ width: `${(i.count / max) * 100}%` }} />
          </div>
          <span className="tl-bars__val mono">{i.count}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Создать `src/components/Taplink/Taplink.css`:**
```css
.tl-bars { display: flex; flex-direction: column; gap: 10px; margin-top: 8px; }
.tl-bars__row { display: grid; grid-template-columns: 120px 1fr auto; align-items: center; gap: 10px; }
.tl-bars__label { color: var(--ink-600); font-size: 13px; }
.tl-bars__track { position: relative; height: 10px; background: var(--paper-200); border-radius: 50px; overflow: hidden; }
.tl-bars__bar { position: absolute; left: 0; top: 0; height: 100%; background: var(--ink-800); border-radius: 50px; }
.tl-bars__val { color: var(--ink-800); font-size: 13px; min-width: 2ch; text-align: right; }
.tl-day { display: flex; align-items: flex-end; gap: 4px; height: 90px; margin-top: 8px; }
.tl-day__col { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 4px; }
.tl-day__bar { width: 70%; background: var(--ink-800); border-radius: 4px 4px 0 0; min-height: 2px; }
.tl-day__lbl { font-size: 10px; color: var(--ink-400); }
```

- [ ] **Step 3: Commit**
```bash
git add src/components/Taplink/TaplinkCharts.jsx src/components/Taplink/Taplink.css
git commit -m "feat(taplink): BarList widget and styles"
```

---

## Task 5: Страница-дашборд

**Files:** Create `src/components/Taplink/TaplinkPage.jsx`

- [ ] **Step 1: Создать `src/components/Taplink/TaplinkPage.jsx`:**
```jsx
import { useState, useEffect, useMemo } from 'react';
import { loadTaplinkEvents } from '../../lib/api/taplink';
import { aggregate } from '../../lib/taplink/aggregate';
import { num1, pct1 } from '../../lib/format';
import { ProgressRing } from '../Dashboard/Charts';
import { BarList } from './TaplinkCharts';
import '../Dashboard/Dashboard.css';
import './Taplink.css';

const PERIODS = [
  { days: 7, label: '7 дней' },
  { days: 30, label: '30 дней' },
  { days: 90, label: '90 дней' },
];

export default function TaplinkPage() {
  const [sinceDays, setSinceDays] = useState(30);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadTaplinkEvents({ sinceDays })
      .then((r) => { if (alive) { setRows(r); setError(null); } })
      .catch((e) => { if (alive) setError(e.message || 'Ошибка загрузки'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [sinceDays]);

  const a = useMemo(() => aggregate(rows), [rows]);
  const maxDay = Math.max(1, ...a.byDay.map((d) => d.views));

  if (loading) return <p style={{ color: 'var(--ink-400)' }}>Загрузка…</p>;
  if (error) return <p style={{ color: 'var(--ink-400)' }}>Не удалось загрузить: {error}</p>;

  return (
    <div className="dash">
      <div className="dash__controls">
        <select className="select" value={sinceDays} onChange={(e) => setSinceDays(Number(e.target.value))}>
          {PERIODS.map((p) => (<option key={p.days} value={p.days}>{p.label}</option>))}
        </select>
        <span className="dash__month">link.neodiamond.kz</span>
      </div>

      <div className="dash__grid">
        {/* Просмотры */}
        <div className="dash__card dash__card--split">
          <div>
            <span className="eyebrow">Просмотры</span>
            <div className="dash__big mono">{num1(a.views)}</div>
            <div className="dash__row"><span>Уникальных</span><b className="mono">{num1(a.viewers)}</b></div>
            <div className="dash__row"><span>Кликов</span><b className="mono">{num1(a.clicks)}</b></div>
          </div>
          <ProgressRing pct={a.conversion * 100} label="в клик" />
        </div>

        {/* Клики по кнопкам */}
        <div className="dash__card">
          <span className="eyebrow">Клики по кнопкам</span>
          <BarList items={a.byTarget} />
        </div>

        {/* Города */}
        <div className="dash__card">
          <span className="eyebrow">Выбор города (WhatsApp)</span>
          <BarList items={a.byCity} />
        </div>

        {/* Устройства */}
        <div className="dash__card">
          <span className="eyebrow">Устройства</span>
          <BarList items={a.byDevice} />
        </div>

        {/* Источники */}
        <div className="dash__card">
          <span className="eyebrow">Источники</span>
          <BarList items={a.bySource} />
        </div>

        {/* По дням */}
        <div className="dash__card dash__card--wide">
          <span className="eyebrow">Просмотры по дням</span>
          {a.byDay.length === 0 ? (
            <p className="dash__empty">Нет данных</p>
          ) : (
            <div className="tl-day">
              {a.byDay.map((d) => (
                <div className="tl-day__col" key={d.date}>
                  <span className="tl-day__bar" style={{ height: `${(d.views / maxDay) * 100}%` }} title={`${d.date}: ${d.views} просм., ${d.clicks} кл.`} />
                  <span className="tl-day__lbl">{d.date.slice(5)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Прогнать тесты** — `npm test` → зелёный.

- [ ] **Step 3: Commit**
```bash
git add src/components/Taplink/TaplinkPage.jsx
git commit -m "feat(taplink): dashboard page"
```

---

## Task 6: Меню, иконка, роут

**Files:** Modify `src/lib/permissions.js`, `src/components/Shell/Sidebar.jsx`, `src/App.jsx`

- [ ] **Step 1: Пункт меню.** В `src/lib/permissions.js`, в массив `MENU_ITEMS`, после строки с `key: 'sales'` добавить:
```js
  { key: 'taplink', label: 'Таплинк', path: '/taplink', cap: 'view_reports' },
```

- [ ] **Step 2: Иконка.** В `src/components/Shell/Sidebar.jsx`, в объект `ICONS`, добавить ключ (без эмодзи, геометрический глиф):
```js
  taplink: '◇',
```

- [ ] **Step 3: Роут.** В `src/App.jsx`:
  - добавить импорт рядом с другими страницами:
```js
import TaplinkPage from './components/Taplink/TaplinkPage'
```
  - добавить роут внутри защищённого layout, после блока `/sales`:
```jsx
              <Route
                path="/taplink"
                element={
                  <ProtectedRoute requireCap="view_reports">
                    <TaplinkPage />
                  </ProtectedRoute>
                }
              />
```

- [ ] **Step 4: Прогнать тесты** — `npm test` (в т.ч. `permissions.test.js`). Если `permissions.test.js` жёстко проверяет длину/состав `MENU_ITEMS` — обновить ожидание в тесте, добавив пункт `taplink` (прочитать тест и поправить ассерт под новый пункт; не удалять существующие проверки).

- [ ] **Step 5: Commit**
```bash
git add src/lib/permissions.js src/components/Shell/Sidebar.jsx src/App.jsx
git commit -m "feat(taplink): menu item, icon, and route"
```

---

## Task 7: Проверка в браузере (с временными тестовыми данными)

**Files:** —

- [ ] **Step 1: Засеять небольшой демонабор событий** (чтобы дашборд было что показать), помечая их узнаваемым `session_id`-префиксом `demo_` и `path='/__demo'`, чтобы потом точечно удалить. Вставка идёт как anon (REST), по аналогии с проверкой Фазы 1 — несколько `page_view` (разные устройства/referrer/дни), `click` по разным `target`, `city_select` по городам. (Контроллер делает это скриптом через anon-ключ; не коммитить демо-скрипт в репозиторий хаба.)

- [ ] **Step 2: Поднять дев-сервер хаба и войти.** `preview_start` name для `neo-diamond-hub` (если в `.claude/launch.json` нет записи — создать: `npm run dev`, порт Vite 5173). Войти владельцем (email/пароль из `~/neo-diamond-hub/.supabase-credentials.txt`). Открыть пункт меню «Таплинк».

- [ ] **Step 3: Проверить дашборд:** период 7/30/90 переключается; карточки «Просмотры»+кольцо конверсии, «Клики по кнопкам», «Города», «Устройства», «Источники», «Просмотры по дням» показывают засеянные данные; подписи человекочитаемые; стиль совпадает с остальным хабом (брендбук). Консоль без ошибок (`read_console_messages`). Скриншот для подтверждения.

- [ ] **Step 4: Удалить демоданные** (контроллер): `delete from public.taplink_events where session_id like 'demo_%' or path='/__demo'`. Проверить, что боевых строк это не задело.

---

## Task 8: Финал

- [ ] **Step 1: Полный прогон тестов** — `npm test` зелёный.
- [ ] **Step 2: Редеплой хаба — по согласованию с владельцем.** Хаб деплоится вручную (локальный `npm run build` → ZIP в Netlify API сайта `neo-diamond-hub`, токен в `~/Library/Preferences/netlify/config.json`), автосборки на пуш нет. Это живой внутренний инструмент — редеплой выполняется только после явного «ок» владельца. До редеплоя дашборд доступен локально.

---

## Готово по Фазе 2

Дашборд «Таплинк» в хабе: просмотры/зрители/клики/конверсия, клики по кнопкам, города, устройства, источники, динамика по дням — на живых данных из `taplink_events`, в стиле брендбука.
