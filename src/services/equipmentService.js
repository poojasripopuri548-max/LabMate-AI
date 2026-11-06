import api from './api'

const unwrap = (res) => res.data

export const equipmentService = {
  getAll: async (filters = {}) => {
    const params = {}
    if (filters.category) params.category = filters.category
    if (filters.laboratory) params.laboratory = filters.laboratory
    if (filters.condition) params.condition = filters.condition
    if (filters.status) params.status = filters.status
    const res = await api.get('/api/equipment', { params })
    return unwrap(res).equipment || []
  },

  getById: async (id) => {
    const res = await api.get(`/api/equipment/${id}`)
    return unwrap(res).equipment
  },

  create: async (data) => unwrap(await api.post('/api/equipment', data)),

  update: async (id, data) => unwrap(await api.put(`/api/equipment/${id}`, data)),

  bulkImport: async (items) => {
    const res = await api.post('/api/equipment/bulk', { items })
    return unwrap(res)
  },

  remove: async (id) => unwrap(await api.delete(`/api/equipment/${id}`)),
}

export const laboratoryService = {
  getAll: async () => {
    const res = await api.get('/api/laboratories')
    return unwrap(res).laboratories || []
  },

  getById: async (id) => {
    const res = await api.get(`/api/laboratories/${id}`)
    return unwrap(res).laboratory
  },
}
