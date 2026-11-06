import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-toastify'
import { ClipboardList, XCircle } from 'lucide-react'
import { Spinner, EmptyState, ErrorState, StatusBadge } from '../components/common/UI'
import { bookingService } from '../services/bookingService'

const TABS = ['All', 'Pending', 'Approved', 'Issued', 'Rejected', 'Cancelled', 'Completed']

export default function MyBookingsPage() {
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('All')
  const [cancelling, setCancelling] = useState(null)

  const load = () => {
    setLoading(true); setError(null)
    bookingService.getMyBookings()
      .then(setBookings)
      .catch((e) => setError(e.response?.data?.message || 'Failed to load bookings'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const filtered = useMemo(() =>
    tab === 'All' ? bookings : bookings.filter((b) => b.status === tab.toLowerCase()),
  [bookings, tab])

  const cancel = async (b) => {
    if (!window.confirm('Cancel this pending booking?')) return
    setCancelling(b._id)
    try {
      await bookingService.cancel(b._id)
      toast.success('Booking cancelled')
      load()
    } catch (e) {
      toast.error(e.response?.data?.message || 'Cancel failed')
    } finally {
      setCancelling(null)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>My Bookings</h2>
          <p>Track every booking request and its status.</p>
        </div>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {loading ? <Spinner /> : error ? <ErrorState message={error} onRetry={load} /> :
        filtered.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No bookings" message={`You have no ${tab.toLowerCase()} bookings.`} />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Booking</th><th>Equipment</th><th>Date & Time</th><th>Qty</th><th>Purpose</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {filtered.map((b) => (
                  <tr key={b._id}>
                    <td className="equip-id">#{b._id.slice(-6)}</td>
                    <td>
                      <strong>{b.equipment?.name || '—'}</strong>
                      <br /><span className="text-sm text-muted">{b.equipment?.laboratory?.name || ''}</span>
                      {b.collectionLocation && <><br /><span className="text-sm" style={{ color: 'var(--teal-600)' }}>Collect at: {b.collectionLocation}</span></>}
                    </td>
                    <td className="text-sm">
                      {new Date(b.startTime).toLocaleDateString()}<br />
                      {new Date(b.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} → {new Date(b.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td>{b.quantity}</td>
                    <td className="text-sm">{b.purpose}</td>
                    <td><StatusBadge status={b.status} /></td>
                    <td>
                      {b.status === 'pending' && (
                        <button className="btn btn-danger btn-sm" disabled={cancelling === b._id} onClick={() => cancel(b)}>
                          <XCircle size={14} /> Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  )
}
