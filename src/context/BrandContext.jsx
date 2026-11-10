import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import { useSession } from './SessionContext'
import { supabase } from '../lib/supabaseClient'

// Brand context for Коммерция / Маркетинг / Планирование / Настройки.
// brandId is a brand uuid, or ALL_BRANDS for the owner's consolidated view.
export const ALL_BRANDS = 'all'
const STORAGE_KEY = 'hub.brand'

const BrandContext = createContext(null)

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}
function writeStored(v) {
  try {
    localStorage.setItem(STORAGE_KEY, v)
  } catch {
    /* private mode — keep in memory only */
  }
}

export function BrandProvider({ children }) {
  const { session, caps } = useSession()
  const [brands, setBrands] = useState([])
  const [brandId, setBrandIdState] = useState(readStored())
  const canAll = caps.includes('all_brands')

  const reload = useCallback(async () => {
    if (!session) return
    const { data } = await supabase
      .from('brands')
      .select('id, name, slug, sort_order, is_archived')
      .order('sort_order', { ascending: true })
    setBrands(data ?? [])
  }, [session])

  useEffect(() => {
    reload()
  }, [reload])

  const active = useMemo(() => brands.filter((b) => !b.is_archived), [brands])

  // Keep the selection valid: unknown id, or «all» without the right → first brand.
  useEffect(() => {
    if (!active.length) return
    const valid = brandId === ALL_BRANDS ? canAll : active.some((b) => b.id === brandId)
    if (!valid) setBrandIdState(active[0].id)
  }, [active, brandId, canAll])

  const setBrandId = useCallback((v) => {
    setBrandIdState(v)
    writeStored(v)
  }, [])

  const value = {
    brands: active,
    allBrandsIncludingArchived: brands,
    brandId,
    setBrandId,
    canAll,
    isAll: brandId === ALL_BRANDS,
    // uuid to filter by, or null when every brand is in scope
    brandFilter: brandId && brandId !== ALL_BRANDS ? brandId : null,
    currentBrand: active.find((b) => b.id === brandId) || null,
    brandName: (id) => brands.find((b) => b.id === id)?.name ?? '—',
    reloadBrands: reload,
  }

  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>
}

export function useBrand() {
  const ctx = useContext(BrandContext)
  if (!ctx) throw new Error('useBrand must be used within BrandProvider')
  return ctx
}
