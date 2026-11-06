import api from './api'

const unwrap = (res) => res.data

export const recommendationService = {
  getRecommendations: async (query, topN = 5) => {
    const res = await api.get('/api/ml/recommendations', {
      params: { q: query, top_n: topN },
    })
    return unwrap(res).data
  },

  getUsageAnalysis: async ({ start, end } = {}) => {
    const params = {}
    if (start) params.start = start
    if (end) params.end = end
    const res = await api.get('/api/ml/usage-analysis', { params })
    return unwrap(res).data
  },

  getMaintenanceAnalysis: async () => {
    const res = await api.get('/api/ml/maintenance-analysis')
    return unwrap(res).data
  },
}
