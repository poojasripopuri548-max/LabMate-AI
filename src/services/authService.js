import api from './api'

const unwrap = (res) => res.data

export const authService = {
  register: async ({ name, email, password }) => {
    const res = await api.post('/api/auth/register', { name, email, password })
    const { token, user } = res.data
    localStorage.setItem('labmate_token', token)
    localStorage.setItem('labmate_user', JSON.stringify(user))
    return user
  },

  login: async ({ email, password }) => {
    const res = await api.post('/api/auth/login', { email, password })
    const { token, user } = res.data
    localStorage.setItem('labmate_token', token)
    localStorage.setItem('labmate_user', JSON.stringify(user))
    return user
  },

  logout: async () => {
    try {
      await api.post('/api/auth/logout')
    } catch {
      // Token may already be expired — still clear local session
    }
    localStorage.removeItem('labmate_token')
    localStorage.removeItem('labmate_user')
  },

  getActivity: async () => {
    const res = await api.get('/api/users/activity')
    return res.data.users || []
  },

  getProfile: async () => unwrap(await api.get('/api/users/profile')),

  getStoredUser: () => {
    try {
      return JSON.parse(localStorage.getItem('labmate_user'))
    } catch {
      return null
    }
  },
}
