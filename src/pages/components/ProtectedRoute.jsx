// ProtectedRoute.js
import { Navigate } from 'react-router-dom';

export default function ProtectedRoute({ children}) {
  const email = localStorage.getItem('userEmail');
  const expiresAt = localStorage.getItem('expiresAt');
  const role = localStorage.getItem('userRole');

  if(role !== 'admin'){

    return (
     <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      backgroundColor: '#f9fafb'
    }}>
      <div style={{
        maxWidth: '500px',
        padding: '32px',
        backgroundColor: 'white',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        textAlign: 'center'
      }}>
        <h2 style={{
          fontSize: '24px',
          fontWeight: 'bold',
          color: '#ef4444',
          marginBottom: '16px'
        }}>
          Access Denied
        </h2>
        <p style={{
          fontSize: '16px',
          color: '#6b7280',
          marginBottom: '24px'
        }}>
          You don't have permission to access this page.
        </p>
        <button
          onClick={() => window.history.back()}
          style={{
            padding: '10px 20px',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          Go Back
        </button>
      </div>
    </div>
  );
  }
  
  // Check auth BEFORE rendering children
  if (!email || (expiresAt && Date.now() > parseInt(expiresAt))) {
    localStorage.clear();
    return <Navigate to="/login" replace />; // ← Redirect component, not navigate()
  }
  
  // Only render page if authenticated
  return children;
}