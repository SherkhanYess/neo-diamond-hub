// PostgREST caps a response at 1000 rows. Pages through a query until exhausted.
// `build` must return a fresh query builder each call (they are single-use).
export async function fetchAll(build, pageSize = 1000) {
  const out = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1)
    if (error) throw error
    out.push(...(data ?? []))
    if (!data || data.length < pageSize) break
  }
  return out
}
