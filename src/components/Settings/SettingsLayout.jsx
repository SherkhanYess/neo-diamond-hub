import { useState } from 'react'
import CrudSection from './CrudSection'
import Funnel from './Funnel'
import Roles from './Roles'
import Users from './Users'
import Display from './Display'
import ChangeLog from './ChangeLog'
import Integrations from './Integrations'
import UtmRules from './UtmRules'
import AdCampaigns from './AdCampaigns'
import { useBrand } from '../../context/BrandContext'
import {
  citiesConfig,
  branchesConfig,
  clientTasksConfig,
  demandSourcesConfig,
  leadSourcesConfig,
  creativeTagsConfig,
  brandsConfig,
  convertersConfig,
  spendConfig,
} from './sections/configs'
import './SettingsLayout.css'

// `brand: true` — the section edits brand-owned data (scoped by the switcher).
const GROUPS = [
  {
    title: 'Доступ',
    items: [
      { key: 'users', label: 'Пользователи', render: () => <Users /> },
      { key: 'roles', label: 'Роли и права', render: () => <Roles /> },
    ],
  },
  {
    title: 'Бренды',
    items: [
      { key: 'brands', label: 'Бренды', render: (b) => <CrudSection key={b} config={brandsConfig} /> },
      { key: 'client_tasks', label: 'Клиентские задачи', brand: true, render: (b) => <CrudSection key={b} config={clientTasksConfig} /> },
      { key: 'demand_sources', label: 'Источники спроса', brand: true, render: (b) => <CrudSection key={b} config={demandSourcesConfig} /> },
      { key: 'converters', label: 'Конвертеры', brand: true, render: (b) => <CrudSection key={b} config={convertersConfig} /> },
      { key: 'utm', label: 'UTM-правила', brand: true, render: (b) => <UtmRules key={b} /> },
      { key: 'campaigns', label: 'Рекламные кампании', brand: true, render: (b) => <AdCampaigns key={b} /> },
      { key: 'spend', label: 'Расходы', brand: true, render: (b) => <CrudSection key={b} config={spendConfig} /> },
    ],
  },
  {
    title: 'Общее',
    items: [
      { key: 'cities', label: 'Города', render: () => <CrudSection config={citiesConfig} /> },
      { key: 'branches', label: 'Филиалы', render: () => <CrudSection config={branchesConfig} /> },
      { key: 'funnel', label: 'Воронка', render: () => <Funnel /> },
      { key: 'lead_sources', label: 'Источники лида', render: () => <CrudSection config={leadSourcesConfig} /> },
      { key: 'creative_tags', label: 'Теги креативов', render: () => <CrudSection config={creativeTagsConfig} /> },
    ],
  },
  {
    title: 'Система',
    items: [
      { key: 'integrations', label: 'Интеграции', render: () => <Integrations /> },
      { key: 'display', label: 'Отображение', render: () => <Display /> },
      { key: 'changelog', label: 'Журнал изменений', render: () => <ChangeLog /> },
    ],
  },
]

const ALL = GROUPS.flatMap((g) => g.items)

export default function SettingsLayout() {
  const [active, setActive] = useState('users')
  const { isAll, currentBrand, brandId } = useBrand()
  const section = ALL.find((s) => s.key === active)

  return (
    <div className="settings">
      <nav className="settings__nav">
        {GROUPS.map((g) => (
          <div key={g.title} className="settings__group">
            <span className="settings__group-title">{g.title}</span>
            {g.items.map((s) => (
              <button
                key={s.key}
                className={`settings__nav-item ${active === s.key ? 'is-active' : ''}`}
                onClick={() => setActive(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <section className="settings__body">
        <h2 className="settings__heading">
          {section.label}
          {section.brand && (
            <span className="settings__brand">{isAll ? 'все бренды' : currentBrand?.name}</span>
          )}
        </h2>
        {section.render(brandId)}
      </section>
    </div>
  )
}
