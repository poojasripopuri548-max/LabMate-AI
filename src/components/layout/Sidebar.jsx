import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Package, CalendarCheck, ClipboardList, Undo2,
  Sparkles, BarChart3, Wrench, LogOut, FlaskConical, X,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

const staffItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/equipment', label: 'Equipment', icon: Package },
  { to: '/bookings', label: 'New Booking', icon: CalendarCheck },
  { to: '/my-bookings', label: 'My Bookings', icon: ClipboardList },
  { to: '/returns', label: 'Returns', icon: Undo2 },
  { to: '/recommendations', label: 'AI Recommendations', icon: Sparkles },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/maintenance', label: 'Maintenance', icon: Wrench },
]

const studentItems = staffItems.slice(0, 5).concat(staffItems.slice(5))

export function Sidebar({ open, onClose }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const isStaff = user?.role === 'faculty' || user?.role === 'admin'
  const items = isStaff ? staffItems : studentItems

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <>
      {open && <div className="sidebar-overlay" onClick={onClose} />}
      <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-mark">
            <FlaskConical size={22} />
          </div>
          <div>
            <h1>LabMate AI</h1>
            <span>VFSTR Laboratory Suite</span>
          </div>
          <button className="sidebar-close" onClick={onClose} aria-label="Close menu">
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {items.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onClose}
              className={({ isActive }) => `nav-item ${isActive ? 'nav-active' : ''}`}
            >
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-chip">
            <div className="user-avatar">{(user?.name || 'U')[0].toUpperCase()}</div>
            <div className="user-meta">
              <strong>{user?.name}</strong>
              <span>{user?.role}</span>
            </div>
          </div>
          <button className="nav-item logout-btn" onClick={handleLogout}>
            <LogOut size={18} />
            <span>Logout</span>
          </button>
        </div>
      </aside>
    </>
  )
}
