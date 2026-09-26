import { useState, useEffect } from 'react'
import DataTable from '../common/DataTable'
import { listAudit } from '../../lib/api/audit'

const ACTION_LABELS = {
  create: 'Создание',
  update: 'Изменение',
  archive: 'Архив',
  delete: 'Удаление',
}

const ENTITY_LABELS = {
  cities: 'Города',
  branches: 'Филиалы',
  client_tasks: 'Клиентские задачи',
  demand_sources: 'Источники спроса',
  lead_sources: 'Источники лида',
  funnel_stages: 'Воронка',
  roles: 'Роли',
  role_branches: 'Филиалы роли',
  profiles: 'Пользователи',
  profile_branches: 'Филиалы пользователя',
  display_settings: 'Отображение',
}

export default function ChangeLog() {
  const [rows, setRows] = useState([])
  const [entity, setEntity] = useState('')

  useEffect(() => {
    listAudit({ entity: entity || null }).then(setRows)
  }, [entity])

  const columns = [
    {
      key: 'created_at',
      label: 'Когда',
      render: (r) => new Date(r.created_at).toLocaleString('ru-RU'),
    },
    { key: 'actor', label: 'Кто', render: (r) => r.actor?.full_name || '—' },
    { key: 'entity', label: 'Раздел', render: (r) => ENTITY_LABELS[r.entity] || r.entity },
    { key: 'action', label: 'Действие', render: (r) => ACTION_LABELS[r.action] || r.action },
  ]

  return (
    <div className="crud">
      <div className="crud__toolbar">
        <select className="select crud__search" value={entity} onChange={(e) => setEntity(e.target.value)}>
          <option value="">Все разделы</option>
          {Object.entries(ENTITY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <DataTable columns={columns} rows={rows} rowKey="id" emptyText="Изменений пока нет." />
    </div>
  )
}
