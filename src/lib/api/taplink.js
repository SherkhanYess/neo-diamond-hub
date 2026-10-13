import { supabase } from '../supabaseClient';

// Загружает события таплинка за последние sinceDays дней.
// RLS: select разрешён роли authenticated — читает авторизованный пользователь хаба.
export async function loadTaplinkEvents({ sinceDays = 30 } = {}) {
  const since = new Date(Date.now() - sinceDays * 86400000).toISOString();
  const { data, error } = await supabase
    .from('taplink_events')
    .select('event_type,target,city,device,referrer,utm,session_id,created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(50000);
  if (error) throw error;
  return data || [];
}
