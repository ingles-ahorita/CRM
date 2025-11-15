// src/pages/EmailLogin.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import logo from '../assets/logo.png';

// Helper function to log login events
async function logLoginEvent(email, success, metadata = {}) {
  try {
    // Get IP address using a service
    let ipAddress = null;
    try {
      const ipResponse = await fetch('https://api.ipify.org?format=json');
      const ipData = await ipResponse.json();
      ipAddress = ipData.ip;
    } catch (ipError) {
      console.error('Error fetching IP address:', ipError);
    }

    // Get user agent
    const userAgent = navigator.userAgent || null;

    // Insert login event
    const { error } = await supabase
      .from('login_events')
      .insert({
        email: email.toLowerCase().trim(),
        occurred_at: new Date().toISOString(),
        ip_address: ipAddress,
        user_agent: userAgent,
        success: success,
        metadata: metadata,
        created_at: new Date().toISOString()
      });

    if (error) {
      console.error('Error logging login event:', error);
    }
  } catch (error) {
    console.error('Error in logLoginEvent:', error);
  }
}

export default function EmailLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
        navigate('/management');
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

  // Validate password is provided
  if (!password) {
    setError('Please enter your password.');
    setLoading(false);
    return;
  }

  // Check if admin email
  if (emailLower === 'admin@inglesahorita.com' || emailLower === 'ruben@hola.com') {
    // For admin, you can set a password here or check against a config
    // For now, allowing admin login with any password (you should add proper password check)
    const adminPassword = 'admin123'; // TODO: Move to environment variable or secure config
    if (password !== adminPassword) {
      await logLoginEvent(emailLower, false, { reason: 'invalid_password', role: 'admin' });
      setError('Invalid email or password.');
      setLoading(false);
      return;
    }
    localStorage.setItem('userEmail', emailLower);
    localStorage.setItem('userRole', 'admin');
    localStorage.setItem('userId', null);
    localStorage.setItem('expiresAt', expiresAt);
    await logLoginEvent(emailLower, true, { role: 'admin' });
    navigate('/management');
    setLoading(false);
    return;
  }

  // Check closers table
  const { data: closer } = await supabase
    .from('closers')
    .select('id, name, email, password')
    .eq('email', emailLower)
    .single();

  if (closer) {
    // Verify password
    // Note: If passwords are hashed in DB, use a hashing library like bcrypt
    if (closer.password && closer.password !== password) {
      await logLoginEvent(emailLower, false, { reason: 'invalid_password', role: 'closer', userId: closer.id });
      setError('Invalid email or password.');
      setLoading(false);
      return;
    }
    // If no password set in DB yet, allow login (for migration period)
    if (!closer.password) {
      console.warn('No password set for user. Please set a password in the database.');
    }
    localStorage.setItem('userEmail', closer.email);
    localStorage.setItem('userRole', 'closer');
    localStorage.setItem('userId', closer.id);
    localStorage.setItem('userName', closer.name);
    localStorage.setItem('expiresAt', expiresAt);
    await logLoginEvent(closer.email, true, { role: 'closer', userId: closer.id, userName: closer.name });
    navigate(`/closer/${closer.id}`);
    setLoading(false);
    return;
  }

  // Check setters table
  const { data: setter } = await supabase
    .from('setters')
    .select('id, name, email, password')
    .eq('email', emailLower)
    .single();

  if (setter) {
    // Verify password
    // Note: If passwords are hashed in DB, use a hashing library like bcrypt
    if (setter.password && setter.password !== password) {
      await logLoginEvent(emailLower, false, { reason: 'invalid_password', role: 'setter', userId: setter.id });
      setError('Invalid email or password.');
      setLoading(false);
      return;
    }
    // If no password set in DB yet, allow login (for migration period)
    if (!setter.password) {
      console.warn('No password set for user. Please set a password in the database.');
    }
    localStorage.setItem('userEmail', setter.email);
    localStorage.setItem('userRole', 'setter');
    localStorage.setItem('userId', setter.id);
    localStorage.setItem('userName', setter.name);
    localStorage.setItem('expiresAt', expiresAt);
    await logLoginEvent(setter.email, true, { role: 'setter', userId: setter.id, userName: setter.name });
    navigate(`/setter/${setter.id}`);
    setLoading(false);
    return;
  }

  // Not found - log failed login attempt
  await logLoginEvent(emailLower, false, { reason: 'email_not_found' });
  setError('Invalid email or password.');
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
          Enter your email and password to continue
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
          
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
            {loading ? 'Checking...' : 'Login'}
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