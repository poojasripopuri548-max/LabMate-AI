import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { Package, Plus, Pencil, Trash2, Search, Users, LogIn, History, UserPlus, UserX, UserCheck } from 'lucide-react'
import { StatCard, Spinner, EmptyState, ErrorState, StatusBadge } from '../components/common/UI'
import { equipmentService } from '../services/equipmentService'
import { bookingService } from '../services/bookingService'
import { authService } from '../services/authService'
import { userService } from '../services/adminService'
import { useAuth } from '../context/AuthContext'
import EquipmentFormModal from '../components/equipment/EquipmentFormModal'

const BOOKING_TABS = ['All', 'Pending', 'Approved', 'Rejected', 'Cancelled', 'Completed']

export default function AdminDashboard() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [equipment, setEquipment] = useState([])
  const [bookings, setBookings] = useState([])
  const [activity, setActivity] = useState([])
  const [users, setUsers] = useState([])
  const [showUserForm, setShowUserForm] = useState(false)
  const [userForm, setUserForm] = useState({ name: '', email: '', password: '', role: 'student', facultyId: '', department: '', designation: '' })
  const [creatingUser, setCreatingUser] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [modal, setModal] = useState(null)
  const [bookingTab, setBookingTab] = useState('All')

  const load = () => {
    setLoading(true); setError(null)
    const calls = [
      equipmentService.getAll(),
      bookingService.getAll().catch(() => []),
    ]
    if (isAdmin) calls.push(authService.getActivity().catch(() => []), userService.getAll().catch(() => []))
    Promise.all(calls)
      .then(([eq, bk, act, usr]) => { setEquipment(eq); setBookings(bk); if (act) setActivity(act); if (usr) setUsers(usr) })
      .catch((e) => setError(e.response?.data?.message || 'Failed to load'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const stats = useMemo(() => {
    const total = equipment.length
    const available = equipment.filter((e) => e.status === 'active' && e.condition === 'working').length
    const flagged = equipment.filter((e) => e.condition !== 'working' || e.status !== 'active').length
    const counts = { pending: 0, approved: 0, rejected: 0, cancelled: 0, completed: 0 }
    bookings.forEach((b) => { if (counts[b.status] !== undefined) counts[b.status]++ })
    return { total, available, flagged, counts, pendingList: bookings.filter((b) => b.status === 'pending') }
  }, [equipment, bookings])

  const bookingCounts = useMemo(() => {
    const c = { All: bookings.length }
    BOOKING_TABS.slice(1).forEach((t) => { c[t] = bookings.filter((b) => b.status === t.toLowerCase()).length })
    return c
  }, [bookings])

  const visibleBookings = useMemo(() =>
    bookingTab === 'All' ? bookings : bookings.filter((b) => b.status === bookingTab.toLowerCase()),
  [bookings, bookingTab])

  const review = async (id, status) => {
    try {
      await bookingService.review(id, status)
      toast.success(`Booking ${status}`)
      load()
    } catch (e) {
      toast.error(e.response?.data?.message || 'Review failed')
    }
  }

  const createUser = async (e) => {
    e.preventDefault()
    setCreatingUser(true)
    try {
      await userService.create(userForm)
      toast.success('User account created')
      setShowUserForm(false)
      setUserForm({ name: '', email: '', password: '', role: 'student', facultyId: '', department: '', designation: '' })
      load()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create user')
    } finally { setCreatingUser(false) }
  }

  const updateUser = async (u, patch) => {
    try {
      await userService.update(u._id, patch)
      toast.success('User updated')
      load()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update failed')
    }
  }

  const remove = async (eq) => {
    if (!window.confirm(`Delete "${eq.name}"? This cannot be undone.`)) return
    try {
      await equipmentService.remove(eq._id)
      toast.success('Equipment deleted')
      load()
    } catch (e) {
      toast.error(e.response?.data?.message || 'Delete failed')
    }
  }

  if (loading) return <Spinner />
  if (error) return <ErrorState message={error} onRetry={load} />

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>{isAdmin ? 'Admin' : 'Faculty'} Dashboard</h2>
          <p>Manage equipment, review booking requests and monitor labs.</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setModal('create')}><Plus size={16} /> Add Equipment</button>
      </div>

      <div className="grid grid-4 mb-16">
        <StatCard icon={Package} label="Total Equipment" value={stats.total} hint={`${stats.available} available`} />
        <StatCard icon={Package} label="Flagged / Maintenance" value={stats.flagged} />
        <StatCard icon={History} label="Total Bookings" value={bookings.length} hint={`${stats.counts.pending} pending review`} />
        <StatCard icon={Users} label="Registered Users" value={isAdmin ? activity.length : '—'} hint={isAdmin ? 'see activity below' : undefined} />
      </div>

      <div className="card mb-16">
        <h3 className="card-title">Pending Booking Requests</h3>
        <p className="card-sub">Approve or reject student booking requests.</p>
        {stats.pendingList.length === 0 ? (
          <EmptyState title="No pending requests" message="All booking requests have been reviewed." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Equipment</th><th>User</th><th>Period</th><th>Purpose</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {stats.pendingList.map((b) => (
                  <tr key={b._id}>
                    <td>{b.equipment?.name || '—'}</td>
                    <td>{b.user?.name || '—'}<br /><span className="text-sm text-muted">{b.user?.email}</span></td>
                    <td className="text-sm">{new Date(b.startTime).toLocaleString()} → {new Date(b.endTime).toLocaleString()}</td>
                    <td className="text-sm">{b.purpose}</td>
                    <td><StatusBadge status={b.status} /></td>
                    <td>
                      <div className="flex">
                        <button className="btn btn-teal btn-sm" onClick={() => review(b._id, 'approved')}>Approve</button>
                        <button className="btn btn-danger btn-sm" onClick={() => review(b._id, 'rejected')}>Reject</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card mb-16">
        <div className="flex-between mb-16">
          <div>
            <h3 className="card-title">Booking History</h3>
            <p className="card-sub">{bookings.length} total bookings — {stats.counts.approved} approved, {stats.counts.completed} completed, {stats.counts.rejected} rejected, {stats.counts.cancelled} cancelled.</p>
          </div>
        </div>
        <div className="tabs">
          {BOOKING_TABS.map((t) => (
            <button key={t} className={`tab-btn ${bookingTab === t ? 'active' : ''}`} onClick={() => setBookingTab(t)}>
              {t} ({bookingCounts[t]})
            </button>
          ))}
        </div>
        {visibleBookings.length === 0 ? (
          <EmptyState icon={History} title="No bookings" message={`No ${bookingTab.toLowerCase()} bookings found.`} />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Booking</th><th>Equipment</th><th>User</th><th>Period</th><th>Qty</th><th>Status</th></tr></thead>
              <tbody>
                {visibleBookings.slice(0, 25).map((b) => (
                  <tr key={b._id}>
                    <td className="equip-id">#{b._id.slice(-6)}</td>
                    <td>{b.equipment?.name || '—'}</td>
                    <td className="text-sm">{b.user?.name || '—'}<br /><span className="text-muted">{b.user?.email}</span></td>
                    <td className="text-sm">{new Date(b.startTime).toLocaleString()} → {new Date(b.endTime).toLocaleString()}</td>
                    <td>{b.quantity}</td>
                    <td><StatusBadge status={b.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {visibleBookings.length > 25 && <p className="text-sm text-muted mt-16">Showing latest 25 of {visibleBookings.length}.</p>}
      </div>

      {isAdmin && (
        <div className="card mb-16">
          <div className="flex-between mb-16">
            <div>
              <h3 className="card-title">User Management</h3>
              <p className="card-sub">{users.length} registered accounts — create users and manage roles.</p>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => setShowUserForm(!showUserForm)}>
              <UserPlus size={15} /> Add User
            </button>
          </div>

          {showUserForm && (
            <form onSubmit={createUser} className="card" style={{ background: 'var(--bg)', marginBottom: 16 }}>
              <div className="form-row">
                <div className="form-group"><label>Name *</label>
                  <input className="form-control" value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} /></div>
                <div className="form-group"><label>Email *</label>
                  <input className="form-control" type="email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Password * (min 8)</label>
                  <input className="form-control" type="password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} /></div>
                <div className="form-group"><label>Role *</label>
                  <select className="form-control" value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}>
                    <option value="student">Student</option>
                    <option value="faculty">Faculty</option>
                    <option value="admin">Admin</option>
                  </select></div>
              </div>
              {userForm.role === 'faculty' && (
                <div className="form-row">
                  <div className="form-group"><label>Faculty / Employee ID</label>
                    <input className="form-control" value={userForm.facultyId} onChange={(e) => setUserForm({ ...userForm, facultyId: e.target.value })} placeholder="e.g. FAC-1024" /></div>
                  <div className="form-group"><label>Department</label>
                    <input className="form-control" value={userForm.department} onChange={(e) => setUserForm({ ...userForm, department: e.target.value })} /></div>
                  <div className="form-group"><label>Designation</label>
                    <input className="form-control" value={userForm.designation} onChange={(e) => setUserForm({ ...userForm, designation: e.target.value })} placeholder="e.g. Associate Professor" /></div>
                </div>
              )}
              <div className="flex" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowUserForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={creatingUser}>{creatingUser ? 'Creating…' : 'Create Account'}</button>
              </div>
            </form>
          )}

          {users.length === 0 ? (
            <EmptyState title="No users" message="Registered users will appear here." />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u._id}>
                      <td><strong>{u.name}</strong></td>
                      <td className="text-sm">{u.email}</td>
                      <td>
                        <select className="form-control" style={{ width: 'auto', padding: '5px 10px', fontSize: 12.5 }}
                          value={u.role} onChange={(e) => updateUser(u, { role: e.target.value })}>
                          <option value="student">student</option>
                          <option value="faculty">faculty</option>
                          <option value="admin">admin</option>
                        </select>
                      </td>
                      <td>{u.isActive === false ? <StatusBadge status="rejected" /> : <StatusBadge status="active" />}</td>
                      <td className="text-sm">{new Date(u.createdAt).toLocaleDateString()}</td>
                      <td>
                        <button className="btn btn-sm"
                          style={u.isActive === false ? {} : { background: '#fef2f2', color: 'var(--danger)', border: '1px solid #fecaca' }}
                          onClick={() => updateUser(u, { isActive: u.isActive === false })}>
                          {u.isActive === false ? <><UserCheck size={14} /> Activate</> : <><UserX size={14} /> Deactivate</>}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {isAdmin && (
        <div className="card mb-16">
          <h3 className="card-title flex"><Users size={18} /> User Login Activity</h3>
          <p className="card-sub">Sign-in and sign-out events recorded by the backend.</p>
          {activity.length === 0 ? (
            <EmptyState title="No users" message="Registered users will appear here." />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>User</th><th>Role</th><th>Logins</th><th>Logouts</th><th>Last Login</th><th>Last Activity</th></tr></thead>
                <tbody>
                  {activity.map((u) => (
                    <tr key={u.id}>
                      <td><strong>{u.name}</strong><br /><span className="text-sm text-muted">{u.email}</span></td>
                      <td><StatusBadge status={u.role} /></td>
                      <td><span className="flex"><LogIn size={14} /> {u.loginCount}</span></td>
                      <td>{u.logoutCount}</td>
                      <td className="text-sm">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}</td>
                      <td className="text-sm">{u.lastActivityAt ? new Date(u.lastActivityAt).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <div className="flex-between mb-16">
          <div>
            <h3 className="card-title">Equipment Inventory</h3>
            <p className="card-sub">{stats.total} items across all laboratories.</p>
          </div>
          <Link to="/equipment" className="btn btn-secondary btn-sm"><Search size={15} /> View Catalog</Link>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Category</th><th>Lab</th><th>Qty</th><th>Condition</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {equipment.slice(0, 12).map((eq) => (
                <tr key={eq._id}>
                  <td><strong>{eq.name}</strong><br /><span className="equip-id">{eq._id.slice(-6)}</span></td>
                  <td>{eq.category}</td>
                  <td className="text-sm">{eq.laboratory?.name || '—'}</td>
                  <td>{eq.totalQuantity}</td>
                  <td><StatusBadge status={eq.condition} /></td>
                  <td><StatusBadge status={eq.status} /></td>
                  <td>
                    <div className="flex">
                      <button className="icon-btn" title="Edit" onClick={() => setModal(eq)}><Pencil size={15} /></button>
                      <button className="icon-btn" title="Delete" onClick={() => remove(eq)}><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && <EquipmentFormModal equipment={modal === 'create' ? null : modal} onClose={() => setModal(null)} onSaved={load} />}
    </div>
  )
}
