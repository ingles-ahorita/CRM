import { Routes, Route } from 'react-router-dom';
import LeadsPage from './pages/LeadsPage';
import LeadDetailPage from './pages/LeadDetailPage';
import Closer from './pages/Closer';
import Setter from './pages/Setter';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LeadsPage />} />
      <Route path="/lead/:leadID" element={<LeadDetailPage />} />
      <Route path="/closer/:closer" element={<Closer />} />
      <Route path="/setter/:setter" element={<Setter />} />
    </Routes>
  );
}