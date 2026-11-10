import { describe, it, expect } from 'vitest'
import { credited, unitReport, departmentReport, salesBy, median } from './sales'

const stages = { qual: 'q', set: 's', held: 'h' }
const A = 'almas', Y = 'abylai', D = 'danelya'
const deals = [
  // Almas brings d1 to a meeting, Danelya sells it — both get credit.
  { id: 'd1', lead_manager_id: A, consultant_id: D, sale_at: '2026-11-04', revenue: 800, first_response_minutes: 5, brand_id: 'nd', client_task_id: 'T1' },
  { id: 'd2', lead_manager_id: A, consultant_id: Y, first_response_minutes: 15, brand_id: 'nd' },
  { id: 'd3', lead_manager_id: Y, first_response_minutes: 40, brand_id: 'ta' },
  // repeat sale handled by the account manager
  { id: 'd4', account_manager_id: D, consultant_id: D, is_repeat: true, sale_at: '2026-11-05', revenue: 300, brand_id: 'nd', client_task_id: 'T2' },
  // sale with no consultant in the unit
  { id: 'd5', lead_manager_id: 'stranger', consultant_id: 'stranger', sale_at: '2026-11-06', revenue: 100, brand_id: 'ta', client_task_id: 'T1' },
]
const events = [
  { deal_id: 'd1', stage_id: 'q' }, { deal_id: 'd1', stage_id: 's' }, { deal_id: 'd1', stage_id: 'h' },
  { deal_id: 'd2', stage_id: 'q' }, { deal_id: 'd2', stage_id: 's' }, { deal_id: 'd2', stage_id: 'h' },
  { deal_id: 'd3', stage_id: 'q' },
  { deal_id: 'd4', stage_id: 'h' },
  { deal_id: 'd5', stage_id: 'h' },
]
const units = [
  { id: 'L', kind: 'lead_center' },
  { id: 'C', kind: 'consultations' },
  { id: 'R', kind: 'account' },
]
const members = [
  { unit_id: 'L', profile_id: A }, { unit_id: 'L', profile_id: Y },
  { unit_id: 'C', profile_id: D }, { unit_id: 'C', profile_id: Y },
  { unit_id: 'R', profile_id: D },
]
const targets = [
  { unit_id: 'L', profile_id: A, metric: 'held', value: 3 },
  { unit_id: 'L', profile_id: Y, metric: 'held', value: 2 },
  { unit_id: 'L', profile_id: null, metric: 'held', value: 6 },
  { unit_id: null, profile_id: null, metric: 'sales', value: 4 },
]

describe('dual attribution', () => {
  it('credits the lead manager with the meeting and the consultant with the sale', () => {
    expect(credited(deals, 'lead_center', A).map((d) => d.id)).toEqual(['d1', 'd2'])
    expect(credited(deals, 'consultations', D).map((d) => d.id)).toEqual(['d1'])
  })
  it('keeps repeat sales for the account manager only', () => {
    expect(credited(deals, 'consultations', D).some((d) => d.is_repeat)).toBe(false)
    expect(credited(deals, 'account', D).map((d) => d.id)).toEqual(['d4'])
  })
})

describe('unitReport', () => {
  const lead = unitReport({ unit: units[0], memberIds: [A, Y], deals, events, stages, targets })
  it('gives each member personal fact and plan', () => {
    const almas = lead.rows.find((r) => r.profile_id === A)
    expect(almas.fact.held).toBe(2)
    expect(almas.fact.cr_lead_qual).toBe(1)
    expect(almas.plan.held).toBe(3)
    expect(almas.fact.first_response).toBe(10) // median of 5 and 15
  })
  it('unit total equals the sum of its members', () => {
    const sum = lead.rows.reduce((a, r) => a + r.fact.held, 0)
    expect(lead.total.fact.held).toBe(sum)
    expect(lead.total.fact.leads).toBe(lead.rows.reduce((a, r) => a + r.fact.leads, 0))
  })
  it('exposes the unit target and the sum of personal targets separately', () => {
    expect(lead.unitPlan.held).toBe(6)
    expect(lead.peoplePlan.held).toBe(5)
  })
})

describe('departmentReport', () => {
  const rep = departmentReport({ units, members, deals, events, stages, targets })
  it('reports the general picture from all deals', () => {
    expect(rep.general.sales).toBe(2) // d1, d5 (non-repeat)
    expect(rep.general.repeat_sales).toBe(1)
    expect(rep.plan.sales).toBe(4)
  })
  it('surfaces sales no unit member is credited with', () => {
    expect(rep.gaps.sales_without_consultant).toBe(1) // d5
    expect(rep.gaps.held_without_lead).toBe(1) // d5
  })
})

describe('helpers', () => {
  it('median handles odd/even/empty', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([1, 2, 3, 4])).toBe(2.5)
    expect(median([])).toBeNull()
  })
  it('splits sales by brand', () => {
    const byBrand = salesBy(deals, 'brand_id')
    expect(byBrand.find((r) => r.key === 'nd').sales).toBe(2)
  })
})
