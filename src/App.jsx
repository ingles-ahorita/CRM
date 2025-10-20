import { Routes, Route, Navigate } from 'react-router-dom';
import LeadsPage from './pages/LeadsPage';
import LeadDetailPage from './pages/LeadDetailPage';
import Closer from './pages/Closer';
import Setter from './pages/Setter';
import EmailLogin from './pages/EmailLogin'; // ← Add this
import ProtectedRoute from './pages/components/ProtectedRoute';
import FortnightDashboard from './pages/setterStats';
import StatsDashboard from './pages/generalStats';
import './App.css';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<EmailLogin />} />   
      <Route path="/login" element={<EmailLogin />} />   
      <Route path="/admin" element={
        <ProtectedRoute>
        <LeadsPage />
        </ProtectedRoute>
      } />
      <Route path="/lead/:leadID" element={<LeadDetailPage />} />
      <Route path="/closer/:closer" element={<Closer />} />
      <Route path="/setter/:setter" element={<Setter />} />
      <Route path="/stats/:setter" element={<FortnightDashboard/>} />
      <Route path="/metrics" element={<StatsDashboard/>}/>
    </Routes>
  );
}