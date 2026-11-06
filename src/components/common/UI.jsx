import { Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'

export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="state-box">
      <Loader2 size={28} className="spin" />
      <p>{label}</p>
    </div>
  )
}

export function EmptyState({ icon: Icon, title, message, action }) {
  return (
    <div className="state-box">
      {Icon && <Icon size={36} className="state-icon" />}
      <h3>{title}</h3>
      {message && <p>{message}</p>}
      {action}
    </div>
  )
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="state-box error">
      <h3>Something went wrong</h3>
      <p>{message || 'Failed to load data. Please try again.'}</p>
      {onRetry && (
        <button className="btn btn-secondary" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  )
}

export function StatusBadge({ status }) {
  const map = {
    pending: 'badge-warning',
    approved: 'badge-success',
    issued: 'badge-info',
    active: 'badge-success',
    completed: 'badge-info',
    rejected: 'badge-danger',
    cancelled: 'badge-muted',
    available: 'badge-success',
    unavailable: 'badge-danger',
    borrowed: 'badge-warning',
    working: 'badge-success',
    damaged: 'badge-danger',
    under_maintenance: 'badge-warning',
    retired: 'badge-muted',
    High: 'badge-danger',
    Medium: 'badge-warning',
    Low: 'badge-info',
  }
  return <span className={`badge ${map[status] || 'badge-muted'}`}>{String(status).replace(/_/g, ' ')}</span>
}

export function StatCard({ icon: Icon, label, value, hint, to }) {
  const content = (
    <div className="stat-card">
      <div className="stat-icon">
        <Icon size={22} />
      </div>
      <div>
        <p className="stat-label">{label}</p>
        <p className="stat-value">{value ?? '—'}</p>
        {hint && <p className="stat-hint">{hint}</p>}
      </div>
    </div>
  )
  return to ? <Link to={to} className="stat-link">{content}</Link> : content
}
