// useSimpleAuth.js
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export function useSimpleAuth() {
  const navigate = useNavigate();
  
    const email = localStorage.getItem('userEmail');
    const expiresAt = localStorage.getItem('expiresAt');

    if (!email) {
      navigate('/login');
    }

    if (expiresAt && Date.now() > parseInt(expiresAt)) {
      localStorage.clear();
      alert('Your session has expired. Please login again.'); // Optional
      navigate('/login');
      return;
    }


  return {
    email: localStorage.getItem('userEmail'),
    role: localStorage.getItem('userRole'),
    userId: localStorage.getItem('userId'),
    userName: localStorage.getItem('userName'),
    logout: () => {
      localStorage.clear();
      navigate('/login');
    }
  };
}