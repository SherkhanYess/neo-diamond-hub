// Edge Function: create a platform user. Only callers with the `settings`
// capability may use it. The service-role key stays server-side.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader) return json({ error: 'Не авторизовано' }, 401)

  // Verify caller and capability using their own token (RLS applies).
  const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } })
  const { data: userData } = await caller.auth.getUser()
  if (!userData?.user) return json({ error: 'Не авторизовано' }, 401)
  const { data: caps } = await caller.rpc('current_caps')
  if (!Array.isArray(caps) || !caps.includes('settings')) {
    return json({ error: 'Недостаточно прав' }, 403)
  }

  let payload: { email?: string; full_name?: string; password?: string; role_id?: string; branch_ids?: string[] }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Некорректный запрос' }, 400)
  }
  const { email, full_name, password, role_id, branch_ids } = payload
  if (!email || !password) return json({ error: 'Нужны email и пароль' }, 400)
  if (password.length < 8) return json({ error: 'Пароль не короче 8 символов' }, 400)

  const admin = createClient(url, service)
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (createErr) {
    const msg = createErr.message?.includes('already') ? 'Пользователь с таким email уже есть' : createErr.message
    return json({ error: msg }, 400)
  }

  const id = created.user.id
  const { error: profErr } = await admin.from('profiles').insert({
    id,
    full_name: full_name ?? '',
    role_id: role_id ?? null,
  })
  if (profErr) {
    // Roll back the auth user so we don't leave an orphan.
    await admin.auth.admin.deleteUser(id)
    return json({ error: 'Не удалось создать профиль: ' + profErr.message }, 400)
  }

  if (Array.isArray(branch_ids) && branch_ids.length) {
    await admin.from('profile_branches').insert(branch_ids.map((b) => ({ profile_id: id, branch_id: b })))
  }

  return json({ id })
})
