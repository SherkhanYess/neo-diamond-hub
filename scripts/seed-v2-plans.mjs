// Seeds approved demo commerce plans for November 2026 (both brands), computed
// with the app's own planning engine. Tagged computed.demo = true; removed by
// supabase/seed_v2_demo_cleanup.sql. Run: node scripts/seed-v2-plans.mjs
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { computeMarketing } from '../src/lib/planning/calc.js'

const dir = `${homedir()}/.config/neo-diamond-hub`
const TOKEN = readFileSync(`${dir}/sb_token`, 'utf8').trim()
const REF = readFileSync(`${dir}/project_ref`, 'utf8').trim()

async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'neo-diamond-hub-ops' },
    body: JSON.stringify({ query }),
  })
  const body = await r.json()
  if (!r.ok) throw new Error(JSON.stringify(body))
  return body
}
const q = (v) => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`)

const ND = '20000000-0000-0000-0000-000000000001'
const TA = '20000000-0000-0000-0000-000000000002'
const ES = 'b4013293-263e-4520-be6d-fc9f9003d41f'
const AT = 'd0a42824-96cf-4268-8e0c-4957d9de6653'
const MONTH = '2026-11-01'

// [branch, brand, [[task name, target, budget %, [[source, share %, avg check]]]]]
const PLANS = [
  [ES, ND, [
    ['Сделать предложение руки и сердца', 18e6, 9, [['Instagram', 55, 950e3], ['2ГИС', 20, 950e3], ['TikTok', 10, 900e3], ['CRM-маркетинг', 15, 600e3]]],
    ['Сделать предложение - помолвка', 9e6, 9, [['Instagram', 60, 850e3], ['2ГИС', 25, 850e3], ['TikTok', 15, 800e3]]],
    ['Сделать подарок, показать своё отношение', 8e6, 11, [['Instagram', 60, 450e3], ['2ГИС', 20, 450e3], ['TikTok', 10, 420e3], ['CRM-маркетинг', 10, 500e3]]],
    ['Покупка для себя, подчеркнуть статус, порадовать себя', 7e6, 10, [['Instagram', 50, 620e3], ['2ГИС', 30, 620e3], ['CRM-маркетинг', 20, 550e3]]],
  ]],
  [AT, ND, [
    ['Сделать предложение руки и сердца', 3e6, 9, [['Instagram', 70, 950e3], ['2ГИС', 30, 950e3]]],
    ['Сделать подарок, показать своё отношение', 2e6, 11, [['Instagram', 100, 450e3]]],
    ['Покупка для себя, подчеркнуть статус, порадовать себя', 1e6, 10, [['2ГИС', 100, 620e3]]],
  ]],
  [ES, TA, [
    ['Сделать предложение', 9e6, 10, [['Instagram', 75, 720e3], ['2ГИС', 25, 720e3]]],
    ['Обручальные кольца к свадьбе', 5e6, 10, [['Instagram', 80, 380e3], ['2ГИС', 20, 380e3]]],
  ]],
]

const owner = (await sql("select p.id from profiles p join roles r on r.id = p.role_id where r.is_system limit 1"))[0]?.id
await sql("delete from plans where computed ->> 'demo' = 'true'")

for (const [branch, brand, tasks] of PLANS) {
  const taskRows = await sql(`select id, name from client_tasks where brand_id = ${q(brand)}`)
  const srcRows = await sql(`select id, name from demand_sources where brand_id = ${q(brand)}`)
  const taskId = (n) => taskRows.find((t) => t.name === n)?.id
  const srcId = (n) => srcRows.find((s) => s.name === n)?.id

  const input = tasks.map(([name, target, pct, sources]) => ({
    client_task_id: taskId(name),
    target_revenue: target,
    ad_budget_pct: pct,
    sources: sources.map(([s, share, check]) => ({
      demand_source_id: srcId(s),
      revenue_share: share,
      avg_check: check,
      ad_budget: null,
      owner_id: null,
    })),
  }))
  for (const t of input) {
    if (!t.client_task_id || t.sources.some((s) => !s.demand_source_id)) throw new Error('missing dictionary item for ' + brand)
  }
  const computed = { ...computeMarketing(input), demo: true }
  const [plan] = await sql(
    `insert into plans (month, branch_id, brand_id, kind, version, status, computed, created_by, approved_by, approved_at, branch_target_revenue)
     values (${q(MONTH)}, ${q(branch)}, ${q(brand)}, 'commerce', 1, 'approved', ${q(JSON.stringify(computed))}::jsonb, ${q(owner)}, ${q(owner)}, now(), ${computed.grandTotal.revenue})
     returning id`
  )
  for (const t of input) {
    await sql(`insert into plan_task_lines (plan_id, client_task_id, target_revenue, ad_budget_pct) values (${q(plan.id)}, ${q(t.client_task_id)}, ${t.target_revenue}, ${t.ad_budget_pct})`)
    for (const s of t.sources) {
      await sql(`insert into plan_source_lines (plan_id, client_task_id, demand_source_id, revenue_share, avg_check) values (${q(plan.id)}, ${q(t.client_task_id)}, ${q(s.demand_source_id)}, ${s.revenue_share}, ${s.avg_check})`)
    }
  }
  console.log(`plan ${brand === ND ? 'Neo Diamond' : 'taena'} @ ${branch === ES ? 'Есентай' : 'Атлант'}: revenue ${computed.grandTotal.revenue / 1e6}M, budget ${Math.round(computed.grandTotal.ad_budget / 1e3)}k, orders ${computed.grandTotal.orders.toFixed(1)}`)
}
