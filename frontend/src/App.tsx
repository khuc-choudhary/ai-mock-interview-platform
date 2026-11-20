import { lazy, Suspense } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import AppLayout from './layouts/AppLayout'
import { Spinner } from './components/ui'
import { ForgotPasswordPage, LoginPage, RegisterPage, ResetPasswordPage } from './pages/AuthPages'

const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const StartInterviewPage = lazy(() => import('./pages/StartInterviewPage'))
const InterviewRoomPage = lazy(() => import('./pages/InterviewRoomPage'))
const HistoryPage = lazy(() => import('./pages/HistoryPage'))
const ReportPage = lazy(() => import('./pages/ReportPage'))
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'))
const LearningPage = lazy(() => import('./pages/LearningPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))

function Protected() {
  const { user, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <Spinner label="Restoring your session…" />
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  return (
    <Suspense fallback={<Spinner />}>
      <Outlet />
    </Suspense>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route element={<Protected />}>
        {/* The interview room is full-screen (no sidebar) */}
        <Route path="/interview/:id" element={<InterviewRoomPage />} />
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/interview/new" element={<StartInterviewPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/history/:id" element={<ReportPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/learning" element={<LearningPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
