import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { Spinner } from './components/common/UI'
import { DashboardLayout } from './components/layout/DashboardLayout'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import StudentDashboard from './pages/StudentDashboard'
import FacultyDashboard from './pages/FacultyDashboard'
import AdminDashboard from './pages/AdminDashboard'
import EquipmentPage from './pages/EquipmentPage'
import EquipmentDetailsPage from './pages/EquipmentDetailsPage'
import BookingPage from './pages/BookingPage'
import MyBookingsPage from './pages/MyBookingsPage'
import ReturnsPage from './pages/ReturnsPage'
import RecommendationsPage from './pages/RecommendationsPage'
import AnalyticsPage from './pages/AnalyticsPage'
import MaintenancePage from './pages/MaintenancePage'
// Assistant lives in the floating Labby AI widget (AssistantWidget).

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <Spinner label="Checking session…" />
  if (!user) return <Navigate to="/login" replace />
  return children
}

function RoleDashboard() {
  const { user } = useAuth()
  if (user?.role === 'student') return <StudentDashboard />
  if (user?.role === 'faculty') return <FacultyDashboard />
  return <AdminDashboard />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<RoleDashboard />} />
        <Route path="/equipment" element={<EquipmentPage />} />
        <Route path="/equipment/:id" element={<EquipmentDetailsPage />} />
        <Route path="/bookings" element={<BookingPage />} />
        <Route path="/my-bookings" element={<MyBookingsPage />} />
        <Route path="/returns" element={<ReturnsPage />} />
        <Route path="/recommendations" element={<RecommendationsPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/maintenance" element={<MaintenancePage />} />
        <Route path="/assistant" element={<Navigate to="/dashboard" replace />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
