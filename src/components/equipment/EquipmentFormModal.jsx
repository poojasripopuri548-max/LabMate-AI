import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { X } from 'lucide-react'
import { laboratoryService, equipmentService } from '../../services/equipmentService'

const empty = {
  name: '', inventoryCode: '', category: '', model: '', manufacturer: '', description: '',
  totalQuantity: 1, laboratory: '', block: '', roomNumber: '', shelfLocation: '',
  purchaseDate: '', supplier: '', condition: 'working', status: 'active',
}

export default function EquipmentFormModal({ equipment, onClose, onSaved }) {
  const [form, setForm] = useState(equipment ? { ...empty, ...equipment, laboratory: equipment.laboratory?._id || equipment.laboratory } : empty)
  const [labs, setLabs] = useState([])
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})

  useEffect(() => {
    laboratoryService.getAll().then(setLabs).catch(() => {})
  }, [])

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const submit = async (ev) => {
    ev.preventDefault()
    const e = {}
    if (!form.name.trim()) e.name = 'Name is required'
    if (!form.category.trim()) e.category = 'Category is required'
    if (!form.laboratory) e.laboratory = 'Select a laboratory'
    if (!Number.isInteger(Number(form.totalQuantity)) || Number(form.totalQuantity) < 1) e.totalQuantity = 'Must be a positive integer'
    setErrors(e)
    if (Object.keys(e).length) return
    setSaving(true)
    const payload = { ...form, totalQuantity: Number(form.totalQuantity) }
    try {
      if (equipment) {
        await equipmentService.update(equipment._id, payload)
        toast.success('Equipment updated')
      } else {
        await equipmentService.create(payload)
        toast.success('Equipment created')
      }
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex-between mb-16">
          <h3>{equipment ? 'Edit Equipment' : 'Add Equipment'}</h3>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={submit}>
          <div className="form-row">
            <div className="form-group">
              <label>Name *</label>
              <input className="form-control" value={form.name} onChange={set('name')} />
              {errors.name && <p className="form-error">{errors.name}</p>}
            </div>
            <div className="form-group">
              <label>Category *</label>
              <input className="form-control" value={form.category} onChange={set('category')} placeholder="e.g. Microscope" />
              {errors.category && <p className="form-error">{errors.category}</p>}
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Model</label>
              <input className="form-control" value={form.model || ''} onChange={set('model')} />
            </div>
            <div className="form-group">
              <label>Manufacturer</label>
              <input className="form-control" value={form.manufacturer || ''} onChange={set('manufacturer')} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Inventory Code</label>
              <input className="form-control" value={form.inventoryCode || ''} onChange={set('inventoryCode')} placeholder="e.g. ARD-UNO-001" />
            </div>
            <div className="form-group">
              <label>Block</label>
              <input className="form-control" value={form.block || ''} onChange={set('block')} placeholder="e.g. Block A" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Room Number</label>
              <input className="form-control" value={form.roomNumber || ''} onChange={set('roomNumber')} placeholder="e.g. 204" />
            </div>
            <div className="form-group">
              <label>Shelf / Storage Location</label>
              <input className="form-control" value={form.shelfLocation || ''} onChange={set('shelfLocation')} placeholder="e.g. Rack 3, Shelf B" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Purchase Date</label>
              <input className="form-control" type="date" value={form.purchaseDate ? String(form.purchaseDate).slice(0, 10) : ''} onChange={set('purchaseDate')} />
            </div>
            <div className="form-group">
              <label>Supplier</label>
              <input className="form-control" value={form.supplier || ''} onChange={set('supplier')} />
            </div>
          </div>
          <div className="form-group">
            <label>Laboratory *</label>
            <select className="form-control" value={form.laboratory} onChange={set('laboratory')}>
              <option value="">Select laboratory…</option>
              {labs.map((l) => <option key={l._id} value={l._id}>{l.name} — {l.building} {l.roomNumber}</option>)}
            </select>
            {errors.laboratory && <p className="form-error">{errors.laboratory}</p>}
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Total Quantity *</label>
              <input className="form-control" type="number" min="1" value={form.totalQuantity} onChange={set('totalQuantity')} />
              {errors.totalQuantity && <p className="form-error">{errors.totalQuantity}</p>}
            </div>
            <div className="form-group">
              <label>Condition</label>
              <select className="form-control" value={form.condition} onChange={set('condition')}>
                <option value="working">Working</option>
                <option value="damaged">Damaged</option>
                <option value="under_maintenance">Under Maintenance</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Status</label>
            <select className="form-control" value={form.status} onChange={set('status')}>
              <option value="active">Active</option>
              <option value="unavailable">Unavailable</option>
              <option value="retired">Retired</option>
            </select>
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea className="form-control" rows="3" value={form.description || ''} onChange={set('description')} />
          </div>
          <div className="flex" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
