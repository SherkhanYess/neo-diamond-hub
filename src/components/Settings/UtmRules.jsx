import { useState } from 'react'
import CrudSection from './CrudSection'
import { utmRulesConfig } from './sections/configs'
import { useBrand } from '../../context/BrandContext'
import { supabase } from '../../lib/supabaseClient'

// UTM rules + a tester that runs the very same SQL resolver the deals trigger uses.
export default function UtmRules() {
  const { brandFilter, brands } = useBrand()
  const [brand, setBrand] = useState('')
  const [utm, setUtm] = useState({ source: '', medium: '', campaign: '', content: '' })
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)

  const testBrand = brandFilter || brand
  const set = (k, v) => setUtm((s) => ({ ...s, [k]: v }))

  const test = async () => {
    if (!testBrand) {
      setResult({ error: 'Выберите бренд для проверки.' })
      return
    }
    setBusy(true)
    try {
      const { data: convId, error } = await supabase.rpc('resolve_utm', {
        p_brand: testBrand,
        p_source: utm.source || null,
        p_medium: utm.medium || null,
        p_campaign: utm.campaign || null,
        p_content: utm.content || null,
      })
      if (error) throw error
      if (!convId) {
        setResult({ none: true })
      } else {
        const { data } = await supabase
          .from('converters')
          .select('name, source:demand_sources(name)')
          .eq('id', convId)
          .maybeSingle()
        setResult({ source: data?.source?.name, converter: data?.name })
      }
    } catch (e) {
      setResult({ error: e.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <p className="crud__intro">
        Правила разбирают UTM новой сделки в источник спроса и конвертер. Договорённость по меткам:
        <b> utm_source</b> — канал (instagram, 2gis, tiktok); <b>utm_medium</b> — как пойман лид: bio / stories →
        профиль, site → сайт-каталог, ctwa / cpc → реклама; числовой <b>utm_term</b> (id объявления) привязывает
        сделку к объявлению. Источник определяется с этапа «Обращение».
      </p>

      <div className="utmtest">
        <span className="eyebrow">Проверить метки</span>
        <div className="utmtest__row">
          {!brandFilter && (
            <select className="select" value={brand} onChange={(e) => setBrand(e.target.value)}>
              <option value="">Бренд…</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
          <input className="input" placeholder="utm_source" value={utm.source} onChange={(e) => set('source', e.target.value)} />
          <input className="input" placeholder="utm_medium" value={utm.medium} onChange={(e) => set('medium', e.target.value)} />
          <input className="input" placeholder="utm_campaign" value={utm.campaign} onChange={(e) => set('campaign', e.target.value)} />
          <input className="input" placeholder="utm_content" value={utm.content} onChange={(e) => set('content', e.target.value)} />
          <button className="btn btn--ghost" onClick={test} disabled={busy}>
            {busy ? 'Проверяем…' : 'Проверить'}
          </button>
        </div>
        {result && (
          <p className="utmtest__result">
            {result.error && <span className="form-error">{result.error}</span>}
            {result.none && 'Ни одно правило не подошло — сделка останется без источника, пока его не поставят вручную.'}
            {result.converter && (
              <>
                → <b>{result.source}</b> · {result.converter}
              </>
            )}
          </p>
        )}
      </div>

      <CrudSection config={utmRulesConfig} />
    </div>
  )
}
