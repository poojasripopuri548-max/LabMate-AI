import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { Package, PackageCheck, CalendarCheck, Clock, ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react'
import { StatCard, Spinner, EmptyState } from '../components/common/UI'
import { equipmentService } from '../services/equipmentService'
import { bookingService } from '../services/bookingService'
import { useAuth } from '../context/AuthContext'

export default function StudentDashboard() {
  const { user } = useAuth()
  const [equipment, setEquipment] = useState([])
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      equipmentService.getAll(),
      bookingService.getMyBookings().catch(() => []),
    ])
      .then(([eq, bk]) => { setEquipment(eq); setBookings(bk) })
      .catch(() => toast.error('Failed to load dashboard data'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Spinner />

  const now = new Date()
  const available = equipment.filter((e) => e.status === 'active' && e.condition === 'working')
  const pending = bookings.filter((b) => b.status === 'pending')
  const approved = bookings.filter((b) => b.status === 'approved')
  const issued = bookings.filter((b) => b.status === 'issued')
  const upcomingReturns = [...issued, ...approved]
    .filter((b) => new Date(b.endTime) >= now)
    .sort((a, b) => new Date(a.endTime) - new Date(b.endTime))
    .slice(0, 5)
  const recent = bookings.slice(0, 5)

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Welcome back, {user?.name?.split(' ')[0]}</h2>
          <p>Here's what's happening in your labs today.</p>
        </div>
        <div className="flex">
          <Link to="/equipment" className="btn btn-secondary btn-sm"><Package size={16} /> Browse Equipment</Link>
          <Link to="/bookings" className="btn btn-primary btn-sm"><CalendarCheck size={16} /> New Booking</Link>
        </div>
      </div>

      <div className="grid grid-4 mb-16">
        <StatCard icon={Package} label="Available Equipment" value={available.length} hint={`of ${equipment.length} total`} to="/equipment" />
        <StatCard icon={PackageCheck} label="Issued to Me" value={issued.length} hint="currently with you" to="/returns" />
        <StatCard icon={CalendarCheck} label="Active Bookings" value={approved.length} hint="approved & upcoming" to="/my-bookings" />
        <StatCard icon={Clock} label="Pending Requests" value={pending.length} hint="awaiting review" to="/my-bookings" />
        <StatCard icon={Sparkles} label="AI Recommendations" value="AI" hint="personalized picks" to="/recommendations" />
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="flex-between mb-16">
            <h3 className="card-title">Upcoming Returns</h3>
            <Link to="/returns" className="text-sm" style={{ color: 'var(--teal-600)', fontWeight: 600 }}>View all</Link>
          </div>
          {upcomingReturns.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="Nothing due" message="You have no approved bookings with upcoming return times." />
          ) : (
            upcomingReturns.map((b) => (
              <div key={b._id} className="flex-between" style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <strong>{b.equipment?.name || 'Equipment'}</strong>
                  <p className="text-sm text-muted">Qty {b.quantity} · ends {new Date(b.endTime).toLocaleString()}</p>
                </div>
                <span className="badge badge-warning">Due {new Date(b.endTime).toLocaleDateString()}</span>
              </div>
            ))
          )}
        </div>

        <div className="card">
          <div className="flex-between mb-16">
            <h3 className="card-title">Recent Bookings</h3>
            <Link to="/my-bookings" className="text-sm" style={{ color: 'var(--teal-600)', fontWeight: 600 }}>View all <ArrowRight size={13} /></Link>
          </div>
          {recent.length === 0 ? (
            <EmptyState icon={CalendarCheck} title="No bookings yet" message="Book your first piece of equipment to see it here." />
          ) : (
            recent.map((b) => (
              <div key={b._id} className="flex-between" style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <strong>{b.equipment?.name || 'Equipment'}</strong>
                  <p className="text-sm text-muted">{new Date(b.startTime).toLocaleDateString()} · {b.purpose?.slice(0, 40)}</p>
                </div>
                <span className={`badge badge-${b.status === 'approved' ? 'success' : b.status === 'pending' ? 'warning' : b.status === 'rejected' ? 'danger' : 'muted'}`}>{b.status}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
