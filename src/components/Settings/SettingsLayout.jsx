import { useState } from 'react'
import CrudSection from './CrudSection'
import Funnel from './Funnel'
import Roles from './Roles'
import Users from './Users'
import Display from './Display'
import ChangeLog from './ChangeLog'
import {
  citiesConfig,
  branchesConfig,
  clientTasksConfig,
  demandSourcesConfig,
  leadSourcesConfig,
  creativeTagsConfig,
} from './sections/configs'
import './SettingsLayout.css'

const SECTIONS = [
  { key: 'users', label: 'Пользователи', render: () => <Users /> },
  { key: 'roles', label: 'Роли и права', render: () => <Roles /> },
  { key: 'cities', label: 'Города', render: () => <CrudSection config={citiesConfig} /> },
  { key: 'branches', label: 'Филиалы', render: () => <CrudSection config={branchesConfig} /> },
  { key: 'client_tasks', label: 'Клиентские задачи', render: () => <CrudSection config={clientTasksConfig} /> },
  { key: 'demand_sources', label: 'Источники спроса', render: () => <CrudSection config={demandSourcesConfig} /> },
  { key: 'lead_sources', label: 'Источники лида', render: () => <CrudSection config={leadSourcesConfig} /> },
  { key: 'funnel', label: 'Воронки', render: () => <Funnel /> },
  { key: 'creative_tags', label: 'Теги креативов', render: () => <CrudSection config={creativeTagsConfig} /> },
  { key: 'display', label: 'Отображение', render: () => <Display /> },
  { key: 'changelog', label: 'Журнал изменений', render: () => <ChangeLog /> },
]

export default function SettingsLayout() {
  const [active, setActive] = useState('users')
  const section = SECTIONS.find((s) => s.key === active)

  return (
    <div className="settings">
      <nav className="settings__nav">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            className={`settings__nav-item ${active === s.key ? 'is-active' : ''}`}
            onClick={() => setActive(s.key)}
          >
            {s.label}
          </button>
        ))}
      </nav>
      <section className="settings__body">
        <h2 className="settings__heading">{section.label}</h2>
        {section.render()}
      </section>
    </div>
  )
}
