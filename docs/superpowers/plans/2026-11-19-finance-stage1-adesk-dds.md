# Финансы, этап 1: Adesk → ДДС по фондам — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** вкладка «Финансы → ДДС по фондам» на данных Adesk + привязка статей к фондам в «Настройках»; сентябрь 2026 сходится с эталоном ТЗ.

**Architecture:** Edge Function `adesk-sync` (pg_cron, 15 мин) копирует счета/статьи/сделки/операции Adesk в `adesk_*`. Справочник фондов и правил — `fin_*`. Чистые движки `src/lib/finance/classify.js` (операция → строка фонда) и `dds.js` (матрица дней) с тестами на выгрузке сентября. Страница `/finance` и раздел настроек читают таблицы через Supabase.

**Tech Stack:** Supabase (Postgres, RLS, pg_cron, Edge Functions на Deno), React 19 + Vite, Vitest.

Спека: `docs/superpowers/specs/2026-11-19-finance-design.md`.

---

## Карта файлов

| Файл | Ответственность |
|---|---|
| `supabase/migrations/0027_finance.sql` | таблицы `adesk_*`, `fin_funds`, `fin_items`, `fin_rules`, `fin_people`; право `finance`; RLS; строка `integrations('adesk')`; начальные фонды/строки/правила |
| `supabase/functions/_shared/adesk.js` (+ `.test.js`) | чистые функции: сумма в тенге, операция Adesk → строка таблицы, вид счёта (нал/безнал/фонд) |
| `supabase/functions/adesk-sync/index.ts` | синхронизация (только чтение Adesk) |
| `src/lib/finance/classify.js` (+ test) | операция → `{kind, direction, money, itemId, fundId, priorMonth, excluded}` |
| `src/lib/finance/dds.js` (+ test) | матрица ДДС месяца: остатки, поступления, фонды, курсовые, по дням |
| `src/lib/finance/fixtures/sep2026.json` | выгрузка сентября (обрезанные поля) для тестов |
| `src/lib/finance/fixtures/rules.js` | те же фонды/строки/правила, что в миграции, — для тестов |
| `src/lib/api/finance.js` | загрузка операций месяца, справочников, правил; запись привязок |
| `src/components/Finance/FinancePage.jsx`, `DdsTable.jsx`, `Finance.css` | страница и таблица ДДС |
| `src/components/Settings/FinanceRules.jsx` | привязка статей Adesk к фондам, люди и оклады |
| `src/lib/permissions.js`, `src/App.jsx`, `src/components/Settings/SettingsLayout.jsx` | право `finance`, пункт меню, маршрут, раздел настроек |

## Модель данных (миграция 0027)

```
adesk_accounts(id bigint pk, name, currency, kind text check in ('cash','bank','fund','other'),
               amount numeric, rate numeric, status, synced_at)
adesk_categories(id bigint pk, name, type int, group_name, archived bool, synced_at)
adesk_projects(id bigint pk, type text, name, category, act_date date, deal_amount numeric,
               archived bool, synced_at)
adesk_transactions(id bigint pk, date date, related_date date, type int, amount numeric,
               amount_kzt numeric, account_id bigint, category_id bigint, project_id bigint,
               is_transfer bool, transfer_id bigint, paired_id bigint, description text,
               contractor text, raw jsonb, synced_at)  -- index (date)
fin_funds(id uuid pk, key text unique, name, block text check in ('variable','management','fixed'),
          calc text, per_sale bool, sort int)
fin_items(id uuid pk, fund_id → fin_funds, key text unique, name, sort int)
fin_rules(id uuid pk, priority int, kind text check in
          ('exclude_project','account_no_category','category_description','category'),
          category_id bigint, account_id bigint, text_match text, item_id → fin_items null,
          note text)
fin_people(id uuid pk, name, match text[] , item_id → fin_items (строка оклада),
           oklad numeric, overflow_item_id → fin_items, categories bigint[] , active bool)
```

