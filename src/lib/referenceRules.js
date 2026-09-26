// Business rules shared by reference-dictionary editors.

// Phase 1 has no data tables that reference dictionaries yet, so nothing is
// ever "in use". Later phases replace `usageChecker` with real FK checks.
export function canDelete(usageChecker, entity, id) {
  if (typeof usageChecker !== 'function') return true
  return usageChecker(entity, id) === false
}

// Exactly one qualification stage and exactly one sale stage must exist.
export function validateFunnelFlags(stages) {
  const active = stages.filter((s) => !s.is_archived)
  const quals = active.filter((s) => s.is_qualification).length
  const sales = active.filter((s) => s.is_sale).length
  const errors = []
  if (quals !== 1) errors.push('Ровно один этап должен быть отмечен как «Квалификация».')
  if (sales !== 1) errors.push('Ровно один этап должен быть отмечен как «Продажа».')
  return { valid: errors.length === 0, errors }
}

// Name must be non-empty and unique among non-archived siblings.
export function validateUniqueName(rows, name, currentId = null) {
  const trimmed = (name || '').trim()
  if (!trimmed) return { valid: false, error: 'Название не может быть пустым.' }
  const clash = rows.some(
    (r) => r.id !== currentId && !r.is_archived && (r.name || '').trim().toLowerCase() === trimmed.toLowerCase()
  )
  if (clash) return { valid: false, error: 'Такое название уже есть.' }
  return { valid: true, error: null }
}
