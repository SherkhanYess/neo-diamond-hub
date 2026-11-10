import { Fragment, useState, useEffect, useCallback, useMemo } from 'react'
import { useSession } from '../../context/SessionContext'
import { useBrand } from '../../context/BrandContext'
import { useToast } from '../common/Toast'
import EmptyState from '../common/EmptyState'
import PlanLifecycle, { GapList } from './PlanLifecycle'
import { loadKindPlan, createKindDraft, saveConverterLine, approveKindPlan, newKindVersion, copyKindFromPrevious } from '../../lib/api/plansV2'
import { loadCommercePlans } from '../../lib/v2/loaders'
import { listRef } from '../../lib/api/references'
import { commerceBySource, marketingGaps } from '../../lib/v2/reconcile'
import { fmtValue } from '../v2/PlanFactTree'

const FIELDS = [
  { key: 'budget', label: 'Бюджет, ₸', fmt: 'money' },
  { key: 'leads', label: 'Лиды', fmt: 'int' },
  { key: 'quals', label: 'Квал-лиды', fmt: 'int' },
]

// Маркетинг: план источника (из Коммерции) раскладывается по конвертерам.
export default function MarketingPlan({ month }) {
  const { profile, caps } = useSession()
  const { brandFilter, currentBrand } = useBrand()
  const toast = useToast()
  const actorId = profile?.id
  const canEdit = caps.includes('edit_plan')
  const canApprove = caps.includes('approve_plan')

  const [bundle, setBundle] = useState(null)
  const [lines, setLines] = useState({})
  const [commerce, setCommerce] = useState([])
  const [sources, setSources] = useState([])
  const [converters, setConverters] = useState([])
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!brandFilter) return
    setLoading(true)
    const [b, c, s, conv] = await Promise.all([
      loadKindPlan('marketing', month, brandFilter),
      loadCommercePlans(month, { brandId: brandFilter }),
      listRef('demand_sources', { brandId: brandFilter }),
      listRef('converters', { brandId: brandFilter }),
    ])
    setBundle(b)
    setLines(Object.fromEntries((b?.lines ?? []).map((l) => [l.converter_id, l])))
    setCommerce(c)
    setSources(s)
    setConverters(conv)
    setLoading(false)
  }, [month, brandFilter])

  useEffect(() => {
    load()
  }, [load])

  const top = useMemo(() => commerceBySource(commerce), [commerce])
  const lineList = useMemo(() => Object.values(lines), [lines])
  const gaps = useMemo(
    () => marketingGaps({ commercePlans: commerce, lines: lineList, converters, sources }),
    [commerce, lineList, converters, sources]
  )

  if (!brandFilter) {
    return <EmptyState title="Выберите бренд" description="План маркетинга ставится по бренду — переключите бренд в шапке." />
  }
  if (loading) return <p style={{ color: 'var(--ink-400)' }}>Загрузка…</p>

  const readOnly = !bundle || bundle.plan.status === 'approved' || !canEdit
  const setField = (convId, key, value) =>
    setLines((ls) => ({ ...ls, [convId]: { converter_id: convId, budget: 0, leads: 0, quals: 0, ...ls[convId], [key]: value } }))
  const persist = async (convId) => {
    const l = lines[convId]
    if (!l || !bundle) return
    await saveConverterLine(bundle.plan.id, convId, {
      budget: Number(l.budget) || 0,
      leads: Number(l.leads) || 0,
      quals: Number(l.quals) || 0,
    })
  }

  const run = (fn, msg) => async (...a) => {
    setBusy(true)
    try {
      await fn(...a)
      await load()
      if (msg) toast.show({ message: msg })
    } catch (e) {
      toast.show({ message: e.message })
    } finally {
      setBusy(false)
    }
  }

  const grouped = sources
    .map((s) => ({ source: s, convs: converters.filter((c) => c.demand_source_id === s.id) }))
    .filter((g) => g.convs.length || top.get(g.source.id))
  const total = FIELDS.reduce((acc, f) => ({ ...acc, [f.key]: lineList.reduce((a, l) => a + (Number(l[f.key]) || 0), 0) }), {})
  const commerceBudget = [...top.values()].reduce((a, t) => a + t.budget, 0)

  return (
    <div>
      <div className="plan__levelbar">
        <span className="plan__levelhint">
          {currentBrand?.name} · бюджет из Коммерции: <b className="mono">{fmtValue('money', commerceBudget)}</b>
          {commerce.length === 0 && ' (план коммерции не утверждён)'}
        </span>
        <PlanLifecycle
          bundle={bundle}
          canEdit={canEdit}
          canApprove={canApprove}
          busy={busy}
          gaps={gaps}
          summary={[
            { label: 'Бюджет конвертеров', value: total.budget, fmt: 'money' },
            { label: 'Лиды', value: total.leads, fmt: 'int' },
            { label: 'Квал-лиды', value: total.quals, fmt: 'int' },
          ]}
          onCreate={run(() => createKindDraft('marketing', month, brandFilter, actorId), 'Черновик создан.')}
          onCopy={run(() => copyKindFromPrevious('marketing', month, brandFilter, actorId), 'Скопирован план прошлого месяца.')}
          onApprove={run((reason) => approveKindPlan(bundle.plan, actorId, reason), 'План маркетинга утверждён.')}
          onNewVersion={run(() => newKindVersion('marketing', month, brandFilter, actorId), 'Создана новая версия — внесите правки и утвердите.')}
        />
      </div>

      <GapList gaps={gaps} title="Конвертеры ↔ Коммерция" />

      {bundle && (
        <div className="rep__table-wrap">
          <table className="rep__table plan__table">
            <thead>
              <tr>
                <th className="plan__sticky-col">Источник / конвертер</th>
                <th>Из Коммерции: бюджет</th>
                {FIELDS.map((f) => (
                  <th key={f.key}>{f.label}</th>
                ))}
                <th>Цена квала</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(({ source, convs }) => {
                const t = top.get(source.id)
                const sub = FIELDS.reduce((acc, f) => ({ ...acc, [f.key]: convs.reduce((a, c) => a + (Number(lines[c.id]?.[f.key]) || 0), 0) }), {})
                const bad = gaps.some((g) => g.source_id === source.id)
                return (
                  <Fragment key={source.id}>
                    <tr className="plan__task-row">
                      <td className="plan__sticky-col plan__task-name">{source.name}</td>
                      <td className="plan__num mono">{t ? fmtValue('money', t.budget) : '—'}</td>
                      {FIELDS.map((f) => (
                        <td key={f.key} className={`plan__num mono ${f.key === 'budget' && bad ? 'plan__bad' : ''}`}>
                          {fmtValue(f.fmt, sub[f.key])}
                        </td>
                      ))}
                      <td className="plan__num mono">{sub.quals ? fmtValue('money', sub.budget / sub.quals) : '—'}</td>
                    </tr>
                    {convs.map((c) => (
                      <tr key={c.id} className="plan__source-row">
                        <td className="plan__sticky-col plan__source-name">{c.name}</td>
                        <td />
                        {FIELDS.map((f) => (
                          <td key={f.key} className="plan__num">
                            {readOnly ? (
                              <span className="mono">{fmtValue(f.fmt, Number(lines[c.id]?.[f.key]) || 0)}</span>
                            ) : (
                              <input
                                className="input plan__input"
                                type="number"
                                value={lines[c.id]?.[f.key] ?? ''}
                                onChange={(e) => setField(c.id, f.key, e.target.value)}
                                onBlur={() => persist(c.id)}
                              />
                            )}
                          </td>
                        ))}
                        <td className="plan__num mono">
                          {Number(lines[c.id]?.quals) ? fmtValue('money', (Number(lines[c.id]?.budget) || 0) / Number(lines[c.id].quals)) : '—'}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="plan__grand">
                <td className="plan__sticky-col">Итого</td>
                <td className="plan__num mono">{fmtValue('money', commerceBudget)}</td>
                {FIELDS.map((f) => (
                  <td key={f.key} className="plan__num mono">
                    {fmtValue(f.fmt, total[f.key])}
                  </td>
                ))}
                <td className="plan__num mono">{total.quals ? fmtValue('money', total.budget / total.quals) : '—'}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="v2__note">
        Performance отвечает за квал-лиды в рамках бюджета, маркетинг — за ROAS и план по выручке. Бюджет по РК не
        планируется — им распоряжается performance. Сумма конвертеров источника должна совпасть с бюджетом источника из
        Коммерции (сумма по всем филиалам).
      </p>
    </div>
  )
}