Правила применяются в `classify.js`; БД только хранит. RLS: чтение и запись — `has_cap('finance')`.

## Типы движков

```js
// classify.js
// rules = { funds, items, rules, people, accounts }  (как из БД; accounts: Map id → {kind,name})
// tx — строка adesk_transactions (поля как в таблице).
classify(tx, rules, ctx) → {
  kind: 'income' | 'refund' | 'acquiring' | 'expense' | 'transfer' | 'excluded',
  direction: 'orders' | 'stock' | 'other' | null,  // только income
  money: 'cash' | 'bank' | 'other' | null,          // только income
  itemId: string | null,                            // expense: строка фонда; null = «Не распределено»
  fundId: string | null,
  priorMonth: boolean,                              // related_date в прошлом месяце
  split?: [{ itemId, fundId, amount }],             // выплата человеку: оклад + сверх оклада
}
// ctx = { okladUsed: Map<personId|month, number> } — накопитель окладов в пределах месяца начисления.

// dds.js
buildDds({ month: 'YYYY-MM', txs, rules, opening }) → {
  days: ['2026-09-01', …],
  rows: [{ key, label, level, total, pctOfIncome, byDay: {date: amount}, items?: [...] }],
  totals: { incomeGross, incomeNet, cash, bank, acquiring, refunds, payments, net, fx, opening, closing },
  unassigned: [tx],
}
```

---

### Task 1: Миграция 0027 — таблицы, право, RLS, начальные справочники

**Files:** Create `supabase/migrations/0027_finance.sql`

- [ ] Step 1: Написать миграцию: таблицы из «Модели данных», индексы `adesk_transactions(date)`, `(project_id)`.
- [ ] Step 2: Право: `update roles set caps = array_append(caps,'finance') where is_system and not ('finance' = any(caps));`
- [ ] Step 3: RLS: `enable row level security`; политика `for all to authenticated using (has_cap('finance')) with check (has_cap('finance'))` на все `adesk_*` и `fin_*`.
- [ ] Step 4: `insert into integrations(key, config) values ('adesk', '{"since":"2026-08-01","window_days":60}') on conflict do nothing`.
- [ ] Step 5: Начальные фонды (порядок модели) и строки — из ТЗ и эталона; правила:
  - `exclude_project` text_match `Статуетка`;
  - `account_no_category` account 242480 → строка «Реклама»;
  - `category_description` «Аренда помещения» (576837) + `Астана` → «Аренда Астана»;
  - `category` для всех статей сентября (таблица в Task 1 Step 6).
- [ ] Step 6: Привязки статей (id Adesk → ключ строки):

| Статья Adesk | id | Строка |
|---|---|---|
| Налог на прибыль | 576828 | taxes.profit |
| Налог на фонд оплаты труда | 576829 | taxes.payroll |
| ФОТ: Отдел продаж | 1469548 | (люди) / fallback pct_sales.other |
| Доля от продаж | 1973048 | pct_sales.share |
| ФОТ: Отдел производства | 1578117 | (люди) |
| ФОТ: Отдел маркетинга | 1526858 | (люди) |
| Услуги специалистов | 583315 | (люди) |
| ФОТ: бухгалтерия | 1894479 | salaries.accountant |
| Закупка бриллиантов | 1469487 | purchases.diamonds |
| Расходы на золото | 1469520 | purchases.gold |
| Работа цеха | 1469519 | purchases.workshop |
| Расходы на украшение | 2071687 | purchases.dubai |
| Закупка украшений | 1698914 | purchases.stock |
| Упаковка для украшений | 1469532 | purchases.packaging |
| Закупка упаковки | 1524768 | purchases.packaging |
| Сервис | 1469526 | purchases.service |
| Курьер | 1469494 | transport.courier |
| Карго доставка | 1469493 | transport.cargo |
| Вывод дивидендов | 1469486 | dividends.dividends |
| Вывод прибыли | 576823 | dividends.profit |
| Благотворительность | 1931519 | dividends.charity |
| Консалтинг | 1845108 | development.consulting |
| Ремонт | 1957848 | development.repair |
| Реклама | 1469525 | ads.ads |
| Модель | 1693720 | ads.model |
| Услуги видеографа | 1693718 | ads.video |
| Аренда студии | 1683546 | ads.studio |
| Аренда помещения | 576837 | rent.almaty |
| ТМЦ для офиса | 1822120 | utilities.office |
| Интернет | 583290 | other.internet |
| Подписка на amoCRM | 1469498 | other.amocrm |
| Подписка Kelesu | 1999786 | other.kelesu |
| Битрикс CRM | 1524522 | other.bitrix |
| Подписка на Meta | 1624656 | other.meta |
| Подписка Claude | 1931536 | other.claude |
| Подписка на Wazzup | 1562754 | other.wazzup |
| Комиссия банка | 576832 | other.bank |
| Сдача | 1469550 | other.change |

  Особые статьи, не строки фондов: «Комиссия за Pay» 583226 → эквайринг; «Возврат денег клиенту (не расход)» 2071983 → возврат; «Перевод между счетами» → перевод.
