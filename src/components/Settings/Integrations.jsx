import './Integrations.css'

// Read-only status view for the three external integrations. Live connection
// (OAuth, tokens, sync) is wired once the owner supplies credentials; until
// then each shows what it needs.
const INTEGRATIONS = [
  {
    key: 'amocrm',
    name: 'amoCRM',
    desc: 'Сделки, этапы, даты переходов, суммы, поля сделки. Источник факта воронки.',
    needs: ['Поддомен аккаунта (например neodiamond.amocrm.ru)', 'ID и секрет интеграции + redirect URI', 'Доступ на вебхуки смены этапа'],
  },
  {
    key: 'meta',
    name: 'Meta Ads',
    desc: 'Расход, показы, клики и превью креативов по кампаниям, группам, объявлениям.',
    needs: ['Access token рекламного кабинета', 'ID рекламного аккаунта (act_…)'],
  },
  {
    key: 'tiktok',
    name: 'TikTok Ads',
    desc: 'Расход, показы, клики и превью креативов из TikTok Ads.',
    needs: ['Access token', 'Advertiser ID'],
  },
]

export default function Integrations() {
  return (
    <div className="integr">
      <p className="rep__note">
        Платформа работает на демо-данных, пока интеграции не подключены. Подключение включает
        живую синхронизацию: факт воронки из amoCRM, рекламный расход и креативы из кабинетов.
      </p>
      <div className="integr__grid">
        {INTEGRATIONS.map((it) => (
          <div className="integr__card" key={it.key}>
            <div className="integr__head">
              <h3>{it.name}</h3>
              <span className="integr__status">не подключено</span>
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
