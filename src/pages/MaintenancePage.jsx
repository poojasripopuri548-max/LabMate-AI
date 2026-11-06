import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-toastify'
import { Wrench, AlertTriangle, Plus, X } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { Spinner, EmptyState, ErrorState, StatusBadge } from '../components/common/UI'
import { recommendationService } from '../services/recommendationService'
import { equipmentService } from '../services/equipmentService'
import { damageService, maintenanceService } from '../services/adminService'
import { useAuth } from '../context/AuthContext'

const RECORD_STATUSES = ['reported', 'pending', 'under_maintenance', 'repaired', 'closed']

function RecordModal({ equipment, equipmentList, onClose, onSaved }) {
  const [form, setForm] = useState({ equipment: equipment?._id || '', title: '', description: '', priority: 'medium' })
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await maintenanceService.create(form)
      toast.success('Maintenance request created')
      onSaved(); onClose()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create')
    } finally { setSaving(false) }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="flex-between mb-16"><h3>New Maintenance Request</h3><button className="icon-btn" onClick={onClose}><X size={18} /></button></div>
        <form onSubmit={submit}>
          <div className="form-group">
            <label>Equipment *</label>
            <select className="form-control" value={form.equipment} onChange={set('equipment')} disabled={!!equipment}>
              <option value="">Select equipment…</option>
              {(equipment ? [equipment] : equipmentList).map((e) => (
                <option key={e._id} value={e._id}>{e.name} — {e.laboratory?.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Title *</label>
            <input className="form-control" value={form.title} onChange={set('title')} placeholder="e.g. Replace oscilloscope probe" />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea className="form-control" rows="3" value={form.description} onChange={set('description')} />
          </div>
          <div className="form-group">
            <label>Priority</label>
            <select className="form-control" value={form.priority} onChange={set('priority')}>
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
            </select>
          </div>
          <div className="flex" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Create'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function MaintenancePage() {
  const { user } = useAuth()
  const canManage = user?.role === 'faculty' || user?.role === 'admin'
  const isAdmin = user?.role === 'admin'
  const [tab, setTab] = useState('records')
  const [analysis, setAnalysis] = useState(null)
  const [equipment, setEquipment] = useState([])
  const [records, setRecords] = useState([])
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [modal, setModal] = useState(false)
  const [updating, setUpdating] = useState(null)

  const load = () => {
    setLoading(true); setError(null)
    Promise.all([
      recommendationService.getMaintenanceAnalysis().catch(() => null),
      equipmentService.getAll().catch(() => []),
      maintenanceService.getAll().catch(() => []),
      damageService.getAll().catch(() => []),
    ])
      .then(([a, eq, rec, rep]) => { setAnalysis(a); setEquipment(eq); setRecords(rec); setReports(rep) })
      .catch((e) => setError(e.response?.data?.message || 'Failed to load'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const updateRecord = async (r, patch) => {
    setUpdating(r._id)
    try {
      await maintenanceService.update(r._id, patch)
      toast.success('Record updated')
      load()
    } catch (e) {
      toast.error(e.response?.data?.message || 'Update failed — check your role permissions')
    } finally { setUpdating(null) }
  }

  const updateReport = async (r, patch) => {
    setUpdating(r._id)
    try {
      await damageService.update(r._id, patch)
      toast.success('Report updated')
      load()
    } catch (e) {
      toast.error(e.response?.data?.message || 'Update failed')
    } finally { setUpdating(null) }
  }

  const summary = analysis?.summary
  const maintChart = useMemo(() => {
    if (!records.length) return []
    const c = {}
    records.forEach((r) => { c[r.status] = (c[r.status] || 0) + 1 })
    return Object.entries(c).map(([name, value]) => ({ name: name.replace(/_/g, ' '), value }))
  }, [records])

  if (loading) return <Spinner label="Loading maintenance data…" />
  if (error) return <ErrorState message={error} onRetry={load} />

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Maintenance Management</h2>
          <p>AI-prioritized analysis plus live maintenance records and damage reports.</p>
        </div>
        {canManage && (
          <button className="btn btn-primary btn-sm" onClick={() => setModal(true)}><Plus size={16} /> New Request</button>
        )}
      </div>

      <div className="tabs">
        <button className={`tab-btn ${tab === 'records' ? 'active' : ''}`} onClick={() => setTab('records')}>Maintenance Records ({records.length})</button>
        <button className={`tab-btn ${tab === 'reports' ? 'active' : ''}`} onClick={() => setTab('reports')}>Damage Reports ({reports.length})</button>
        <button className={`tab-btn ${tab === 'ai' ? 'active' : ''}`} onClick={() => setTab('ai')}>AI Priority Analysis</button>
      </div>

      {tab === 'records' && (
        <div className="card">
          {records.length === 0 ? (
            <EmptyState icon={Wrench} title="No maintenance records" message="Damage reports and manual requests will appear here." />
          ) : (
            <>
              <div className="chart-box mb-16" style={{ padding: 14 }}>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={maintChart}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#163a63" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Equipment</th><th>Title</th><th>Priority</th><th>Status</th><th>Reported By</th><th>{canManage ? 'Update Status' : ''}</th></tr></thead>
                  <tbody>
                    {records.map((r) => (
                      <tr key={r._id}>
                        <td><strong>{r.equipment?.name || '—'}</strong><br /><span className="text-sm text-muted">{r.equipment?.condition} / {r.equipment?.status}</span></td>
                        <td className="text-sm">{r.title}<br /><span className="text-muted">{r.description?.slice(0, 50)}</span></td>
                        <td><StatusBadge status={r.priority === 'high' ? 'High' : r.priority === 'medium' ? 'Medium' : 'Low'} /></td>
                        <td><StatusBadge status={r.status} /></td>
                        <td className="text-sm">{r.reportedBy?.name || '—'}</td>
                        <td>
                          {canManage && (
                            <select className="form-control" style={{ width: 'auto', padding: '6px 10px', fontSize: 12.5 }}
                              value={r.status} disabled={updating === r._id}
                              onChange={(e) => updateRecord(r, { status: e.target.value })}>
                              {RECORD_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                            </select>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'reports' && (
        <div className="card">
          {reports.length === 0 ? (
            <EmptyState icon={AlertTriangle} title="No damage reports" message="Student-submitted damage reports will appear here." />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Equipment</th><th>Reported By</th><th>Description</th><th>Priority</th><th>Status</th>{canManage && <th>Update</th>}</tr></thead>
                <tbody>
                  {reports.map((r) => (
                    <tr key={r._id}>
                      <td>{r.equipment?.name || '—'}</td>
                      <td className="text-sm">{r.reportedBy?.name || '—'}<br /><span className="text-muted">{r.reportedBy?.email}</span></td>
                      <td className="text-sm">{r.description}</td>
                      <td><StatusBadge status={r.priority === 'high' ? 'High' : r.priority === 'medium' ? 'Medium' : 'Low'} /></td>
                      <td><StatusBadge status={r.status} /></td>
                      {canManage && (
                        <td>
                          <select className="form-control" style={{ width: 'auto', padding: '6px 10px', fontSize: 12.5 }}
                            value={r.status} disabled={updating === r._id}
                            onChange={(e) => updateReport(r, { status: e.target.value })}>
                            {RECORD_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                          </select>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'ai' && (
        <>
          {summary && (
            <div className="grid grid-4 mb-16">
              <div className="stat-card"><div className="stat-icon"><Wrench size={22} /></div>
                <div><p className="stat-label">Total Equipment</p><p className="stat-value">{summary.total_equipment}</p></div></div>
              <div className="stat-card"><div className="stat-icon" style={{ background: 'linear-gradient(135deg,#dc2626,#f87171)' }}><AlertTriangle size={22} /></div>
                <div><p className="stat-label">High Priority</p><p className="stat-value">{summary.high_count}</p></div></div>
              <div className="stat-card"><div className="stat-icon teal"><Wrench size={22} /></div>
                <div><p className="stat-label">Medium Priority</p><p className="stat-value">{summary.medium_count}</p></div></div>
              <div className="stat-card"><div className="stat-icon"><Wrench size={22} /></div>
                <div><p className="stat-label">Mean Score</p><p className="stat-value">{summary.mean_priority_score ?? '—'}</p></div></div>
            </div>
          )}

          <div className="card mb-16">
            <h3 className="card-title">Immediate Attention</h3>
            <p className="card-sub">Top-scored equipment by the explainable maintenance model.</p>
            {(analysis?.immediate_attention || []).length === 0 ? (
              <EmptyState icon={Wrench} title="All clear" message="No equipment flagged for immediate attention." />
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Rank</th><th>Equipment</th><th>Score</th><th>Priority</th><th>Status</th><th>Severity</th></tr></thead>
                  <tbody>
                    {analysis.immediate_attention.slice(0, 15).map((r) => (
                      <tr key={r.rank}>
                        <td>{r.rank}</td>
                        <td><strong>{r.equipment_name}</strong></td>
                        <td>{r.priority_score}</td>
                        <td><StatusBadge status={r.priority} /></td>
                        <td className="text-sm">{r.maintenance_status || '—'}</td>
                        <td className="text-sm">{r.severity || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <p className="ai-disclaimer">{analysis?.scoring_method?.description || 'Condition-based explainable scoring — not a trained failure prediction model.'}</p>
        </>
      )}

      {modal && <RecordModal equipment={null} equipmentList={equipment} onClose={() => setModal(false)} onSaved={load} />}
    </div>
  )
}
