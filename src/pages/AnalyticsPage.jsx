import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-toastify'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { BarChart3 } from 'lucide-react'
import { Spinner, EmptyState, ErrorState } from '../components/common/UI'
import { recommendationService } from '../services/recommendationService'

const COLORS = ['#0d9488', '#163a63', '#14b8a6', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b']

export default function AnalyticsPage() {
  const [usage, setUsage] = useState(null)
  const [maintenance, setMaintenance] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = () => {
    setLoading(true); setError(null)
    Promise.all([
      recommendationService.getUsageAnalysis(),
      recommendationService.getMaintenanceAnalysis(),
    ])
      .then(([u, m]) => { setUsage(u); setMaintenance(m) })
      .catch((e) => setError(e.response?.data?.message || 'Analytics service unavailable'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const topUsage = useMemo(() =>
    (usage?.equipment || []).slice(0, 8).map((e) => ({
      name: e.equipment_name?.length > 22 ? e.equipment_name.slice(0, 22) + '…' : e.equipment_name,
      usage: e.usage_count,
      utilization: e.utilization_pct ?? 0,
    })), [usage])

  const classDist = useMemo(() => {
    if (!usage?.equipment) return []
    const counts = {}
    usage.equipment.forEach((e) => { counts[e.usage_class || 'unclassified'] = (counts[e.usage_class || 'unclassified'] || 0) + 1 })
    return Object.entries(counts).map(([name, value]) => ({ name: name.replace(/_/g, ' '), value }))
  }, [usage])

  const maintDist = useMemo(() => {
    const s = maintenance?.summary
    if (!s) return []
    return [
      { name: 'High', value: s.high_count || 0 },
      { name: 'Medium', value: s.medium_count || 0 },
      { name: 'Low', value: s.low_count || 0 },
    ].filter((d) => d.value > 0)
  }, [maintenance])

  if (loading) return <Spinner label="Computing analytics…" />
  if (error) return <ErrorState message={error} onRetry={load} />

  const noData = usage?.status === 'no_data' || !usage?.equipment?.length

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Equipment Analytics</h2>
          <p>Live insights from the ML service — usage patterns and maintenance priorities.</p>
        </div>
      </div>

      {usage?.summary && (
        <div className="grid grid-4 mb-16">
          <div className="stat-card"><div className="stat-icon teal"><BarChart3 size={22} /></div>
            <div><p className="stat-label">Equipment Analysed</p><p className="stat-value">{usage.summary.total_equipment ?? '—'}</p></div></div>
          <div className="stat-card"><div className="stat-icon"><BarChart3 size={22} /></div>
            <div><p className="stat-label">Total Usage Events</p><p className="stat-value">{usage.summary.total_usage ?? '—'}</p></div></div>
          <div className="stat-card"><div className="stat-icon teal"><BarChart3 size={22} /></div>
            <div><p className="stat-label">Period</p><p className="stat-value" style={{ fontSize: 15 }}>{usage.period ? `${usage.period.start} → ${usage.period.end}` : 'All time'}</p></div></div>
          <div className="stat-card"><div className="stat-icon"><BarChart3 size={22} /></div>
            <div><p className="stat-label">Maintenance Alerts</p><p className="stat-value">{maintenance?.summary?.high_count ?? '—'}</p><p className="stat-hint">high priority items</p></div></div>
        </div>
      )}

      {noData ? (
        <EmptyState icon={BarChart3} title="Not enough data yet"
          message={usage?.message || 'Usage analytics requires completed booking records. Charts will appear once the ML service has data.'} />
      ) : (
        <>
          <div className="grid grid-2 mb-16">
            <div className="chart-box">
              <h3 className="card-title">Top Equipment by Usage</h3>
              <p className="card-sub">Issue/booking counts from completed records.</p>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={topUsage} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="usage" fill="#0d9488" radius={[0, 6, 6, 0]} name="Usage events" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="chart-box">
              <h3 className="card-title">Usage Classification</h3>
              <p className="card-sub">Frequently used vs underutilized vs zero usage.</p>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={classDist} dataKey="value" nameKey="name" outerRadius={95} label>
                    {classDist.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-2">
            <div className="chart-box">
              <h3 className="card-title">Utilization % — Top Items</h3>
              <p className="card-sub">Borrowed unit-days ÷ available capacity.</p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={topUsage.filter((d) => d.utilization > 0)} margin={{ left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                  <YAxis unit="%" />
                  <Tooltip formatter={(v) => `${v}%`} />
                  <Bar dataKey="utilization" fill="#163a63" radius={[6, 6, 0, 0]} name="Utilization" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="chart-box">
              <h3 className="card-title">Maintenance Priority Distribution</h3>
              <p className="card-sub">Condition-based scoring across inventory.</p>
              {maintDist.length === 0 ? (
                <EmptyState title="No maintenance data" message="Maintenance analysis returned no items." />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={maintDist}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                      {maintDist.map((d, i) => <Cell key={i} fill={d.name === 'High' ? '#dc2626' : d.name === 'Medium' ? '#d97706' : '#2563eb'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </>
      )}

      {usage?.warnings?.length > 0 && (
        <div className="card mt-16">
          <h3 className="card-title">Data notes</h3>
          {usage.warnings.map((w, i) => <p key={i} className="text-sm text-muted mt-16">• {w}</p>)}
        </div>
      )}
    </div>
  )
}