- [ ] Step 7: Люди (`fin_people`): Данеля, Алмас, Аблай (ФОТ: Отдел продаж, оклад 300 000, сверх → pct_sales.bonus_<имя>); Наргиза (ФОТ: Отдел производства, 400 000, сверх → piece.kpi_nargiza); Айсултан (ФОТ: Отдел маркетинга, 450 000, сверх → piece.kpi_marketing); Аружан (ФОТ: Отдел маркетинга, 200 000, сверх → piece.kpi_marketing); Дизайнер (ФОТ: Отдел маркетинга, 200 000); Мухамед (Услуги специалистов, match `Yourmarketolog`, 500 000); Гаухар (ТикТок, 300 000).
- [ ] Step 8: Применить: `python3 ~/.config/neo-diamond-hub/sbq.py -f supabase/migrations/0027_finance.sql`; проверить `select count(*) from fin_items` > 0.
- [ ] Step 9: Commit `feat(finance): миграция 0027 — Adesk, фонды, правила, право finance`.

### Task 2: `_shared/adesk.js` — нормализация операций (TDD)

**Files:** Create `supabase/functions/_shared/adesk.js`, `supabase/functions/_shared/adesk.test.js`

- [ ] Step 1: Тесты:
```js
import { describe, it, expect } from 'vitest'
import { amountKzt, txRow, accountKind } from './adesk.js'
const usd = { id: 1, type: 2, amount: '377.72', exchangeRate: 439.39414, dateIso: '2026-09-30', relatedDateIso: '2026-09-30',
  bankAccount: { id: 242480, currency: 'USD' }, category: { id: 1469525, name: 'Реклама' }, isTransfer: false }
describe('adesk', () => {
  it('тенге: KZT как есть, валюта × курс операции', () => {
    expect(amountKzt({ ...usd, bankAccount: { currency: 'KZT' } })).toBe(377.72)
    expect(amountKzt(usd)).toBeCloseTo(377.72 * 439.39414, 2)
  })
  it('строка таблицы', () => {
    expect(txRow(usd)).toMatchObject({ id: 1, date: '2026-09-30', related_date: '2026-09-30', type: 2, account_id: 242480, category_id: 1469525, is_transfer: false })
  })
  it('вид счёта по названию', () => {
    expect(accountKind('Наличные (тенге)')).toBe('cash'); expect(accountKind('Цифровая наличка')).toBe('cash')
    expect(accountKind('Kaspi Pay')).toBe('bank'); expect(accountKind('Online Bank (тенге)')).toBe('bank')
    expect(accountKind('Фонд маркетинга (долларовый счет)')).toBe('fund')
  })
})
```
- [ ] Step 2: `npx vitest run supabase/functions/_shared/adesk.test.js` — FAIL.
- [ ] Step 3: Реализация (`amountKzt` = amount для KZT, иначе amount × exchangeRate (если нет — bankAccount.rate), округление до 0,01; `txRow` — поля таблицы + `raw`; `accountKind` — регулярки «налич», «kaspi|online bank», «фонд»).
- [ ] Step 4: PASS. Step 5: Commit.

