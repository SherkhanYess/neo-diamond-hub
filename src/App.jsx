import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { SessionProvider } from './context/SessionContext'
import { BrandProvider } from './context/BrandContext'
import { ToastProvider } from './components/common/Toast'
import ProtectedRoute from './components/Shell/ProtectedRoute'
import AppShell from './components/Shell/AppShell'
import LoginPage from './components/Auth/LoginPage'
import SettingsLayout from './components/Settings/SettingsLayout'
import DashboardPage from './components/Dashboard/DashboardPage'
import PlanningPage from './components/Planning/PlanningPage'
import SourcesPage from './components/Marketing/SourcesPage'
import SourcePage from './components/Marketing/SourcePage'
import SalesDeptPage from './components/Sales/SalesDeptPage'
import UnitPage from './components/Sales/UnitPage'
import { SALES_CAPS } from './lib/permissions'
import DecisionsPage from './components/Decisions/DecisionsPage'
import CommercePage from './components/Commerce/CommercePage'

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
                path="/commerce"
                element={
                  <ProtectedRoute requireCap="view_reports">
                    <CommercePage />
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
                    <SourcesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/marketing/source/:sourceId"
                element={
                  <ProtectedRoute requireCap="view_reports">
                    <SourcePage />
                  </ProtectedRoute>
                }
              />
              <Route path="/marketing/performance" element={<Navigate to="/marketing" replace />} />
              <Route
                path="/sales"
                element={
                  <ProtectedRoute requireCap={SALES_CAPS}>
                    <SalesDeptPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/sales/unit/:unitId"
                element={
                  <ProtectedRoute requireCap={SALES_CAPS}>
                    <UnitPage />
                  </ProtectedRoute>
                }
              />
              {/* Таплинк is now the «Профиль» converter inside Instagram. */}
              <Route path="/taplink" element={<Navigate to="/marketing" replace />} />
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
