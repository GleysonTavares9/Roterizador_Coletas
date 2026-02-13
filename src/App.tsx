import { Layout } from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'
import Dashboard from './pages/Dashboard'
import MapPage from './pages/MapPage'
import OptimizationPage from './pages/OptimizationPage'
import RoutesPage from './pages/RoutesPage'
import DataInputPage from './pages/DataInputPage'
import CalendarPage from './pages/CalendarPage'
import LoginPage from './pages/LoginPage'
import ProfilePage from './pages/ProfilePage'
import CostsPage from './pages/CostsPage'
import FleetClosurePage from './pages/FleetClosurePage'
import DriverLoginPage from './pages/Driver/DriverLoginPage'
import DriverDashboard from './pages/Driver/DriverDashboard'
import DriverRouteExecution from './pages/Driver/DriverRouteExecution'
import LiveMonitoringPage from './pages/Monitoring/LiveMonitoringPage'
import MessageCenterPage from './pages/Monitoring/MessageCenterPage'
import RouteAssignmentPage from './pages/Monitoring/RouteAssignmentPage'
import PrivacyPolicyPage from './pages/PrivacyPolicyPage'
import SupportPage from './pages/SupportPage'
import TermsOfServicePage from './pages/TermsOfServicePage'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from './services/supabase'

function RootRedirect() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setIsAuthenticated(!!session)
    }
    checkAuth()
  }, [])

  if (isAuthenticated === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return <Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        {/* Driver Routes (No Admin Layout) */}
        <Route path="/driver/login" element={<DriverLoginPage />} />
        <Route path="/driver/app" element={<DriverDashboard />} />
        <Route path="/driver/route/:routeId" element={<DriverRouteExecution />} />

        {/* Admin Routes - Protected */}
        <Route path="/" element={<RootRedirect />} />
        <Route path="/dashboard" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
        <Route path="/roteirizacao" element={<ProtectedRoute><Layout><OptimizationPage /></Layout></ProtectedRoute>} />
        <Route path="/optimization" element={<ProtectedRoute><Layout><OptimizationPage /></Layout></ProtectedRoute>} />
        <Route path="/monitoring" element={<ProtectedRoute><Layout><LiveMonitoringPage /></Layout></ProtectedRoute>} />
        <Route path="/messages" element={<ProtectedRoute><Layout><MessageCenterPage /></Layout></ProtectedRoute>} />
        <Route path="/assignments" element={<ProtectedRoute><Layout><RouteAssignmentPage /></Layout></ProtectedRoute>} />

        <Route path="/mapa" element={<ProtectedRoute><Layout><MapPage /></Layout></ProtectedRoute>} />
        <Route path="/calendario" element={<ProtectedRoute><Layout><CalendarPage /></Layout></ProtectedRoute>} />
        <Route path="/frota" element={<ProtectedRoute><Layout><RoutesPage /></Layout></ProtectedRoute>} />
        <Route path="/fechamento-frota" element={<ProtectedRoute><Layout><FleetClosurePage /></Layout></ProtectedRoute>} />
        <Route path="/custos" element={<ProtectedRoute><Layout><CostsPage /></Layout></ProtectedRoute>} />
        <Route path="/dados" element={<ProtectedRoute><Layout><DataInputPage /></Layout></ProtectedRoute>} />
        <Route path="/perfil" element={<ProtectedRoute><Layout><ProfilePage /></Layout></ProtectedRoute>} />
        <Route path="/privacy" element={<ProtectedRoute><Layout><PrivacyPolicyPage /></Layout></ProtectedRoute>} />
        <Route path="/support" element={<ProtectedRoute><Layout><SupportPage /></Layout></ProtectedRoute>} />
        <Route path="/terms" element={<ProtectedRoute><Layout><TermsOfServicePage /></Layout></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