### Task 3: Edge Function `adesk-sync`

**Files:** Create `supabase/functions/adesk-sync/index.ts`

- [ ] Step 1: Заголовок `x-sync-key` = SYNC_KEY (как meta-sync). Тело `{mode:'incremental'}` | `{mode:'range', from, to}`.
- [ ] Step 2: Справочники: `bank-accounts`, `transactions/categories`, `projects?length=1000` — upsert (вид счёта из `accountKind`, если у строки ещё нет ручного вида — колонка `kind_by_hand`).
- [ ] Step 3: Операции окна (incremental: сегодня − `window_days` … сегодня + 31) по месяцам, `length=1000`; upsert; удалить строки окна, которых нет в ответе. Только `isPlanned=false`.
- [ ] Step 4: `integrations.last_run_at`, `last_error`. Секрет `ADESK_TOKEN` через Management API.
- [ ] Step 5: Деплой `deploy_fn.py adesk-sync`; запуск `{mode:'range',from:'2026-08-01',to:'<сегодня>'}`; проверить `select count(*) from adesk_transactions where date between '2026-09-01' and '2026-09-30'` = 401.
- [ ] Step 6: pg_cron `*/15 * * * *` (ключ из `~/.config/neo-diamond-hub/sync_key`, не в репо). Commit.

### Task 4: `classify.js` (TDD)

**Files:** Create `src/lib/finance/classify.js`, `src/lib/finance/classify.test.js`, `src/lib/finance/fixtures/rules.js`

Порядок правил: исключённый проект → перевод → эквайринг → возврат → поступление (направление по типу сделки: `deal` → orders, `product_deal` → stock, иначе other; деньги по виду счёта) → люди (статья из `categories` человека, совпадение имени в описании или контрагенте; оклад месяца начисления исчерпывается, остаток → `overflow_item_id`) → счёт без статьи → статья + текст → статья → «Не распределено». `priorMonth` = месяц `related_date` < месяца `date`.

- [ ] Step 1: Тесты (по одному на правило): статуэтка → excluded; перевод → transfer; «Комиссия за Pay» → acquiring; возврат → refund; поступление по сделке `deal` на Kaspi → `{income, orders, bank}`; Данеля 1 075 380 → split 300 000 оклад + 775 380 бонус; Айсултан 720 000 (начисление 31.08) → 450 000 + 270 000, и 100 000 (начисление 30.09) → 100 000 оклад; расход без статьи с 242480 → Реклама; «Аренда помещения» + «Астана» → Аренда Астана, без «Астана» → Алматы; неизвестная статья → itemId null; дивиденды 19.09 с начислением 31.08 → priorMonth true.
- [ ] Step 2: FAIL. Step 3: реализация. Step 4: PASS. Step 5: Commit.

### Task 5: Выгрузка сентября и `dds.js` (TDD, сверка с эталоном)

**Files:** Create `src/lib/finance/fixtures/sep2026.json`, `src/lib/finance/dds.js`, `src/lib/finance/dds.test.js`

- [ ] Step 1: Сохранить 401 операцию сентября через `txRow` без `raw` (скрипт в scratchpad, не в репо).
- [ ] Step 2: Тест эталона:
```js
const d = buildDds({ month: '2026-09', txs, rules, opening: 19872188.03 })
expect(Math.round(d.totals.incomeGross)).toBe(50189574)      // без статуэтки
expect(Math.round(d.totals.cash)).toBe(27473574)
expect(Math.round(d.totals.bank)).toBe(22716000)
expect(Math.round(d.totals.payments + d.totals.acquiring + d.totals.refunds)).toBe(59324471)
expect(Math.abs(d.totals.net + d.totals.fx - -9170575)).toBeLessThan(15)
expect(d.unassigned.map((t) => t.id)).toEqual([])               // всё сентябрьское разнесено
```
  и строк: Реклама ≈ 5 249 744; Аренда Алматы 1 500 000, Астана 400 000; бонус Данели 775 380.
