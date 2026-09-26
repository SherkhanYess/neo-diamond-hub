// Little stacked bar showing how an ad's quals split across client tasks.
const COLORS = ['#7C6035', '#5B81A1', '#1E3149', '#C4A177', '#0B2040', '#8FA9C0']

export default function TaskBar({ breakdown, tasksById }) {
  const entries = Object.entries(breakdown || {})
  const total = entries.reduce((s, [, v]) => s + v, 0)
  if (!total) return <span className="rep__na">—</span>
  return (
    <div className="taskbar" title={entries.map(([k, v]) => `${tasksById[k]?.name || '—'}: ${v}`).join('\n')}>
      {entries.map(([k, v], i) => (
        <span
          key={k}
          className="taskbar__seg"
          style={{ width: `${(v / total) * 100}%`, background: COLORS[i % COLORS.length] }}
        />
      ))}
    </div>
  )
}
