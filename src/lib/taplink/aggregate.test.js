import { describe, it, expect } from 'vitest';
import { aggregate } from './aggregate';

const row = (o) => ({ event_type: 'page_view', target: null, city: null, device: 'mobile', referrer: null, utm: null, session_id: 's1', created_at: '2026-10-10T08:00:00Z', ...o });

const sample = [
  row({ session_id: 'a', event_type: 'page_view', device: 'mobile', referrer: 'https://instagram.com/' }),
  row({ session_id: 'a', event_type: 'click', target: 'whatsapp_top' }),
  row({ session_id: 'a', event_type: 'city_select', target: 'almaty', city: 'almaty' }),
  row({ session_id: 'b', event_type: 'page_view', device: 'desktop', referrer: '' }),
  row({ session_id: 'b', event_type: 'click', target: 'catalog' }),
  row({ session_id: 'c', event_type: 'page_view', device: 'mobile', referrer: 'https://instagram.com/' }),
];

describe('aggregate', () => {
  it('считает просмотры, зрителей, клики, кликеров, конверсию', () => {
    const a = aggregate(sample);
    expect(a.views).toBe(3);
    expect(a.viewers).toBe(3);
    expect(a.clicks).toBe(2);
    expect(a.clickers).toBe(2);
    expect(a.conversion).toBeCloseTo(2 / 3, 5);
  });

  it('клики по кнопкам — с подписями и счётчиками', () => {
    const a = aggregate(sample);
    expect(a.byTarget.map((t) => t.key).sort()).toEqual(['catalog', 'whatsapp_top']);
    expect(a.byTarget.every((t) => t.count === 1)).toBe(true);
    const wa = a.byTarget.find((t) => t.key === 'whatsapp_top');
    expect(wa.label).toBe('WhatsApp');
  });

  it('byTarget отсортирован по убыванию count', () => {
    const rows = [
      row({ session_id: 'x', event_type: 'click', target: 'catalog' }),
      row({ session_id: 'y', event_type: 'click', target: 'catalog' }),
      row({ session_id: 'z', event_type: 'click', target: 'whatsapp_top' }),
    ];
    const a = aggregate(rows);
    expect(a.byTarget[0]).toEqual({ key: 'catalog', label: 'Онлайн-каталог', count: 2 });
  });

  it('города из city_select', () => {
    const a = aggregate(sample);
    expect(a.byCity).toEqual([{ key: 'almaty', label: 'Алматы', count: 1 }]);
  });

  it('устройства из page_view', () => {
    const a = aggregate(sample);
    const m = Object.fromEntries(a.byDevice.map((d) => [d.key, d.count]));
    expect(m.mobile).toBe(2);
    expect(m.desktop).toBe(1);
  });

  it('источники: instagram и прямой', () => {
    const a = aggregate(sample);
    const m = Object.fromEntries(a.bySource.map((s) => [s.label, s.count]));
    expect(m['Instagram']).toBe(2);
    expect(m['Прямой / без источника']).toBe(1);
  });

  it('по дням: просмотры и клики', () => {
    const a = aggregate(sample);
    const day = a.byDay.find((d) => d.views > 0);
    expect(day.views).toBe(3);
    expect(day.clicks).toBe(2);
  });

  it('пустой вход не падает', () => {
    const a = aggregate([]);
    expect(a.views).toBe(0);
    expect(a.conversion).toBe(0);
    expect(a.byTarget).toEqual([]);
  });
});
