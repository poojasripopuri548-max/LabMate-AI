import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { Search, Package, FlaskConical, MapPin, ArrowRight, Upload } from 'lucide-react'
import { Spinner, EmptyState, ErrorState, StatusBadge } from '../components/common/UI'
import { equipmentService, laboratoryService } from '../services/equipmentService'
import { useAuth } from '../context/AuthContext'
import BulkImportModal from '../components/equipment/BulkImportModal'

export default function EquipmentPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [showBulk, setShowBulk] = useState(false)
  const [equipment, setEquipment] = useState([])
  const [labs, setLabs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('')
  const [condition, setCondition] = useState('')
  const [lab, setLab] = useState('')

  const load = () => {
    setLoading(true); setError(null)
    Promise.all([
      equipmentService.getAll({ category: category || undefined, laboratory: lab || undefined, status: status || undefined, condition: condition || undefined }),
      laboratoryService.getAll().catch(() => []),
    ])
      .then(([eq, lb]) => { setEquipment(eq); setLabs(lb) })
      .catch((e) => setError(e.response?.data?.message || 'Failed to load equipment'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [category, status, condition, lab])

  const categories = useMemo(() => [...new Set(equipment.map((e) => e.category).filter(Boolean))], [equipment])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return equipment
    return equipment.filter((e) =>
      [e.name, e.model, e.manufacturer, e.category, e.description, e.laboratory?.name]
        .filter(Boolean).join(' ').toLowerCase().includes(q)
    )
  }, [equipment, search])

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Equipment Catalog</h2>
          <p>Browse all laboratory equipment and check live availability.</p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowBulk(true)}><Upload size={15} /> Bulk Add Equipment</button>
        )}
      </div>

      <div className="filters-bar">
        <div className="search-box">
          <Search size={16} />
          <input className="form-control" placeholder="Search name, model, lab…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="form-control" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="form-control" value={lab} onChange={(e) => setLab(e.target.value)}>
          <option value="">All labs</option>
          {labs.map((l) => <option key={l._id} value={l._id}>{l.name}</option>)}
        </select>
        <select className="form-control" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="unavailable">Unavailable</option>
          <option value="retired">Retired</option>
        </select>
        <select className="form-control" value={condition} onChange={(e) => setCondition(e.target.value)}>
          <option value="">Any condition</option>
          <option value="working">Working</option>
          <option value="damaged">Damaged</option>
          <option value="under_maintenance">Under Maintenance</option>
        </select>
      </div>

      {loading ? <Spinner label="Loading equipment…" /> : error ? <ErrorState message={error} onRetry={load} /> :
        filtered.length === 0 ? (
          <EmptyState icon={Package} title="No equipment found" message="Try adjusting your search or filters." />
        ) : (
          <div className="equip-grid">
            {filtered.map((eq) => {
              const available = eq.status === 'active' && eq.condition === 'working'
              return (
                <Link to={`/equipment/${eq._id}`} className="equip-card" key={eq._id}>
                  <div className="equip-thumb"><FlaskConical size={44} /></div>
                  <div className="equip-body">
                    <h3>{eq.name}</h3>
                    <p className="equip-meta"><MapPin size={13} /> {[eq.block, eq.laboratory?.name, eq.roomNumber || eq.laboratory?.roomNumber].filter(Boolean).join(' – ') || 'Location pending'}</p>
                    {eq.shelfLocation && <p className="equip-meta">Shelf: {eq.shelfLocation}</p>}
                    <p className="equip-meta">{eq.category}{eq.model ? ` · ${eq.model}` : ''}</p>
                    <p className="equip-meta">Qty: {eq.totalQuantity}</p>
                  </div>
                  <div className="equip-foot">
                    <span className="equip-id">{eq._id.slice(-6)}</span>
                    <StatusBadge status={available ? 'available' : 'unavailable'} />
                  </div>
                </Link>
              )
            })}
          </div>
        )}

      {showBulk && <BulkImportModal onClose={() => setShowBulk(false)} onSaved={load} />}
    </div>
  )
}
