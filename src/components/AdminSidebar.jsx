import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Menu, LayoutDashboard, BarChart3, Calendar, TrendingUp, Gift, Users } from 'lucide-react';
import { useSimpleAuth } from '../useSimpleAuth';

const menuItems = [
  { path: '/management', label: 'Management', icon: LayoutDashboard },
  { path: '/metrics', label: 'Metrics', icon: BarChart3 },
  { path: '/utm-stats', label: 'Organic Stats', icon: TrendingUp },
  { path: '/schedules', label: 'Setters schedules', icon: Calendar },
  { path: '/offers', label: 'Offers', icon: Gift },
  { path: '/users', label: 'Users', icon: Users },
];

export default function AdminSidebar({ children }) {
  const { role } = useSimpleAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = role === 'admin';
  
  // Always start closed on page load, don't read from localStorage
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Save sidebar state to localStorage whenever it changes (for session persistence)
  // But don't read it back on initial load - always start closed
  useEffect(() => {
    localStorage.setItem('sidebarOpen', sidebarOpen.toString());
  }, [sidebarOpen]);

  // Auto-close sidebar after 5 seconds when it's opened
  useEffect(() => {
    if (sidebarOpen) {
      const timer = setTimeout(() => {
        setSidebarOpen(false);
      }, 15000); // 15 seconds

      // Cleanup timer if sidebar is closed manually or component unmounts
      return () => clearTimeout(timer);
    }
  }, [sidebarOpen]);

  if (!isAdmin) {
    return <>{children}</>;
  }

  return (
    <div style={{ position: 'relative', minHeight: '100vh' }}>
      {/* Sidebar */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: sidebarOpen ? 0 : '-300px',
          width: '300px',
          height: '100vh',
          backgroundColor: '#ffffff',
          boxShadow: '2px 0 12px rgba(0,0,0,0.15)',
          transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          padding: '24px',
          overflowY: 'auto',
          borderRight: '1px solid #e5e7eb'
        }}
      >
        {/* Hamburger Button - Inside sidebar when open */}
        {sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(false)}
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              zIndex: 1002,
              background: 'rgba(255, 255, 255, 0.8)',
              backdropFilter: 'blur(4px)',
              border: '1px solid rgba(229, 231, 235, 0.5)',
              borderRadius: '6px',
              cursor: 'pointer',
              padding: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              transition: 'all 0.2s ease',
              opacity: 0.7
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(249, 250, 251, 0.9)';
              e.currentTarget.style.opacity = '1';
              e.currentTarget.style.transform = 'scale(1.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
              e.currentTarget.style.opacity = '0.7';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            <Menu 
              size={18} 
              color="#6b7280"
              style={{
                transition: 'transform 0.3s ease',
                transform: 'rotate(90deg)'
              }}
            />
          </button>
        )}

        <div style={{ marginBottom: '32px', marginTop: '16px' }}>
          <h2 style={{ 
            fontSize: '20px', 
            fontWeight: 'bold', 
            color: '#111827', 
            margin: 0,
            paddingBottom: '16px',
            borderBottom: '2px solid #f3f4f6'
          }}>
            Navigation
          </h2>
        </div>
        
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey) {
                    // Cmd (Mac) or Ctrl (Windows/Linux) + click: open in new tab
                    e.preventDefault();
                    window.open(window.location.origin + item.path, '_blank');
                  } else {
                    // Normal click: navigate normally
                    navigate(item.path);
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: isActive ? '#eff6ff' : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: '16px',
                  color: isActive ? '#2563eb' : '#374151',
                  fontWeight: isActive ? '600' : '500',
                  transition: 'all 0.2s ease',
                  width: '100%',
                  position: 'relative'
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = '#f3f4f6';
                    e.currentTarget.style.color = '#111827';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = '#374151';
                  }
                }}
              >
                <Icon 
                  size={20} 
                  style={{
                    transition: 'transform 0.2s ease',
                  }}
                />
                <span>{item.label}</span>
                {isActive && (
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: '4px',
                      height: '60%',
                      backgroundColor: '#2563eb',
                      borderRadius: '0 4px 4px 0',
                      transition: 'all 0.2s ease'
                    }}
                  />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Hamburger Button - When sidebar is closed, positioned at edge */}
      {!sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          style={{
            position: 'fixed',
            top: '16px',
            left: '12px',
            zIndex: 1001,
            background: 'rgba(255, 255, 255, 0.9)',
            backdropFilter: 'blur(4px)',
            border: 'none',
            borderRight: '1px solid rgba(229, 231, 235, 0.5)',
            borderTopRightRadius: '8px',
            borderBottomRightRadius: '8px',
            cursor: 'pointer',
            padding: '8px 10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '2px 0 8px rgba(0,0,0,0.08)',
            transition: 'all 0.2s ease',
            opacity: 0.6
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
            e.currentTarget.style.opacity = '1';
            e.currentTarget.style.transform = 'translateX(2px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
            e.currentTarget.style.opacity = '0.6';
            e.currentTarget.style.transform = 'translateX(0)';
          }}
        >
          <Menu 
            size={18} 
            color="#6b7280"
            style={{
              transition: 'transform 0.2s ease'
            }}
          />
        </button>
      )}

      {/* Main Content */}
      <div
        style={{
          marginLeft: sidebarOpen ? '300px' : '0',
          transition: 'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          minHeight: '100vh'
        }}
      >
        {children}
      </div>
    </div>
  );
}
