import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Play, Square, Clock } from 'lucide-react';

export default function RubenShift() {
  const [currentShift, setCurrentShift] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    checkActiveShift();
  }, []);

  const checkActiveShift = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('ruben')
        .select('*')
        .eq('status', 'open')
        .order('start_time', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      
      setCurrentShift(data);
    } catch (err) {
      console.error('Error checking active shift:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleStartShift = async () => {
    try {
      setActionLoading(true);
      
      // Check if there's already an open shift
      const { data: existingShift } = await supabase
        .from('ruben')
        .select('*')
        .eq('status', 'open')
        .maybeSingle();

      if (existingShift) {
        alert('You already have an active shift. Please end it before starting a new one.');
        setActionLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('ruben')
        .insert({
          start_time: new Date().toISOString(),
          status: 'open'
        })
        .select()
        .single();

      if (error) throw error;

      setCurrentShift(data);
    } catch (err) {
      console.error('Error starting shift:', err);
      alert('Failed to start shift. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleEndShift = async () => {
    if (!currentShift) {
      alert('No active shift found.');
      return;
    }

    try {
      setActionLoading(true);
      
      const { data, error } = await supabase
        .from('ruben')
        .update({
          end_time: new Date().toISOString(),
          status: 'closed'
        })
        .eq('id', currentShift.id)
        .select()
        .single();

      if (error) throw error;

      setCurrentShift(null);
      alert('Shift ended successfully!');
    } catch (err) {
      console.error('Error ending shift:', err);
      alert('Failed to end shift. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const formatDuration = (startTime, endTime = null) => {
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date();
    const diff = end - start;
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    return `${hours}h ${minutes}m`;
  };

  const formatTime = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f9fafb',
        padding: '20px'
      }}>
        <div style={{ 
          fontSize: '18px', 
          color: '#6b7280',
          textAlign: 'center'
        }}>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f9fafb',
      padding: '20px',
      maxWidth: '600px',
      margin: '0 auto'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '16px',
        padding: '24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <h1 style={{
          fontSize: '28px',
          fontWeight: '700',
          color: '#111827',
          marginBottom: '8px',
          textAlign: 'center'
        }}>
          My Shift
        </h1>
        
        {currentShift && (
          <div style={{
            backgroundColor: '#f0fdf4',
            border: '2px solid #22c55e',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '24px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              marginBottom: '16px'
            }}>
              <Clock size={24} color="#22c55e" />
              <span style={{
                fontSize: '16px',
                fontWeight: '600',
                color: '#166534'
              }}>
                Shift Active
              </span>
            </div>
            
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              <div>
                <span style={{
                  fontSize: '14px',
                  color: '#6b7280',
                  display: 'block',
                  marginBottom: '4px'
                }}>
                  Started
                </span>
                <span style={{
                  fontSize: '18px',
                  fontWeight: '600',
                  color: '#111827'
                }}>
                  {formatTime(currentShift.start_time)}
                </span>
              </div>
              
              <div>
                <span style={{
                  fontSize: '14px',
                  color: '#6b7280',
                  display: 'block',
                  marginBottom: '4px'
                }}>
                  Duration
                </span>
                <span style={{
                  fontSize: '18px',
                  fontWeight: '600',
                  color: '#111827'
                }}>
                  {formatDuration(currentShift.start_time)}
                </span>
              </div>
            </div>
          </div>
        )}

        {!currentShift && (
          <div style={{
            backgroundColor: '#fef3c7',
            border: '2px solid #f59e0b',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '24px',
            textAlign: 'center'
          }}>
            <div style={{
              fontSize: '16px',
              color: '#92400e',
              fontWeight: '500'
            }}>
              No active shift
            </div>
            <div style={{
              fontSize: '14px',
              color: '#78350f',
              marginTop: '4px'
            }}>
              Tap "Start Shift" to begin
            </div>
          </div>
        )}

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}>
          {!currentShift ? (
            <button
              onClick={handleStartShift}
              disabled={actionLoading}
              style={{
                width: '100%',
                padding: '20px',
                backgroundColor: actionLoading ? '#9ca3af' : '#22c55e',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontSize: '18px',
                fontWeight: '600',
                cursor: actionLoading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                boxShadow: actionLoading ? 'none' : '0 4px 6px rgba(0,0,0,0.1)',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                if (!actionLoading) {
                  e.currentTarget.style.backgroundColor = '#16a34a';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }
              }}
              onMouseLeave={(e) => {
                if (!actionLoading) {
                  e.currentTarget.style.backgroundColor = '#22c55e';
                  e.currentTarget.style.transform = 'translateY(0)';
                }
              }}
            >
              <Play size={24} fill="white" />
              {actionLoading ? 'Starting...' : 'Start Shift'}
            </button>
          ) : (
            <button
              onClick={handleEndShift}
              disabled={actionLoading}
              style={{
                width: '100%',
                padding: '20px',
                backgroundColor: actionLoading ? '#9ca3af' : '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontSize: '18px',
                fontWeight: '600',
                cursor: actionLoading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                boxShadow: actionLoading ? 'none' : '0 4px 6px rgba(0,0,0,0.1)',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                if (!actionLoading) {
                  e.currentTarget.style.backgroundColor = '#dc2626';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }
              }}
              onMouseLeave={(e) => {
                if (!actionLoading) {
                  e.currentTarget.style.backgroundColor = '#ef4444';
                  e.currentTarget.style.transform = 'translateY(0)';
                }
              }}
            >
              <Square size={24} fill="white" />
              {actionLoading ? 'Ending...' : 'End Shift'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


