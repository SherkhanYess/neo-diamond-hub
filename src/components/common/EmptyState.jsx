import './EmptyState.css'

export default function EmptyState({ title, description, action }) {
  return (
    <div className="empty">
      <div className="empty__card">
        <h3 className="empty__title">{title}</h3>
        {description && <p className="empty__desc">{description}</p>}
        {action && <div className="empty__action">{action}</div>}
      </div>
    </div>
  )
}
