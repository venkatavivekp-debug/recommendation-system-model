import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import ProfilePage from './pages/ProfilePage'
import RegisterPage from './pages/RegisterPage'
import ResultsPage from './pages/ResultsPage'
import RouteSummaryPage from './pages/RouteSummaryPage'
import SearchPage from './pages/SearchPage'

function ProtectedPage({ children }) {
  return <ProtectedRoute>{children}</ProtectedRoute>
}

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

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

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Layout>
  )
}
