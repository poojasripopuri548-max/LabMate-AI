import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck } from 'lucide-react'
import { notificationService } from '../../services/adminService'

export function NotificationBell() {
  const [data, setData] = useState({ unread: 0, notifications: [] })
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()

  const load = () => notificationService.getAll().then(setData).catch(() => {})
  useEffect(() => {
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const openItem = async (n) => {
    if (!n.read) {
      // mark-all is the only endpoint; refresh count after click
      notificationService.markAllRead().catch(() => {})
    }
    setOpen(false)
    if (n.link) navigate(n.link)
    load()
  }

  const markAll = async () => {
    await notificationService.markAllRead().catch(() => {})
    load()
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="icon-btn" onClick={() => setOpen(!open)} aria-label="Notifications" style={{ position: 'relative' }}>
        <Bell size={19} />
        {data.unread > 0 && (
          <span style={{
            position: 'absolute', top: -6, right: -6, background: 'var(--danger)', color: '#fff',
            borderRadius: '50%', fontSize: 10, fontWeight: 800, minWidth: 17, height: 17,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px'
          }}>{data.unread > 9 ? '9+' : data.unread}</span>
        )}
      </button>
      {open && (
        <div className="card" style={{
          position: 'absolute', right: 0, top: 48, width: 340, maxHeight: 420, overflowY: 'auto',
          zIndex: 100, padding: 0,
        }}>
          <div className="flex-between" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <strong style={{ fontSize: 14 }}>Notifications</strong>
            <button className="btn btn-secondary btn-sm" onClick={markAll}><CheckCheck size={14} /> Mark all read</button>
          </div>
          {data.notifications.length === 0 ? (
            <p className="text-sm text-muted" style={{ padding: 20, textAlign: 'center' }}>No notifications yet.</p>
          ) : data.notifications.map((n) => (
            <button key={n._id} onClick={() => openItem(n)} style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '12px 16px',
              border: 'none', borderBottom: '1px solid var(--border)', background: n.read ? '#fff' : 'var(--teal-100)',
              cursor: 'pointer', fontSize: 13,
            }}>
              <strong style={{ display: 'block', marginBottom: 3 }}>{n.type.replace(/_/g, ' ')}</strong>
              <span>{n.message}</span>
              <span className="text-sm text-muted" style={{ display: 'block', marginTop: 4 }}>{new Date(n.createdAt).toLocaleString()}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
