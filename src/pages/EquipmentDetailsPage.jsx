import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { ArrowLeft, FlaskConical, MapPin, CalendarCheck, Pencil, Trash2 } from 'lucide-react'
import { Spinner, ErrorState, StatusBadge } from '../components/common/UI'
import { equipmentService } from '../services/equipmentService'
import { useAuth } from '../context/AuthContext'
import EquipmentFormModal from '../components/equipment/EquipmentFormModal'

export default function EquipmentDetailsPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const canManage = user?.role === 'faculty' || user?.role === 'admin'
  const [eq, setEq] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(false)

  const load = () => {
    setLoading(true); setError(null)
    equipmentService.getById(id)
      .then(setEq)
      .catch((e) => setError(e.response?.data?.message || 'Failed to load equipment'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [id])

  const remove = async () => {
    if (!window.confirm(`Delete "${eq.name}"?`)) return
    try {
      await equipmentService.remove(eq._id)
      toast.success('Equipment deleted')
      window.history.back()
    } catch (e) {
      toast.error(e.response?.data?.message || 'Delete failed')
    }
  }

  if (loading) return <Spinner />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (!eq) return <ErrorState message="Equipment not found" />

  const specs = eq.specifications ? Object.entries(eq.specifications) : []
  const available = eq.status === 'active' && eq.condition === 'working'

  return (
    <div>
      <Link to="/equipment" className="flex text-sm mb-16" style={{ color: 'var(--muted)' }}>
        <ArrowLeft size={15} /> Back to catalog
      </Link>

      <div className="card">
        <div className="flex-between" style={{ alignItems: 'flex-start' }}>
          <div>
            <h2>{eq.name}</h2>
            <p className="text-muted">{eq.category}{eq.model ? ` · Model ${eq.model}` : ''}{eq.manufacturer ? ` · ${eq.manufacturer}` : ''}</p>
          </div>
          <div className="flex">
            <StatusBadge status={eq.condition} />
            <StatusBadge status={eq.status} />
            {canManage && (
              <>
                <button className="icon-btn" onClick={() => setEditing(true)} title="Edit"><Pencil size={16} /></button>
                <button className="icon-btn" onClick={remove} title="Delete"><Trash2 size={16} /></button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-3 mt-24">
          <div className="spec-item"><strong>Location</strong>{[eq.block, eq.laboratory?.name, eq.roomNumber || eq.laboratory?.roomNumber].filter(Boolean).join(' – ') || '—'}<br />
            <span className="text-sm text-muted"><MapPin size={12} /> {eq.shelfLocation ? `Shelf: ${eq.shelfLocation}` : `${eq.laboratory?.building || ''} ${eq.laboratory?.roomNumber || ''}`}</span></div>
          {eq.inventoryCode && <div className="spec-item"><strong>Inventory Code</strong>{eq.inventoryCode}</div>}
          <div className="spec-item"><strong>Total Quantity</strong>{eq.totalQuantity} unit{eq.totalQuantity > 1 ? 's' : ''}</div>
          <div className="spec-item"><strong>Availability</strong>{available ? 'Available for booking' : 'Currently unavailable'}</div>
        </div>

        {eq.description && <p className="mt-16">{eq.description}</p>}

        {specs.length > 0 && (
          <div className="mt-24">
            <h3 className="card-title">Specifications</h3>
            <div className="spec-list mt-16">
              {specs.map(([k, v]) => (
                <div className="spec-item" key={k}><strong>{k.replace(/_/g, ' ')}</strong>{v}</div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-24 flex">
          {available ? (
            <Link to={`/bookings?equipment=${eq._id}`} className="btn btn-teal"><CalendarCheck size={17} /> Book this equipment</Link>
          ) : (
            <span className="badge badge-danger" style={{ fontSize: 13, padding: '8px 16px' }}>Not available for booking</span>
          )}
        </div>
      </div>

      {editing && <EquipmentFormModal equipment={eq} onClose={() => setEditing(false)} onSaved={load} />}
    </div>
  )
}
