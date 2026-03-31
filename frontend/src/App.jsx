import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import useAuth from './hooks/useAuth'
import DashboardPage from './pages/DashboardPage'
import ExerciseTrackerPage from './pages/ExerciseTrackerPage'
import HistoryPage from './pages/HistoryPage'
import LoginPage from './pages/LoginPage'
import CommunityRecipesPage from './pages/CommunityRecipesPage'
import ProfilePage from './pages/ProfilePage'
import RegisterPage from './pages/RegisterPage'
import ResultsPage from './pages/ResultsPage'
import RouteSummaryPage from './pages/RouteSummaryPage'
import SearchPage from './pages/SearchPage'

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
    </Layout>
  )
}
