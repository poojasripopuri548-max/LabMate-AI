import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { CalendarCheck, CheckCircle2, AlertCircle } from 'lucide-react'
import { Spinner, StatusBadge } from '../components/common/UI'
import { equipmentService, laboratoryService } from '../services/equipmentService'
import { bookingService, availabilityService } from '../services/bookingService'

export default function BookingPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [equipment, setEquipment] = useState([])
  const [labs, setLabs] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [availability, setAvailability] = useState(null)
  const [checking, setChecking] = useState(false)

  const [form, setForm] = useState({
    equipment: params.get('equipment') || '',
    quantity: 1,
    date: '',
    startTime: '',
    endTime: '',
    purpose: '',
  })
  const [errors, setErrors] = useState({})

  useEffect(() => {
    Promise.all([equipmentService.getAll(), laboratoryService.getAll()])
      .then(([eq, lb]) => { setEquipment(eq.filter((e) => e.status === 'active' && e.condition === 'working')); setLabs(lb) })
      .catch(() => toast.error('Failed to load equipment'))
      .finally(() => setLoading(false))
  }, [])

  const selected = useMemo(() => equipment.find((e) => e._id === form.equipment), [equipment, form.equipment])
  const minDate = new Date().toISOString().slice(0, 10)

  const checkAvailability = async () => {
    if (!form.equipment || !form.date || !form.startTime || !form.endTime) {
      toast.info('Select equipment, date and time first')
      return
    }
    setChecking(true); setAvailability(null)
    try {
      const startTime = new Date(`${form.date}T${form.startTime}`).toISOString()
      const endTime = new Date(`${form.date}T${form.endTime}`).toISOString()
      const res = await availabilityService.check({ equipmentId: form.equipment, startTime, endTime })
      setAvailability(res)
    } catch (e) {
      toast.error(e.response?.data?.message || 'Availability check failed')
    } finally {
      setChecking(false)
    }
  }

  const set = (k) => (e) => {
    setForm({ ...form, [k]: e.target.value })
    setAvailability(null)
  }

  const submit = async (ev) => {
    ev.preventDefault()
    const e = {}
    if (!form.equipment) e.equipment = 'Select equipment'
    if (!form.date) e.date = 'Select a date'
    if (!form.startTime || !form.endTime) e.time = 'Select start and end time'
    else if (form.endTime <= form.startTime) e.time = 'End time must be after start time'
    if (!Number.isInteger(Number(form.quantity)) || Number(form.quantity) < 1) e.quantity = 'Quantity must be ≥ 1'
    if (selected && Number(form.quantity) > selected.totalQuantity) e.quantity = `Only ${selected.totalQuantity} unit(s) available`
    if (form.purpose.trim().length < 5) e.purpose = 'Describe your purpose (min 5 characters)'
    setErrors(e)
    if (Object.keys(e).length) return

    setSubmitting(true)
    try {
      await bookingService.create({
        equipment: form.equipment,
        quantity: Number(form.quantity),
        startTime: new Date(`${form.date}T${form.startTime}`).toISOString(),
        endTime: new Date(`${form.date}T${form.endTime}`).toISOString(),
        purpose: form.purpose.trim(),
      })
      toast.success('Booking request submitted! Track it under My Bookings.')
      navigate('/my-bookings')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Booking failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <Spinner />

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>New Booking Request</h2>
          <p>Select equipment, pick a time slot, and submit for approval.</p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 720 }}>
        <form onSubmit={submit}>
          <div className="form-group">
            <label>Equipment *</label>
            <select className="form-control" value={form.equipment} onChange={set('equipment')}>
              <option value="">Select equipment…</option>
              {equipment.map((e) => (
                <option key={e._id} value={e._id}>
                  {e.name} — {e.laboratory?.name} (qty {e.totalQuantity})
                </option>
              ))}
            </select>
            {errors.equipment && <p className="form-error">{errors.equipment}</p>}
            {selected && (
              <p className="text-sm mt-16" style={{ color: 'var(--muted)' }}>
                <StatusBadge status="available" /> {[selected.block, selected.laboratory?.name, selected.roomNumber || selected.laboratory?.roomNumber].filter(Boolean).join(' – ')} · {selected.category}
                {selected.shelfLocation ? ` · Shelf: ${selected.shelfLocation}` : ''}
              </p>
            )}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Quantity *</label>
              <input className="form-control" type="number" min="1" max={selected?.totalQuantity || undefined}
                value={form.quantity} onChange={set('quantity')} />
              {errors.quantity && <p className="form-error">{errors.quantity}</p>}
            </div>
            <div className="form-group">
              <label>Date *</label>
              <input className="form-control" type="date" min={minDate} value={form.date} onChange={set('date')} />
              {errors.date && <p className="form-error">{errors.date}</p>}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Start Time *</label>
              <input className="form-control" type="time" value={form.startTime} onChange={set('startTime')} />
            </div>
            <div className="form-group">
              <label>End Time *</label>
              <input className="form-control" type="time" value={form.endTime} onChange={set('endTime')} />
            </div>
          </div>
          {errors.time && <p className="form-error" style={{ marginTop: -10 }}>{errors.time}</p>}

          <div className="form-group">
            <label>Purpose of Usage *</label>
            <textarea className="form-control" rows="3" placeholder="e.g. Final year project — protein gel electrophoresis" value={form.purpose} onChange={set('purpose')} />
            {errors.purpose && <p className="form-error">{errors.purpose}</p>}
          </div>

          <div className="flex" style={{ gap: 10 }}>
            <button type="button" className="btn btn-secondary" onClick={checkAvailability} disabled={checking}>
              {checking ? 'Checking…' : 'Check Availability'}
            </button>
          </div>

          {availability && (
            <div className={`availability-box mt-16 ${availability.available ? 'availability-ok' : 'availability-no'}`}>
              {availability.available ? (
                <span className="flex"><CheckCircle2 size={17} /> {availability.availableQuantity} of {availability.totalQuantity} unit(s) available for this slot.</span>
              ) : (
                <span className="flex"><AlertCircle size={17} /> {availability.message || 'Not available for this time period.'}</span>
              )}
            </div>
          )}

          <div className="mt-24 flex" style={{ justifyContent: 'flex-end' }}>
            <button type="submit" className="btn btn-teal" disabled={submitting}>
              <CalendarCheck size={17} /> {submitting ? 'Submitting…' : 'Submit Booking Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
