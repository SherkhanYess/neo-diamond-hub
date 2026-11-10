import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import './Integrations.css'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const INGEST_URL = `${SUPABASE_URL}/functions/v1/ingest-deal`

const EXAMPLE = `POST ${INGEST_URL}
x-ingest-key: <ключ доступа>
Content-Type: application/json

{
  "crm_id": "12345678",
  "brand": "neodiamond",            // или "taena"
  "branch": "Есентай Сити",
  "created_at": "2026-11-10T10:00:00+05:00",
  "stage": "Встреча назначена",      // текущий этап (или "stages": [{ "stage", "at" }])
  "utm_source": "instagram",
  "utm_medium": "ctwa",
  "utm_campaign": "PRED_meta_ctwa_1126",
  "utm_term": "120210000000001",     // id объявления
  "client_task": "Сделать подарок, показать своё отношение",
  "lead_manager": "Алмас",           // имя или email сотрудника
  "consultant": "Данеля",
  "account_manager": null,
  "is_repeat": false,
  "revenue": 850000,
  "sale_at": null,
  "first_response_minutes": 6
}`

// External data sources and how the hub receives their data.
const INTEGRATIONS = [
  {
    key: 'meta',
    name: 'Meta Ads',
    status: 'ждёт ключей',
    desc: 'Расход, показы и клики по дням на уровне объявления; кампании, группы, объявления, превью креативов.',
    needs: ['Access token рекламного кабинета', 'ID рекламного аккаунта (act_…)', 'Метка объявления в ссылке: utm_term={{ad.id}}'],
  },
  {
    key: 'tiktok',
    name: 'TikTok Ads',
    status: 'ждёт ключей',
    desc: 'Расход, показы и клики по дням из TikTok Ads.',
    needs: ['Access token', 'Advertiser ID'],
  },
]

const fmtTime = (t) => (t ? new Date(t).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '—')

function AmoCard() {
  const [row, setRow] = useState(null)
  useEffect(() => {
    supabase
      .from('integrations')
      .select('last_run_at, last_ok_at, last_error, last_stats, config')
      .eq('key', 'amocrm')
      .maybeSingle()
      .then(({ data }) => setRow(data))
  }, [])
  const failing = row?.last_error && (!row.last_ok_at || row.last_run_at > row.last_ok_at)
  return (
    <div className="integr__card integr__card--ready">
      <div className="integr__head">
        <h3>amoCRM</h3>
        <span className={`integr__status ${failing ? '' : 'integr__status--ready'}`}>{failing ? 'ошибка' : 'подключено'}</span>
      </div>
      <p className="integr__desc">
        Сделки воронок «Первичная продажа» и «Повторная продажа» с {row?.config?.since ? new Date(row.config.since).toLocaleDateString('ru-RU') : '—'},
        этапы с датами, суммы, ответственные. Обновление каждые 10 минут, только чтение — в amoCRM центр ничего не пишет.
        Автосделки воронки «Производство» не считаются (это копии проданных сделок).
      </p>
      <div className="integr__needs">
        <span className="eyebrow">Последняя синхронизация</span>
        <p className="integr__desc">
          {fmtTime(row?.last_ok_at)}
          {row?.last_stats ? ` · сделок обновлено: ${row.last_stats.processed ?? 0}` : ''}
          {failing ? ` · ошибка: ${row.last_error}` : ''}
        </p>
        <span className="eyebrow">Как считается</span>
        <ul>
          <li>Источник спроса — по UTM, иначе по полю «Источник лида», иначе по «ID объявления Meta» (→ Instagram, реклама).</li>
          <li>Клиентская задача — по полю «Повод покупки»; филиал — по «Город заказа».</li>
          <li>Лид-менеджер — кто перевёл сделку в «примерка назначена»; консультант — кто провёл встречу или закрыл продажу.</li>
          <li>Повторная продажа — воронка «Повторная продажа» (засчитывается аккаунт-менеджеру).</li>
        </ul>
      </div>
    </div>
  )
}

export default function Integrations() {
  return (
    <div className="integr">
      <AmoCard />
      <div className="integr__card integr__card--ready">
        <div className="integr__head">
          <h3>Приём сделок</h3>
          <span className="integr__status integr__status--ready">готово</span>
        </div>
        <p className="integr__desc">
          Точка, в которую amoCRM (вебхуком) или любая автоматизация (Make, n8n, синк) отправляет сделки. Центр сам
          находит бренд, филиал, этап, задачу и сотрудников по названиям, а источник спроса, конвертер и объявление
          определяет по UTM — тем же правилом, что в «UTM-правилах». Повторная отправка той же сделки (тот же crm_id)
          обновляет её, а не дублирует. До 500 сделок за запрос.
        </p>
        <div className="integr__needs">
          <span className="eyebrow">Адрес</span>
          <code className="integr__code">{INGEST_URL}</code>
          <span className="eyebrow">Формат</span>
          <pre className="integr__pre">{EXAMPLE}</pre>
          <p className="integr__desc">
            Ключ доступа хранится у владельца (в файле доступов на компьютере) и передаётся тому, кто настраивает
            автоматизацию. В браузер и в код сайта он не попадает.
          </p>
        </div>
      </div>

      <div className="integr__grid">
        {INTEGRATIONS.map((it) => (
          <div className="integr__card" key={it.key}>
            <div className="integr__head">
              <h3>{it.name}</h3>
              <span className="integr__status">{it.status}</span>
            </div>
            <p className="integr__desc">{it.desc}</p>
            <div className="integr__needs">
              <span className="eyebrow">Что нужно</span>
              <ul>
                {it.needs.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
