import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { NotificationBell } from './NotificationBell'
import { AssistantWidget } from './AssistantWidget'
import { useAuth } from '../../context/AuthContext'

const titles = {
  '/dashboard': 'Dashboard',
  '/equipment': 'Equipment',
  '/bookings': 'New Booking',
  '/my-bookings': 'My Bookings',
  '/returns': 'Returns',
  '/recommendations': 'AI Recommendations',
  '/analytics': 'Analytics',
  '/maintenance': 'Maintenance',
  '/assistant': 'AI Assistant',
}

export function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { pathname } = useLocation()
  const { user } = useAuth()
  const title =
    pathname.startsWith('/equipment/') ? 'Equipment Details' : titles[pathname] || 'LabMate AI'

  return (
    <div className="app-shell">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="app-main">
        <header className="topbar">
          <button className="icon-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
            <Menu size={22} />
          </button>
          <div style={{ flex: 1 }}>
            <h2>{title}</h2>
            <p>Welcome back, {user?.name?.split(' ')[0]}</p>
          </div>
          <NotificationBell />
        </header>
        <main className="page-content">
          <Outlet />
        </main>
        <AssistantWidget />
      </div>
    </div>
  )
}
