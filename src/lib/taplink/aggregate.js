import { targetLabel, cityLabel, deviceLabel, sourceLabel } from './labels';

function countBy(rows, keyFn, labelFn) {
  const m = new Map();
  for (const r of rows) {
    const key = keyFn(r);
    if (key == null || key === '') continue;
    m.set(key, (m.get(key) || 0) + 1);
  }
  return [...m.entries()]
    .map(([key, count]) => ({ key, label: labelFn(key), count }))
    .sort((a, b) => b.count - a.count);
}

function dayKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function aggregate(rows = []) {
  const pageViews = rows.filter((r) => r.event_type === 'page_view');
  const clicks = rows.filter((r) => r.event_type === 'click');
  const citySelects = rows.filter((r) => r.event_type === 'city_select');

  const viewers = new Set(pageViews.map((r) => r.session_id).filter(Boolean)).size;
  const clickers = new Set(clicks.map((r) => r.session_id).filter(Boolean)).size;

  const bySourceMap = new Map();
  for (const r of pageViews) {
    const label = sourceLabel(r.referrer);
    bySourceMap.set(label, (bySourceMap.get(label) || 0) + 1);
  }
  const bySource = [...bySourceMap.entries()]
    .map(([label, count]) => ({ key: label, label, count }))
    .sort((a, b) => b.count - a.count);

  const byDayMap = new Map();
  for (const r of rows) {
    if (r.event_type !== 'page_view' && r.event_type !== 'click') continue;
    const k = dayKey(r.created_at);
    const cur = byDayMap.get(k) || { date: k, views: 0, clicks: 0 };
    if (r.event_type === 'page_view') cur.views += 1;
    else cur.clicks += 1;
    byDayMap.set(k, cur);
  }
  const byDay = [...byDayMap.values()].sort((a, b) => a.date.localeCompare(b.date));

  return {
    views: pageViews.length,
    viewers,
    clicks: clicks.length,
    clickers,
    conversion: viewers ? clickers / viewers : 0,
    byTarget: countBy(clicks, (r) => r.target, targetLabel),
    byCity: countBy(citySelects, (r) => r.city, cityLabel),
    byDevice: countBy(pageViews, (r) => r.device, deviceLabel),
    bySource,
    byDay,
  };
}
