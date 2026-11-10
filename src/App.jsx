import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { SessionProvider } from './context/SessionContext'
import { BrandProvider } from './context/BrandContext'
import { ToastProvider } from './components/common/Toast'
import ProtectedRoute from './components/Shell/ProtectedRoute'
import AppShell from './components/Shell/AppShell'
import LoginPage from './components/Auth/LoginPage'
import SettingsLayout from './components/Settings/SettingsLayout'
import DashboardPage from './components/Dashboard/DashboardPage'
import PlanningPage from './components/Planning/PlanningPage'
import MarketingPage from './components/Reports/MarketingPage'
import SalesPage from './components/Reports/SalesPage'
import DecisionsPage from './components/Decisions/DecisionsPage'
import TaplinkPage from './components/Taplink/TaplinkPage'
import PerformancePage from './components/Reports/PerformancePage'

export default function App() {
  return (
    <SessionProvider>
      <BrandProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              element={
                <ProtectedRoute>
                  <AppShell />
                </ProtectedRoute>
              }
            >
              <Route
                path="/"
                element={
                  <ProtectedRoute requireCap="view_reports">
                    <DashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/planning"
                element={
                  <ProtectedRoute requireCap="edit_plan">
                    <PlanningPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/marketing"
                element={
                  <ProtectedRoute requireCap="view_reports">
                    <MarketingPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/marketing/performance"
                element={
                  <ProtectedRoute requireCap="view_reports">
                    <PerformancePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/sales"
                element={
                  <ProtectedRoute requireCap="view_reports">
                    <SalesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/taplink"
                element={
                  <ProtectedRoute requireCap="view_reports">
                    <TaplinkPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/decisions"
                element={
                  <ProtectedRoute requireCap="decisions">
                    <DecisionsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute requireCap="settings">
                    <SettingsLayout />
                  </ProtectedRoute>
                }
              />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
      </BrandProvider>
    </SessionProvider>
  )
}
