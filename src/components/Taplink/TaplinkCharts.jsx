// Одно-рядный горизонтальный бар-лист (один ряд значений).
export function BarList({ items }) {
  if (!items || items.length === 0) return <p className="dash__empty">Нет данных</p>;
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div className="tl-bars">
      {items.map((i) => (
        <div className="tl-bars__row" key={i.key}>
          <span className="tl-bars__label">{i.label}</span>
          <div className="tl-bars__track">
            <span className="tl-bars__bar" style={{ width: `${(i.count / max) * 100}%` }} />
          </div>
          <span className="tl-bars__val mono">{i.count}</span>
        </div>
      ))}
    </div>
  );
}
