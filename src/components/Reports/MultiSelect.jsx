import { useState, useRef, useEffect } from 'react'
import './MultiSelect.css'

// Multi-select dropdown. `value` is an array of ids; empty = "все".
export default function MultiSelect({ options, value = [], onChange, placeholder = 'Все' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const toggle = (id) => {
    const next = value.includes(id) ? value.filter((v) => v !== id) : [...value, id]
    onChange(next)
  }

  const summary =
    value.length === 0
      ? placeholder
      : value.length === 1
        ? options.find((o) => o.id === value[0])?.name || '1'
        : `Выбрано: ${value.length}`

  return (
    <div className="ms" ref={ref}>
      <button type="button" className="ms__control" onClick={() => setOpen((o) => !o)}>
        <span className={value.length ? '' : 'ms__placeholder'}>{summary}</span>
        <span className="ms__caret">▾</span>
      </button>
      {open && (
        <div className="ms__menu">
          {value.length > 0 && (
            <button type="button" className="ms__clear" onClick={() => onChange([])}>
              Сбросить
            </button>
          )}
          {options.map((o) => (
            <label key={o.id} className="ms__opt">
              <input type="checkbox" checked={value.includes(o.id)} onChange={() => toggle(o.id)} />
              <span>{o.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