- [ ] Step 3: FAIL. Step 4: реализация (группировка по дням, проценты от поступлений, курсовые = сумма тенге по паре переводов (вход − выход), остатки по дням от `opening`). Step 5: PASS. Commit.

### Task 6: Остаток на начало месяца

**Files:** Modify `src/lib/finance/dds.js` (+ test), Create `src/lib/api/finance.js`

- [ ] Step 1: `openingFor(month, accounts, txsSinceMonthStart)` = Σ текущих остатков счетов (тенге по `rate` счёта) − Σ влияния операций с начала месяца до сегодня (поступление +, расход −, переводы обеими ногами). Тест на синтетике: два счёта, перевод, расход.
- [ ] Step 2: `finance.js`: `loadFinanceRules()`, `loadMonthTxs(month)`, `loadOpening(month)`, `saveCategoryRule(categoryId, itemId)`, `savePerson(...)`.
- [ ] Step 3: Сверка: остаток на 01.09 по данным = 19 872 188 ± 15. Commit.

### Task 7: Право и навигация

**Files:** Modify `src/lib/permissions.js`, `src/App.jsx`, `src/components/Settings/SettingsLayout.jsx`

- [ ] Step 1: CAPS += `{ key: 'finance', label: 'Финансы' }`; MENU_ITEMS после «Планирования» += `{ key: 'finance', label: 'Финансы', path: '/finance', cap: 'finance' }`.
- [ ] Step 2: Маршрут `/finance` (`requireCap="finance"`); `/settings` — `requireCap={['settings','finance']}`; в SettingsLayout у пунктов поле `cap` (по умолчанию `settings`), меню фильтруется по правам; группа «Финансы» → «Привязка статей к фондам» (`cap: 'finance'`).
- [ ] Step 3: Тест permissions: пользователь только с `finance` видит «Финансы» и раздел привязки, не видит остальные настройки. Commit.

### Task 8: Страница «ДДС по фондам»

**Files:** Create `src/components/Finance/FinancePage.jsx`, `DdsTable.jsx`, `Finance.css`

- [ ] Step 1: Выбор месяца (стрелки, по умолчанию текущий), загрузка через `finance.js`, `buildDds`.
- [ ] Step 2: Таблица: первая колонка закреплена (статья), затем «Итог месяца», «% от поступлений», дни с днём недели; блоки сворачиваются (фонд → строки); «Не распределено» — строка-ссылка в настройки; метка «за прошлый месяц» у сумм с `priorMonth` (точка + подсказка); клик по сумме — список операций (дата, счёт, статья, описание, сумма).
- [ ] Step 3: Оформление по `src/styles/tokens.css` (брендбук), мобильная ширина — горизонтальная прокрутка таблицы внутри блока.
- [ ] Step 4: Проверка в превью `hub-dev`: сентябрь — итоги как в эталоне. Commit.

### Task 9: «Привязка статей к фондам» в Настройках

**Files:** Create `src/components/Settings/FinanceRules.jsx`

- [ ] Step 1: Таблица статей Adesk: название, тип (доход/расход), операций за 60 дней, фонд → строка (выпадающий список), сохранение сразу. Непривязанные с операциями — сверху и подсвечены.
- [ ] Step 2: Блок «Люди и оклады»: имя, совпадение (имена/контрагент), статьи, оклад, строка оклада, куда сверх оклада.
- [ ] Step 3: Блок «Особые правила» (список, удаление/добавление: исключённый проект, счёт без статьи, статья + текст).
- [ ] Step 4: Блок «Счета»: вид (нал / безнал / фонд), правка вручную. Commit.

### Task 10: Деплой и показ

- [ ] `npm test` — всё зелёное; `deploy.sh` (одним деплоем, кредиты Netlify); проверить на проде сентябрь и ноябрь; показать владельцу; обновить память.
