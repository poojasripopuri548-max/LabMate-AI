import api from './api'

const unwrap = (res) => res.data

export const bookingService = {
  create: async (data) => unwrap(await api.post('/api/bookings', data)),
  getMyBookings: async () => {
    const res = await api.get('/api/bookings/my-bookings')
    return unwrap(res).bookings || []
  },
  getAll: async () => {
    const res = await api.get('/api/bookings')
    return unwrap(res).bookings || []
  },
  review: async (id, status, reason) =>
    unwrap(await api.patch(`/api/bookings/${id}/review`, { status, reason })),
  cancel: async (id) => unwrap(await api.patch(`/api/bookings/${id}/cancel`)),
  issue: async (id) => unwrap(await api.patch(`/api/bookings/${id}/issue`)),
  requestReturn: async (id) => unwrap(await api.patch(`/api/bookings/${id}/request-return`)),
  confirmReturn: async (id, data) => unwrap(await api.patch(`/api/bookings/${id}/confirm-return`, data)),
}

export const availabilityService = {
  check: async ({ equipmentId, startTime, endTime }) => {
    const res = await api.get('/api/availability', {
      params: { equipmentId, startTime, endTime },
    })
    return unwrap(res)
  },
}
