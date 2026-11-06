import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-toastify'
import { ClipboardCheck, PackageCheck, AlertTriangle, Users, Wrench, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { StatCard, Spinner, EmptyState, ErrorState, StatusBadge } from '../components/common/UI'
import { equipmentService } from '../services/equipmentService'
import { bookingService } from '../services/bookingService'
import { damageService } from '../services/adminService'
import { useAuth } from '../context/AuthContext'

export default function FacultyDashboard() {
  const { user } = useAuth()
  const [equipment, setEquipment] = useState([])
  const [bookings, setBookings] = useState([])
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [rejecting, setRejecting] = useState(null)
  const [reason, setReason] = useState('')

  const load = () => {
    setLoading(true); setError(null)
    Promise.all([
      equipmentService.getAll(),
      bookingService.getAll().catch(() => []),
      damageService.getAll().catch(() => []),
    ])
      .then(([eq, bk, rp]) => { setEquipment(eq); setBookings(bk); setReports(rp) })
      .catch((e) => setError(e.response?.data?.message || 'Failed to load'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const stats = useMemo(() => {
    const now = new Date()
    const issued = bookings.filter((b) => b.status === 'issued')
    const overdue = issued.filter((b) => new Date(b.endTime) < now)
    return {
      total: bookings.length,
      pending: bookings.filter((b) => b.status === 'pending').length,
      approved: bookings.filter((b) => b.status === 'approved').length,
      issued: issued.length,
      overdue: overdue.length,
      activeReports: reports.filter((r) => !['repaired', 'closed'].includes(r.status)).length,
      available: equipment.filter((e) => e.status === 'active' && e.condition === 'working').length,
    }
  }, [bookings, equipment, reports])

  const pendingList = bookings.filter((b) => b.status === 'pending')
  const issuedList = bookings.filter((b) => b.status === 'issued')
    .sort((a, b) => new Date(a.endTime) - new Date(b.endTime))

  const review = async (id, status, rejectReason) => {
    try {
      await bookingService.review(id, status, rejectReason)
      toast.success(`Booking ${status}`)
      setRejecting(null); setReason('')
      load()
    } catch (e) {
      toast.error(e.response?.data?.message || 'Review failed')
    }
  }

  const issue = async (b) => {
    try {
      await bookingService.issue(b._id)
      toast.success('Equipment issued to student')
      load()
    } catch (e) {
      toast.error(e.response?.data?.message || 'Issue failed')
    }
  }

  const confirmReturn = async (b) => {
    const condition = window.prompt('Return condition (working / damaged / under_maintenance):', 'working')
    if (!condition) return
    try {
      await bookingService.confirmReturn(b._id, { condition, notes: 'Confirmed by faculty' })
      toast.success('Return confirmed')
      load()
    } catch (e) {
      toast.error(e.response?.data?.message || 'Return failed')
    }
  }

  if (loading) return <Spinner />
  if (error) return <ErrorState message={error} onRetry={load} />

  const now = new Date()

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Faculty Dashboard</h2>
          <p>Welcome, {user?.name?.split(' ')[0]} — supervise bookings, issues and lab activity.</p>
        </div>
        <div className="flex">
          <Link to="/analytics" className="btn btn-secondary btn-sm"><Search size={15} /> Analytics</Link>
          <Link to="/maintenance" className="btn btn-secondary btn-sm"><Wrench size={15} /> Maintenance</Link>
        </div>
      </div>

      <div className="grid grid-4 mb-16">
        <StatCard icon={ClipboardCheck} label="Pending Approvals" value={stats.pending} />
        <StatCard icon={PackageCheck} label="Issued Equipment" value={stats.issued} hint={`${stats.overdue} overdue`} />
        <StatCard icon={AlertTriangle} label="Overdue Returns" value={stats.overdue} />
        <StatCard icon={Wrench} label="Open Damage Reports" value={stats.activeReports} />
      </div>

      <div className="card mb-16">
        <h3 className="card-title">Booking Requests — Approval Queue</h3>
        <p className="card-sub">{stats.total} total requests · {stats.approved} approved · {stats.pending} awaiting review.</p>
        {pendingList.length === 0 ? (
          <EmptyState title="Queue clear" message="No pending booking requests." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Student</th><th>Equipment</th><th>Period</th><th>Qty</th><th>Purpose</th><th>Actions</th></tr></thead>
              <tbody>
                {pendingList.map((b) => (
                  <tr key={b._id}>
                    <td>{b.user?.name || '—'}<br /><span className="text-sm text-muted">{b.user?.email}</span></td>
                    <td>{b.equipment?.name || '—'}{b.collectionLocation && <><br /><span className="text-sm" style={{ color: 'var(--teal-600)' }}>{b.collectionLocation}</span></>}</td>
                    <td className="text-sm">{new Date(b.startTime).toLocaleString()} → {new Date(b.endTime).toLocaleString()}</td>
                    <td>{b.quantity}</td>
                    <td className="text-sm">{b.purpose}</td>
                    <td>
                      {rejecting === b._id ? (
                        <div className="flex">
                          <input className="form-control" style={{ width: 160, padding: '6px 10px', fontSize: 12.5 }} placeholder="Rejection reason" value={reason} onChange={(e) => setReason(e.target.value)} />
                          <button className="btn btn-danger btn-sm" onClick={() => review(b._id, 'rejected', reason)}>Confirm</button>
                          <button className="btn btn-secondary btn-sm" onClick={() => { setRejecting(null); setReason('') }}>Cancel</button>
                        </div>
                      ) : (
                        <div className="flex">
                          <button className="btn btn-teal btn-sm" onClick={() => review(b._id, 'approved')}>Approve</button>
                          <button className="btn btn-danger btn-sm" onClick={() => setRejecting(b._id)}>Reject</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card mb-16">
        <h3 className="card-title">Issued Equipment — Student Monitoring</h3>
        <p className="card-sub">Equipment currently with students. Issue approved bookings and confirm returns here.</p>
        {issuedList.length === 0 ? (
          <EmptyState icon={Users} title="Nothing issued" message="Approved bookings awaiting issue will appear here." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Student</th><th>Equipment</th><th>Issued At</th><th>Due</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {issuedList.map((b) => {
                  const overdue = new Date(b.endTime) < now
                  return (
                    <tr key={b._id}>
                      <td>{b.user?.name || '—'}<br /><span className="text-sm text-muted">{b.user?.email}</span></td>
                      <td>{b.equipment?.name || '—'} ×{b.quantity}{b.collectionLocation && <><br /><span className="text-sm" style={{ color: 'var(--teal-600)' }}>{b.collectionLocation}</span></>}</td>
                      <td className="text-sm">{b.issuedAt ? new Date(b.issuedAt).toLocaleString() : '—'}</td>
                      <td className="text-sm">{new Date(b.endTime).toLocaleString()}</td>
                      <td>{overdue ? <StatusBadge status="rejected" /> : <StatusBadge status="issued" />}{overdue && <span className="text-sm" style={{ color: 'var(--danger)' }}> overdue</span>}</td>
                      <td>
                        <div className="flex">
                          {b.returnRequestedAt && (
                            <button className="btn btn-teal btn-sm" onClick={() => confirmReturn(b)}>Confirm Return</button>
                          )}
                          {!b.returnRequestedAt && new Date(b.startTime) <= now && (
                            <button className="btn btn-secondary btn-sm" onClick={() => confirmReturn(b)}>Return</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {bookings.filter((b) => b.status === 'approved').length > 0 && (
          <>
            <h4 className="mt-24 mb-16">Approved — ready to issue</h4>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Student</th><th>Equipment</th><th>Period</th><th>Actions</th></tr></thead>
                <tbody>
                  {bookings.filter((b) => b.status === 'approved').map((b) => (
                    <tr key={b._id}>
                      <td>{b.user?.name || '—'}</td>
                      <td>{b.equipment?.name || '—'} ×{b.quantity}</td>
                      <td className="text-sm">{new Date(b.startTime).toLocaleString()} → {new Date(b.endTime).toLocaleString()}</td>
                      <td><button className="btn btn-teal btn-sm" onClick={() => issue(b)}>Issue Equipment</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h3 className="card-title">Damage & Maintenance Reports</h3>
        <p className="card-sub">Reports submitted by students and staff — manage them under Maintenance.</p>
        {reports.length === 0 ? (
          <EmptyState icon={Wrench} title="No reports" message="Damage reports will appear here." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Equipment</th><th>Reported By</th><th>Description</th><th>Priority</th><th>Status</th></tr></thead>
              <tbody>
                {reports.slice(0, 10).map((r) => (
                  <tr key={r._id}>
                    <td>{r.equipment?.name || '—'}</td>
                    <td className="text-sm">{r.reportedBy?.name || '—'}</td>
                    <td className="text-sm">{r.description?.slice(0, 60)}{r.description?.length > 60 ? '…' : ''}</td>
                    <td><StatusBadge status={r.priority === 'high' ? 'High' : r.priority === 'medium' ? 'Medium' : 'Low'} /></td>
                    <td><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Link to="/maintenance" className="btn btn-secondary btn-sm mt-16">Open Maintenance Manager</Link>
      </div>
    </div>
  )
}
