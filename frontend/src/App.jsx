import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import useAuth from './hooks/useAuth'

const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const ExerciseTrackerPage = lazy(() => import('./pages/ExerciseTrackerPage'))
const HistoryPage = lazy(() => import('./pages/HistoryPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const CommunityRecipesPage = lazy(() => import('./pages/CommunityRecipesPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const RegisterPage = lazy(() => import('./pages/RegisterPage'))
const ResultsPage = lazy(() => import('./pages/ResultsPage'))
const RouteSummaryPage = lazy(() => import('./pages/RouteSummaryPage'))
const SearchPage = lazy(() => import('./pages/SearchPage'))

function ProtectedPage({ children }) {
  return <ProtectedRoute>{children}</ProtectedRoute>
}

function HomeRedirect() {
  const { isAuthenticated } = useAuth()
  return <Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />
}

export default function App() {
  return (
    <Layout>
      <Suspense fallback={<section className="panel">Loading BFIT...</section>}>
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route
            path="/dashboard"
            element={
              <ProtectedPage>
                <DashboardPage />
              </ProtectedPage>
            }
          />

          <Route
            path="/exercise"
            element={
              <ProtectedPage>
                <ExerciseTrackerPage />
              </ProtectedPage>
            }
          />

          <Route
            path="/community"
            element={
              <ProtectedPage>
                <CommunityRecipesPage />
              </ProtectedPage>
            }
          />

          <Route
            path="/history"
            element={
              <ProtectedPage>
                <HistoryPage />
              </ProtectedPage>
            }
          />

          <Route
            path="/search"
            element={
              <ProtectedPage>
                <SearchPage />
              </ProtectedPage>
            }
          />

          <Route
            path="/results"
            element={
              <ProtectedPage>
                <ResultsPage />
              </ProtectedPage>
            }
          />

          <Route
            path="/route-summary"
            element={
              <ProtectedPage>
                <RouteSummaryPage />
              </ProtectedPage>
            }
          />

          <Route
            path="/profile"
            element={
              <ProtectedPage>
                <ProfilePage />
              </ProtectedPage>
            }
          />

          <Route path="*" element={<HomeRedirect />} />
        </Routes>
      </Suspense>
    </Layout>
  )
}
