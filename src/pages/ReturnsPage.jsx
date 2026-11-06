import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-toastify'
import { Undo2, PackageCheck, History, AlertTriangle, Send } from 'lucide-react'
import { Spinner, EmptyState, ErrorState, StatusBadge } from '../components/common/UI'
import { bookingService } from '../services/bookingService'
import { damageService } from '../services/adminService'
import { useAuth } from '../context/AuthContext'

function DamageModal({ equipment, bookingId, onClose, onSaved }) {
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('medium')
  const [saving, setSaving] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (description.trim().length < 5) { toast.error('Describe the problem (min 5 characters)'); return }
    setSaving(true)
    try {
      await damageService.create({ equipment: equipment._id, booking: bookingId, description: description.trim(), priority })
      toast.success('Damage report submitted')
      onSaved(); onClose()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit report')
    } finally { setSaving(false) }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <h3 className="mb-16">Report Damage — {equipment.name}</h3>
        <form onSubmit={submit}>
          <div className="form-group">
            <label>Problem description *</label>
            <textarea className="form-control" rows="4" value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Oscilloscope screen flickers and probe port is loose" />
          </div>
          <div className="form-group">
            <label>Priority</label>
            <select className="form-control" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div className="flex" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-danger" disabled={saving}><Send size={15} /> {saving ? 'Submitting…' : 'Submit Report'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function ReturnsPage() {
  const { user } = useAuth()
  const isStaff = user?.role === 'faculty' || user?.role === 'admin'
  const [bookings, setBookings] = useState([])
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [damageTarget, setDamageTarget] = useState(null)
  const [busy, setBusy] = useState(null)

  const load = () => {
    setLoading(true); setError(null)
    const calls = [bookingService.getMyBookings()]
    calls.push(damageService.getAll().catch(() => []))
    Promise.all(calls)
      .then(([bk, rp]) => { setBookings(bk); setReports(rp) })
      .catch((e) => setError(e.response?.data?.message || 'Failed to load returns'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const { issued, approvedUpcoming, returned } = useMemo(() => {
    const now = new Date()
    return {
      issued: bookings.filter((b) => b.status === 'issued'),
      approvedUpcoming: bookings.filter((b) => b.status === 'approved'),
      returned: bookings.filter((b) => ['completed', 'rejected', 'cancelled'].includes(b.status) || (b.status === 'approved' && new Date(b.endTime) < now)),
    }
  }, [bookings])

  const requestReturn = async (b) => {
    setBusy(b._id)
    try {
      await bookingService.requestReturn(b._id)
      toast.success('Return requested — staff will confirm')
      load()
    } catch (e) {
      toast.error(e.response?.data?.message || 'Request failed')
    } finally { setBusy(null) }
  }

  const confirmReturn = async (b) => {
    const condition = window.prompt('Return condition — working / damaged / under_maintenance:', 'working')
    if (!condition) return
    setBusy(b._id)
    try {
      await bookingService.confirmReturn(b._id, { condition, notes: 'Confirmed at returns desk' })
      toast.success('Return confirmed')
      load()
    } catch (e) {
      toast.error(e.response?.data?.message || 'Confirm failed')
    } finally { setBusy(null) }
  }

  const now = new Date()

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Issue & Returns</h2>
          <p>{isStaff ? 'Issue approved equipment and confirm returns.' : 'Track issued equipment, request returns and report damage.'}</p>
        </div>
      </div>

      {loading ? <Spinner /> : error ? <ErrorState message={error} onRetry={load} /> : (
        <>
          <div className="card mb-16">
            <h3 className="card-title flex"><PackageCheck size={18} /> Currently Issued</h3>
            <p className="card-sub">Equipment handed out and awaiting return.</p>
            {issued.length === 0 ? (
              <EmptyState icon={PackageCheck} title="Nothing issued" message="Issued equipment will appear here." />
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Equipment</th><th>User</th><th>Issued</th><th>Due</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {issued.map((b) => {
                      const overdue = new Date(b.endTime) < now
                      return (
                        <tr key={b._id}>
                          <td><strong>{b.equipment?.name || '—'}</strong><br /><span className="text-sm text-muted">{b.equipment?.laboratory?.name}</span></td>
                          <td className="text-sm">{isStaff ? (b.user?.name || '—') : 'You'} ×{b.quantity}</td>
                          <td className="text-sm">{b.issuedAt ? new Date(b.issuedAt).toLocaleString() : '—'}</td>
                          <td className="text-sm">{new Date(b.endTime).toLocaleString()}</td>
                          <td>
                            {overdue ? <StatusBadge status="rejected" /> : <StatusBadge status="issued" />}
                            {overdue && <span className="text-sm" style={{ color: 'var(--danger)', marginLeft: 6 }}>overdue</span>}
                            {b.returnRequestedAt && !overdue && <span className="badge badge-warning" style={{ marginLeft: 6 }}>return requested</span>}
                          </td>
                          <td>
                            <div className="flex">
                              {!isStaff && !b.returnRequestedAt && (
                                <button className="btn btn-teal btn-sm" disabled={busy === b._id} onClick={() => requestReturn(b)}>
                                  <Undo2 size={14} /> Request Return
                                </button>
                              )}
                              {!isStaff && (
                                <button className="btn btn-danger btn-sm" onClick={() => setDamageTarget({ equipment: b.equipment, bookingId: b._id })}>
                                  <AlertTriangle size={14} /> Damage
                                </button>
                              )}
                              {isStaff && (
                                <button className="btn btn-teal btn-sm" disabled={busy === b._id} onClick={() => confirmReturn(b)}>
                                  Confirm Return
                                </button>
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
          </div>

          <div className="card mb-16">
            <h3 className="card-title">Approved — Awaiting Issue</h3>
            <p className="card-sub">Bookings approved by faculty, ready to be issued by staff.</p>
            {approvedUpcoming.length === 0 ? (
              <EmptyState title="None" message="No approved bookings waiting." />
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Equipment</th><th>Period</th><th>Qty</th><th>Status</th></tr></thead>
                  <tbody>
                    {approvedUpcoming.map((b) => (
                      <tr key={b._id}>
                        <td><strong>{b.equipment?.name || '—'}</strong></td>
                        <td className="text-sm">{new Date(b.startTime).toLocaleString()} → {new Date(b.endTime).toLocaleString()}</td>
                        <td>{b.quantity}</td>
                        <td><StatusBadge status="approved" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card mb-16">
            <h3 className="card-title flex"><AlertTriangle size={18} /> My Damage Reports</h3>
            <p className="card-sub">{isStaff ? 'All damage reports in the system.' : 'Reports you have submitted.'}</p>
            {reports.length === 0 ? (
              <EmptyState icon={AlertTriangle} title="No reports" message="Damage reports you submit will appear here." />
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Equipment</th><th>{isStaff ? 'Reported By' : 'Submitted'}</th><th>Description</th><th>Priority</th><th>Status</th></tr></thead>
                  <tbody>
                    {reports.map((r) => (
                      <tr key={r._id}>
                        <td>{r.equipment?.name || '—'}</td>
                        <td className="text-sm">{isStaff ? (r.reportedBy?.name || '—') : new Date(r.createdAt).toLocaleDateString()}</td>
                        <td className="text-sm">{r.description?.slice(0, 70)}{r.description?.length > 70 ? '…' : ''}</td>
                        <td><StatusBadge status={r.priority === 'high' ? 'High' : r.priority === 'medium' ? 'Medium' : 'Low'} /></td>
                        <td><StatusBadge status={r.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <h3 className="card-title flex"><History size={18} /> Return History</h3>
            {returned.length === 0 ? (
              <EmptyState title="No history" message="Completed returns will appear here." />
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Equipment</th><th>Period</th><th>Return Condition</th><th>Status</th></tr></thead>
                  <tbody>
                    {returned.map((b) => (
                      <tr key={b._id}>
                        <td><strong>{b.equipment?.name || '—'}</strong></td>
                        <td className="text-sm">{new Date(b.startTime).toLocaleDateString()} → {new Date(b.endTime).toLocaleDateString()}</td>
                        <td>{b.returnCondition ? <StatusBadge status={b.returnCondition} /> : '—'}</td>
                        <td><StatusBadge status={b.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {damageTarget && (
        <DamageModal
          equipment={damageTarget.equipment}
          bookingId={damageTarget.bookingId}
          onClose={() => setDamageTarget(null)}
          onSaved={load}
        />
      )}
    </div>
  )
}
