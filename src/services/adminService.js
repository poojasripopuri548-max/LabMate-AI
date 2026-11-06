import api from './api'

const unwrap = (res) => res.data

export const damageService = {
  create: async (data) => unwrap(await api.post('/api/damage-reports', data)),
  getAll: async (status) => {
    const res = await api.get('/api/damage-reports', { params: status ? { status } : {} })
    return unwrap(res).reports || []
  },
  update: async (id, data) => unwrap(await api.patch(`/api/damage-reports/${id}`, data)),
}

export const maintenanceService = {
  getAll: async (params = {}) => {
    const res = await api.get('/api/maintenance', { params })
    return unwrap(res).records || []
  },
  create: async (data) => unwrap(await api.post('/api/maintenance', data)),
  update: async (id, data) => unwrap(await api.patch(`/api/maintenance/${id}`, data)),
}

export const notificationService = {
  getAll: async () => {
    const res = await api.get('/api/notifications')
    return { unread: res.data.unread || 0, notifications: res.data.notifications || [] }
  },
  markAllRead: async () => unwrap(await api.patch('/api/notifications/read-all')),
}

export const assistantService = {
  chat: async (message) => unwrap(await api.post('/api/assistant/chat', { message })),
}

export const userService = {
  getAll: async () => {
    const res = await api.get('/api/users')
    return unwrap(res).users || []
  },
  create: async (data) => unwrap(await api.post('/api/users', data)),
  update: async (id, data) => unwrap(await api.patch(`/api/users/${id}`, data)),
}
