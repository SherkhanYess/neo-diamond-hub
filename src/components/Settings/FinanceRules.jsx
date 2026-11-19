import { useEffect, useMemo, useState } from 'react'
import {
  loadFinanceRefs,
  loadCategoryUsage,
  saveCategoryRule,
  saveRule,
  deleteRule,
  savePerson,
  deletePerson,
  saveAccountKind,
} from '../../lib/api/finance'
import { SPECIAL } from '../../lib/finance/classify'
import { money } from '../../lib/format'
import '../Finance/Finance.css'
import './FinanceRules.css'

const KIND_LABEL = { cash: 'нал', bank: 'безнал', fund: 'фондовый счёт', other: 'прочее' }
const RULE_LABEL = {
  exclude_project: 'Исключить сделку/проект',
  account_no_category: 'Расход без статьи со счёта',
  category_description: 'Статья + слово в описании',
}

// «Настройки → Привязка статей к фондам». Новую статью Adesk привязываешь один раз —
// дальше её операции сами попадают в фонд (ДДС, план-факт). Право — «Финансы».
export default function FinanceRules() {
  const [refs, setRefs] = useState(null)
  const [usage, setUsage] = useState(new Map())
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const reload = () =>
    Promise.all([loadFinanceRefs(), loadCategoryUsage()])
      .then(([r, u]) => {
        setRefs(r)
        setUsage(u)
      })
      .catch((e) => setError(e.message))
  useEffect(() => {
    reload()
  }, [])

  const run = async (fn) => {
    setBusy(true)
    try {
      await fn()
      await reload()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const options = useMemo(() => {
    if (!refs) return []
    return refs.raw.funds.map((f) => ({ fund: f, items: refs.raw.items.filter((i) => i.fund_id === f.id) }))
  }, [refs])

  if (error) return <div className="v2__banner">{error}</div>
  if (!refs) return <div className="fin__loading">Загружаю…</div>

  const { raw, R } = refs
  const special = new Set([...SPECIAL.acquiring, ...SPECIAL.refund])
  const peopleCats = new Set(raw.people.flatMap((p) => p.categories ?? []).map(Number))
  const cats = raw.categories
    .filter((c) => !c.archived && !/перевод между счетами/i.test(c.name))
    .map((c) => ({ ...c, used: usage.get(Number(c.id)) ?? 0, itemId: R.byCategory.get(Number(c.id)) ?? null }))
    .sort((a, b) => {
      const loose = (c) => c.type === 2 && !c.itemId && c.used && !special.has(Number(c.id)) && !peopleCats.has(Number(c.id))
      const ua = loose(a) ? 0 : 1
      const ub = loose(b) ? 0 : 1
      return ua - ub || b.used - a.used || a.name.localeCompare(b.name)
    })

  const ItemSelect = ({ value, onChange, empty = '— не распределено —' }) => (
    <select value={value ?? ''} disabled={busy} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{empty}</option>
      {options.map(({ fund, items }) => (
        <optgroup key={fund.id} label={fund.name}>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )

  return (
    <div className="finr">
      <p className="finr__intro">
        Операции Adesk попадают в фонды по этим правилам. Статья без фонда видна в ДДС строкой «Не распределено». Порядок: исключения → люди и
        оклады → особые правила → статья.
      </p>

      <h3>Статьи Adesk</h3>
      <div className="finr__table">
        <table>
          <thead>
            <tr>
              <th>Статья</th>
              <th>Операций за 60 дней</th>
              <th>Фонд → строка</th>
            </tr>
          </thead>
          <tbody>
            {cats.map((c) => {
              const isSpecial = special.has(Number(c.id))
              const byPeople = peopleCats.has(Number(c.id))
              const warn = c.type === 2 && !c.itemId && c.used && !isSpecial && !byPeople
              return (
                <tr key={c.id} className={warn ? 'is-warn' : ''}>
                  <td>
                    {c.name}
                    <small>
                      {c.type === 1 ? 'доход' : 'расход'}
                      {c.group_name ? ` · ${c.group_name}` : ''}
                      {peopleCats.has(Number(c.id)) ? ' · сначала делится по людям' : ''}
                    </small>
                  </td>
                  <td className="finr__num">{c.used || ''}</td>
                  <td>
                    {c.type === 1 ? (
                      <span className="finr__muted">поступление: заказ / из наличия — по сделке Adesk</span>
                    ) : isSpecial ? (
                      <span className="finr__muted">{SPECIAL.acquiring.includes(Number(c.id)) ? 'эквайринг — вычитается из поступлений' : 'возврат — уменьшает поступления'}</span>
                    ) : (
                      <ItemSelect
                        value={c.itemId}
                        empty={byPeople ? '— по людям; кого не узнали — не распределено —' : '— не распределено —'}
                        onChange={(v) => run(() => saveCategoryRule(Number(c.id), v))}
                      />
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <h3>Люди и оклады</h3>
      <p className="finr__hint">
        Выплата человеку по его статьям: до оклада за месяц начисления — в оклады, сверх оклада — в выбранный фонд (бонусы, KPI). Совпадение — по
        имени в описании операции или контрагенту.
      </p>
      <div className="finr__table">
        <table>
          <thead>
            <tr>
              <th>Человек</th>
              <th>Совпадение</th>
              <th>Оклад</th>
              <th>Строка оклада</th>
              <th>Сверх оклада</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {raw.people.map((p) => (
              <PersonRow key={p.id} p={p} busy={busy} ItemSelect={ItemSelect} categories={raw.categories} run={run} />
            ))}
            <tr>
              <td colSpan={6}>
                <button className="finr__add" disabled={busy} onClick={() => run(() => savePerson({ name: 'Новый сотрудник', match: [], categories: [], oklad: 0 }))}>
                  + человек
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>Особые правила</h3>
      <div className="finr__table">
        <table>
          <tbody>
            {raw.rules
              .filter((r) => r.kind !== 'category')
              .map((r) => (
                <tr key={r.id}>
                  <td>{RULE_LABEL[r.kind]}</td>
                  <td>
                    {r.kind === 'account_no_category'
                      ? raw.accounts.find((a) => Number(a.id) === Number(r.account_id))?.name
                      : r.kind === 'category_description'
                        ? `${raw.categories.find((c) => Number(c.id) === Number(r.category_id))?.name ?? '?'} + «${r.text_match}»`
                        : `«${r.text_match}»`}
                  </td>
                  <td>{r.kind === 'exclude_project' ? <span className="finr__muted">не считается нигде</span> : raw.items.find((i) => i.id === r.item_id)?.name}</td>
                  <td>
                    <button className="finr__del" disabled={busy} onClick={() => run(() => deleteRule(r.id))} aria-label="Удалить правило">
                      ×
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <NewRule raw={raw} busy={busy} ItemSelect={ItemSelect} onSave={(rule) => run(() => saveRule(rule))} />

      <h3>Счета</h3>
      <div className="finr__table">
        <table>
          <tbody>
            {raw.accounts.map((a) => (
              <tr key={a.id}>
                <td>
                  {a.name}
                  <small>
                    {a.currency} · остаток {a.currency === 'KZT' ? money(a.amount) : `${Number(a.amount).toLocaleString('ru-RU')} ${a.currency}`}
                    {a.status === 'closed' ? ' · закрыт' : ''}
                  </small>
                </td>
                <td>
                  <select value={a.kind} disabled={busy} onChange={(e) => run(() => saveAccountKind(a.id, e.target.value))}>
                    {Object.entries(KIND_LABEL).map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PersonRow({ p, busy, ItemSelect, categories, run }) {
  const [name, setName] = useState(p.name)
  const [match, setMatch] = useState((p.match ?? []).join(', '))
  const [oklad, setOklad] = useState(String(p.oklad ?? 0))
  const save = (patch) => run(() => savePerson({ id: p.id, ...patch }))
  const cats = (p.categories ?? []).map((id) => categories.find((c) => Number(c.id) === Number(id))?.name).filter(Boolean)
  return (
    <tr>
      <td>
        <input value={name} disabled={busy} onChange={(e) => setName(e.target.value)} onBlur={() => name !== p.name && save({ name })} />
        <small>{cats.join(', ') || 'статьи не выбраны'}</small>
      </td>
      <td>
        <input
          value={match}
          disabled={busy}
          placeholder="имя, контрагент"
          onChange={(e) => setMatch(e.target.value)}
          onBlur={() => save({ match: match.split(',').map((s) => s.trim()).filter(Boolean) })}
        />
      </td>
      <td>
        <input className="finr__money" inputMode="numeric" value={oklad} disabled={busy} onChange={(e) => setOklad(e.target.value.replace(/\D/g, ''))} onBlur={() => Number(oklad) !== Number(p.oklad) && save({ oklad: Number(oklad) || 0 })} />
      </td>
      <td>
        <ItemSelect value={p.item_id} empty="—" onChange={(v) => save({ item_id: v })} />
      </td>
      <td>
        <ItemSelect value={p.overflow_item_id} empty="всё в оклад" onChange={(v) => save({ overflow_item_id: v })} />
      </td>
      <td>
        <CategoryPicker p={p} categories={categories} busy={busy} onSave={(ids) => save({ categories: ids })} />
        <button className="finr__del" disabled={busy} onClick={() => run(() => deletePerson(p.id))} aria-label="Удалить">
          ×
        </button>
      </td>
    </tr>
  )
}

function CategoryPicker({ p, categories, busy, onSave }) {
  const expense = categories.filter((c) => c.type === 2 && !c.archived)
  return (
    <select
      className="finr__cat"
      value=""
      disabled={busy}
      title="Добавить или убрать статью"
      onChange={(e) => {
        const id = Number(e.target.value)
        const have = (p.categories ?? []).map(Number)
        onSave(have.includes(id) ? have.filter((x) => x !== id) : [...have, id])
      }}
    >
      <option value="">статьи…</option>
      {expense.map((c) => (
        <option key={c.id} value={c.id}>
          {(p.categories ?? []).map(Number).includes(Number(c.id)) ? '✓ ' : ''}
          {c.name}
        </option>
      ))}
    </select>
  )
}

function NewRule({ raw, busy, ItemSelect, onSave }) {
  const [kind, setKind] = useState('category_description')
  const [categoryId, setCategoryId] = useState('')
  const [accountId, setAccountId] = useState('')
  const [text, setText] = useState('')
  const [itemId, setItemId] = useState(null)
  const ok = kind === 'exclude_project' ? text : kind === 'account_no_category' ? accountId && itemId : categoryId && text && itemId
  return (
    <div className="finr__new">
      <select value={kind} onChange={(e) => setKind(e.target.value)}>
        {Object.entries(RULE_LABEL).map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </select>
      {kind === 'category_description' && (
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">статья…</option>
          {raw.categories.filter((c) => c.type === 2).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
      {kind === 'account_no_category' && (
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">счёт…</option>
          {raw.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      )}
      {kind !== 'account_no_category' && (
        <input value={text} placeholder={kind === 'exclude_project' ? 'слово в названии сделки' : 'слово в описании'} onChange={(e) => setText(e.target.value)} />
      )}
      {kind !== 'exclude_project' && <ItemSelect value={itemId} empty="строка фонда…" onChange={setItemId} />}
      <button
        className="finr__add"
        disabled={busy || !ok}
        onClick={() =>
          onSave({
            kind,
            priority: kind === 'exclude_project' ? 1 : kind === 'account_no_category' ? 10 : 20,
            category_id: kind === 'category_description' ? Number(categoryId) : null,
            account_id: kind === 'account_no_category' ? Number(accountId) : null,
            text_match: kind === 'account_no_category' ? null : text,
            item_id: kind === 'exclude_project' ? null : itemId,
          })
        }
      >
        + правило
      </button>
    </div>
  )
}
