import { useState, useEffect, useMemo } from 'react';
import { loadTaplinkEvents } from '../../lib/api/taplink';
import { aggregate } from '../../lib/taplink/aggregate';
import { num1 } from '../../lib/format';
import { ProgressRing } from '../Dashboard/Charts';
import { BarList } from './TaplinkCharts';
import '../Dashboard/Dashboard.css';
import './Taplink.css';

const PERIODS = [
  { days: 7, label: '7 дней' },
  { days: 30, label: '30 дней' },
  { days: 90, label: '90 дней' },
];

export default function TaplinkPage() {
  const [sinceDays, setSinceDays] = useState(30);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadTaplinkEvents({ sinceDays })
      .then((r) => { if (alive) { setRows(r); setError(null); } })
      .catch((e) => { if (alive) setError(e.message || 'Ошибка загрузки'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [sinceDays]);

  const a = useMemo(() => aggregate(rows), [rows]);
  const maxDay = Math.max(1, ...a.byDay.map((d) => d.views));

  if (loading) return <p style={{ color: 'var(--ink-400)' }}>Загрузка…</p>;
  if (error) return <p style={{ color: 'var(--ink-400)' }}>Не удалось загрузить: {error}</p>;

  return (
    <div className="dash">
      <div className="dash__controls">
        <select className="select" value={sinceDays} onChange={(e) => setSinceDays(Number(e.target.value))}>
          {PERIODS.map((p) => (<option key={p.days} value={p.days}>{p.label}</option>))}
        </select>
        <span className="dash__month">link.neodiamond.kz</span>
      </div>

      <div className="dash__grid">
        <div className="dash__card dash__card--split">
          <div>
            <span className="eyebrow">Просмотры</span>
            <div className="dash__big mono">{num1(a.views)}</div>
            <div className="dash__row"><span>Уникальных</span><b className="mono">{num1(a.viewers)}</b></div>
            <div className="dash__row"><span>Кликов</span><b className="mono">{num1(a.clicks)}</b></div>
          </div>
          <ProgressRing pct={a.conversion * 100} label="в клик" />
        </div>

        <div className="dash__card">
          <span className="eyebrow">Клики по кнопкам</span>
          <BarList items={a.byTarget} />
        </div>

        <div className="dash__card">
          <span className="eyebrow">Выбор города (WhatsApp)</span>
          <BarList items={a.byCity} />
        </div>

        <div className="dash__card">
          <span className="eyebrow">Устройства</span>
          <BarList items={a.byDevice} />
        </div>

        <div className="dash__card">
          <span className="eyebrow">Источники</span>
          <BarList items={a.bySource} />
        </div>

        <div className="dash__card dash__card--wide">
          <span className="eyebrow">Просмотры по дням</span>
          {a.byDay.length === 0 ? (
            <p className="dash__empty">Нет данных</p>
          ) : (
            <div className="tl-day">
              {a.byDay.map((d) => (
                <div className="tl-day__col" key={d.date}>
                  <span className="tl-day__bar" style={{ height: `${(d.views / maxDay) * 100}%` }} title={`${d.date}: ${d.views} просм., ${d.clicks} кл.`} />
                  <span className="tl-day__lbl">{d.date.slice(5)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
