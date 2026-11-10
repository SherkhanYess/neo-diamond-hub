import { useState, useRef, useEffect } from 'react'
import { useBrand, ALL_BRANDS } from '../../context/BrandContext'
import './BrandSwitcher.css'

// Adesk-style company switcher: the brand everything below is scoped to.
export default function BrandSwitcher() {
  const { brands, brandId, setBrandId, canAll, currentBrand, isAll } = useBrand()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  if (!brands.length) return null

  const label = isAll ? 'Все бренды' : currentBrand?.name ?? '—'
  const pick = (id) => {
    setBrandId(id)
    setOpen(false)
  }

  return (
    <div className="brandsw" ref={ref}>
      <button type="button" className="brandsw__btn" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox">
        <span className="brandsw__eyebrow">Бренд</span>
        <span className="brandsw__name">{label}</span>
        <span className="brandsw__caret">▾</span>
      </button>
      {open && (
        <div className="brandsw__menu" role="listbox">
          {brands.map((b) => (
            <button
              key={b.id}
              type="button"
              role="option"
              aria-selected={b.id === brandId}
              className={`brandsw__opt ${b.id === brandId ? 'is-active' : ''}`}
              onClick={() => pick(b.id)}
            >
              {b.name}
            </button>
          ))}
          {canAll && (
            <button
              type="button"
              role="option"
              aria-selected={isAll}
              className={`brandsw__opt brandsw__opt--all ${isAll ? 'is-active' : ''}`}
              onClick={() => pick(ALL_BRANDS)}
            >
              Все бренды
            </button>
          )}
        </div>
      )}
    </div>
  )
}
