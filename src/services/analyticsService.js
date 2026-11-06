// Analytics are served by the ML service through the Node backend proxy.
// See recommendationService.js — usage-analysis and maintenance-analysis
// responses drive all charts on the Analytics page.
export { recommendationService as analyticsService } from './recommendationService'
