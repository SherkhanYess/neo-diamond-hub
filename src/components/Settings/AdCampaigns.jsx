import { useState, useEffect, useCallback } from 'react'
import DataTable from '../common/DataTable'
import { useBrand } from '../../context/BrandContext'
import { useSession } from '../../context/SessionContext'
import { useToast } from '../common/Toast'
import { supabase } from '../../lib/supabaseClient'
import { listRef } from '../../lib/api/references'
import { logChange } from '../../lib/api/audit'

// Ad campaigns from the cabinets → brand, demand source and converter.
// Groups and ads inherit their campaign's mapping.
export default function AdCampaigns() {
  const { brandFilter, brands, brandName, isAll } = useBrand()
  const { profile } = useSession()
  const toast = useToast()
  const [campaigns, setCampaigns] = useState([])
  const [sources, setSources] = useState([])
  const [converters, setConverters] = useState([])

  const load = useCallback(async () => {
    let q = supabase
      .from('ad_entities')
      .select('id, name, cabinet, external_id, brand_id, demand_source_id, converter_id')
      .eq('level', 'campaign')
      .order('name')
    if (brandFilter) q = q.eq('brand_id', brandFilter)
    const [{ data }, s, c] = await Promise.all([
      q,
      listRef('demand_sources'),
      listRef('converters', { select: 'id, name, brand_id, demand_source_id' }),
    ])
    setCampaigns(data ?? [])
    setSources(s)
    setConverters(c)
  }, [brandFilter])

  useEffect(() => {
    load()
  }, [load])

  const save = async (camp, patch) => {
    const next = { ...camp, ...patch }
    // A converter implies its source; changing the source clears a foreign converter.
    if (patch.converter_id) {
      next.demand_source_id = converters.find((c) => c.id === patch.converter_id)?.demand_source_id ?? next.demand_source_id
    }
    if (patch.demand_source_id && converters.find((c) => c.id === next.converter_id)?.demand_source_id !== patch.demand_source_id) {
      next.converter_id = null
    }
    if (patch.brand_id) {
      next.demand_source_id = null
      next.converter_id = null
    }
    const mapping = {
      brand_id: next.brand_id,
      demand_source_id: next.demand_source_id || null,
      converter_id: next.converter_id || null,
      mapped_by_hand: true,
    }
    const { data: groups } = await supabase.from('ad_entities').select('id').eq('parent_id', camp.id)
    const ids = [camp.id, ...(groups ?? []).map((g) => g.id)]
    const { error } = await supabase.from('ad_entities').update(mapping).in('id', ids)
    if (!error && ids.length > 1) {
      await supabase.from('ad_entities').update(mapping).in('parent_id', ids.slice(1))
    }
    if (error) {
      toast.show({ message: 'Не удалось сохранить: ' + error.message })
      return
    }
    await logChange(profile?.id, 'ad_entities', camp.id, 'update', mapping)
    await load()
    toast.show({ message: 'Кампания привязана. Группы и объявления наследуют привязку.' })
  }

  const columns = [
    { key: 'name', label: 'Кампания' },
    { key: 'cabinet', label: 'Кабинет', render: (r) => (r.cabinet === 'meta' ? 'Meta' : 'TikTok') },
    {
      key: 'brand',
      label: 'Бренд',
      render: (r) =>
        isAll ? (
          <select className="select" value={r.brand_id} onChange={(e) => save(r, { brand_id: e.target.value })}>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        ) : (
          brandName(r.brand_id)
        ),
    },
    {
      key: 'source',
      label: 'Источник спроса',
      render: (r) => (
        <select
          className="select"
          value={r.demand_source_id || ''}
          onChange={(e) => save(r, { demand_source_id: e.target.value || null })}
        >
          <option value="">— не привязан —</option>
          {sources
            .filter((s) => s.brand_id === r.brand_id)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>
      ),
    },
    {
      key: 'converter',
      label: 'Конвертер',
      render: (r) => (
        <select
          className="select"
          value={r.converter_id || ''}
          onChange={(e) => save(r, { converter_id: e.target.value || null })}
        >
          <option value="">—</option>
          {converters
            .filter((c) => c.brand_id === r.brand_id && (!r.demand_source_id || c.demand_source_id === r.demand_source_id))
            .map((c) => (
              <option key={c.id} value={c.id}>
                {sources.find((s) => s.id === c.demand_source_id)?.name ?? ''} · {c.name}
              </option>
            ))}
        </select>
      ),
    },
  ]

  return (
    <div className="crud">
      <p className="crud__intro">
        Кампании приходят из рекламных кабинетов. Привяжите каждую к источнику спроса (и при необходимости к
        конвертеру) — тогда её расход попадёт во вложения источника, а объявления — в Performance внутри источника.
        Непривязанные кампании видны строкой «Не разнесено».
      </p>
      <DataTable columns={columns} rows={campaigns} emptyText="Кампаний пока нет — они появятся после подключения кабинетов." />
    </div>
  )
}
