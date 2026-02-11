import { Routes, Route, Navigate } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import LeadsPage from './pages/LeadsPage';
import ManagementPage from './pages/ManagementPage';
import LeadDetailPage from './pages/LeadDetailPage';
import Closer from './pages/Closer';
import Setter from './pages/Setter';
import EmailLogin from './pages/EmailLogin'; // ← Add this
import ProtectedRoute from './pages/components/ProtectedRoute';
import FortnightDashboard from './pages/setterStats';
import StatsDashboard from './pages/generalStats';
import CloserStatsDashboard from './pages/closerStats';
import ShiftsPage from './pages/ShiftsPage';
import SchedulePage from './pages/schedules/SchedulePage';
import TestSetterSchedule from './pages/TestSetterSchedule';
import RubenShift from './pages/RubenShift';
import RubenShiftsView from './pages/RubenShiftsView';
import UTMAnalyticsPage from './pages/utmAnalytics';
import OffersPage from './pages/OffersPage';
import UsersPage from './pages/UsersPage';
import AISetterPage from './pages/AISetterPage';
import AdminSidebar from './components/AdminSidebar';
import './App.css';

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<EmailLogin />} />   
      <Route path="/login" element={<EmailLogin />} />   
      <Route path="/admin" element={
        <ProtectedRoute>
        <LeadsPage />
        </ProtectedRoute>
      } />
      <Route path="/management" element={
        <ProtectedRoute>
        <ManagementPage />
        </ProtectedRoute>
      } />
      <Route path="/lead/:leadID" element={<LeadDetailPage />} />
      <Route path="/closer/:closer" element={<Closer />} />
      <Route path="/setter/:setter" element={<Setter />} />
      <Route path="/stats/:setter" element={<FortnightDashboard/>} />
      <Route path="/closer-stats/:closer" element={<CloserStatsDashboard/>} />
      <Route path="/metrics" element={<StatsDashboard/>}/>
      <Route path="/utm-stats" element={<UTMAnalyticsPage/>}/>
      <Route path="/shifts" element={
        <ProtectedRoute>
          <ShiftsPage />
        </ProtectedRoute>
      } />
      <Route path="/schedules" element={
        <ProtectedRoute>
          <SchedulePage />
        </ProtectedRoute>
      } />
      <Route path="/rubenshift" element={
          <RubenShift />
      }/>
      <Route path="/rubenshifts" element={
          <RubenShiftsView />
      }/>
      <Route path="/test-setter" element={
        <ProtectedRoute>
          <TestSetterSchedule />
        </ProtectedRoute>
      } />
      <Route path="/offers" element={
        <ProtectedRoute>
          <OffersPage />
        </ProtectedRoute>
      } />
      <Route path="/users" element={
        <ProtectedRoute>
          <UsersPage />
        </ProtectedRoute>
      } />
      <Route path="/ai-setter" element={
        <ProtectedRoute>
          <AISetterPage />
        </ProtectedRoute>
      } />

    </Routes>
  );
}

export default function App() {
  const location = useLocation();
  const isLoginPage = location.pathname === '/' || location.pathname === '/login';
  
  // Don't show sidebar on login pages
  if (isLoginPage) {
    return <AppRoutes />;
  }
  
  // Wrap all other routes with AdminSidebar
  return (
    <AdminSidebar>
      <AppRoutes />
    </AdminSidebar>
  );
}