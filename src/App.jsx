import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { SessionProvider } from './context/SessionContext'
import { ToastProvider } from './components/common/Toast'
import ProtectedRoute from './components/Shell/ProtectedRoute'
import AppShell from './components/Shell/AppShell'
import LoginPage from './components/Auth/LoginPage'
import ModuleStub from './components/pages/ModuleStub'
import SettingsLayout from './components/Settings/SettingsLayout'
import PlanningPage from './components/Planning/PlanningPage'
import MarketingPage from './components/Reports/MarketingPage'
import SalesPage from './components/Reports/SalesPage'
import DecisionsPage from './components/Decisions/DecisionsPage'
import PerformancePage from './components/Reports/PerformancePage'

export default function App() {
  return (
    <SessionProvider>
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
              <Route path="/" element={<ModuleStub name="Рабочий стол" />} />
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
    </SessionProvider>
  )
}
