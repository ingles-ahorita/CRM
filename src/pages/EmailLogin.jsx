// src/pages/EmailLogin.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import logo from '../assets/logo.png';



export default function EmailLogin() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();


    useEffect(() => {
    const userEmail = localStorage.getItem('userEmail');
    const expiresAt = localStorage.getItem('expiresAt');
    const role = localStorage.getItem('userRole');
    const userId = localStorage.getItem('userId');
    
    // If logged in and not expired
    if (userEmail && expiresAt && Date.now() < parseInt(expiresAt)) {
      console.log("testaadsfasdfasd");
      // Redirect to their correct page based on role
      if (role === 'admin') {
        navigate('/admin');
      } else if (role === 'closer') {
        navigate(`/closer/${userId}`);
      } else if (role === 'setter') {
        navigate(`/setter/${userId}`);
      }
    }
  }, [navigate]);

const handleSubmit = async (e) => {
  e.preventDefault();
  setLoading(true);
  setError('');

  const emailLower = email.toLowerCase().trim();
  const expiresAt = Date.now() + (3 * 60 * 60 * 1000);

  // Check if admin email
  if (emailLower === 'admin@inglesahorita.com') {
    localStorage.setItem('userEmail', emailLower);
    localStorage.setItem('userRole', 'admin');
    localStorage.setItem('userId', null);
    localStorage.setItem('expiresAt', expiresAt);
    navigate('/admin');
    setLoading(false);
    return;
  }

  // Check closers table
  const { data: closer } = await supabase
    .from('closers')
    .select('id, name, email')
    .eq('email', emailLower)
    .single();

  if (closer) {
    localStorage.setItem('userEmail', closer.email);
    localStorage.setItem('userRole', 'closer');
    localStorage.setItem('userId', closer.id);
    localStorage.setItem('userName', closer.name);
    localStorage.setItem('expiresAt', expiresAt); // ← ADD THIS
    navigate(`/closer/${closer.id}`);
    setLoading(false);
    return;
  }

  // Check setters table
  const { data: setter } = await supabase
    .from('setters')
    .select('id, name, email')
    .eq('email', emailLower)
    .single();

  if (setter) {
    localStorage.setItem('userEmail', setter.email);
    localStorage.setItem('userRole', 'setter');
    localStorage.setItem('userId', setter.id);
    localStorage.setItem('userName', setter.name);
    localStorage.setItem('expiresAt', expiresAt); // ← ADD THIS
    navigate(`/setter/${setter.id}`);
    setLoading(false);
    return;
  }

  // Not found
  setError('Email not found. Please contact admin.');
  setLoading(false);
};

  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      minHeight: '100vh',
      backgroundColor: '#f9fafb'
    }}>
      <div style={{ 
        maxWidth: '400px', 
        width: '100%',
        padding: '32px',
        backgroundColor: '#1b427d',
        borderRadius: '25px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <img 
  src={logo} 
  alt="Ingles Ahorita Logo" 
  style={{
    width: '400px',
    height: 'auto',
    display: 'block',
    margin: '0 auto 24px auto'
  }}
/>

        <p style={{
          textAlign: 'center',
          color: '#ffffffff',
          marginBottom: '24px',
          fontSize: '15px'
        }}>
          Enter your email to continue
        </p>
        
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="your.email@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
            style={{ 
              width: '100%', 
              padding: '12px', 
              marginBottom: '16px',
              border: '1px solid #f9fafb',
              color: 'black',
              backgroundColor: 'white',
              borderRadius: '6px',
              fontSize: '14px',
              boxSizing: 'border-box'
            }}
          />
          
          <button 
            type="submit"
            disabled={loading}
            style={{ 
              width: '100%', 
              padding: '12px',
              backgroundColor: loading ? '#9ca3af' : '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Checking...' : 'Continue'}
          </button>
        </form>
        
        {error && (
          <p style={{ 
            color: '#ef4444', 
            marginTop: '12px',
            fontSize: '14px',
            textAlign: 'center',
            padding: '8px',
            backgroundColor: '#fee2e2',
            borderRadius: '4px'
          }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}