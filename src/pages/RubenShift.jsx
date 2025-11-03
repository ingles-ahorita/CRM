import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Play, Square, Clock, Coffee, RotateCcw, X } from 'lucide-react';

export default function RubenShift() {
  const [currentShift, setCurrentShift] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [breakLoading, setBreakLoading] = useState(false);
  const [showBreakModal, setShowBreakModal] = useState(false);
  const [breakNote, setBreakNote] = useState('');

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

  const getCurrentBreak = () => {
    if (!currentShift || !currentShift.breaks) return null;
    const breaks = Array.isArray(currentShift.breaks) ? currentShift.breaks : [];
    return breaks.find(b => !b.end_time) || null;
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


    // Check if there's an active break
    const activeBreak = getCurrentBreak();
    if (activeBreak) {
      const confirmed = window.confirm('You have an active break. End the break before ending the shift?');
      if (confirmed) {
        setShowBreakModal(true);
        return;
      } else {
        return;
      }
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

  const handleStartBreak = async () => {
    if (!currentShift) {
      alert('No active shift found.');
      return;
    }

    const activeBreak = getCurrentBreak();
    if (activeBreak) {
      alert('You already have an active break. Please end it before starting a new one.');
      return;
    }

    try {
      setBreakLoading(true);
      
      const breaks = Array.isArray(currentShift.breaks) ? currentShift.breaks : [];
      const newBreak = {
        start_time: new Date().toISOString(),
        end_time: null,
        note: null
      };
      
      breaks.push(newBreak);
      
      const { data, error } = await supabase
        .from('ruben')
        .update({
          breaks: breaks
        })
        .eq('id', currentShift.id)
        .select()
        .single();

      if (error) throw error;

      setCurrentShift(data);
    } catch (err) {
      console.error('Error starting break:', err);
      alert('Failed to start break. Please try again.');
    } finally {
      setBreakLoading(false);
    }
  };

  const handleEndBreak = async () => {
    const activeBreak = getCurrentBreak();
    if (!activeBreak) {
      alert('No active break found.');
      return;
    }

    setShowBreakModal(true);
  };

  const confirmEndBreak = async () => {
    if (!breakNote.trim()) {
      alert('Please enter what you ate.');
      return;
    }

    try {
      setBreakLoading(true);
      
      const breaks = Array.isArray(currentShift.breaks) ? currentShift.breaks : [];
      const activeBreakIndex = breaks.findIndex(b => !b.end_time);
      
      if (activeBreakIndex === -1) {
        alert('No active break found.');
        setBreakLoading(false);
        return;
      }

      breaks[activeBreakIndex] = {
        ...breaks[activeBreakIndex],
        end_time: new Date().toISOString(),
        note: breakNote.trim()
      };
      
      const { data, error } = await supabase
        .from('ruben')
        .update({
          breaks: breaks
        })
        .eq('id', currentShift.id)
        .select()
        .single();

      if (error) throw error;

      setCurrentShift(data);
      setShowBreakModal(false);
      setBreakNote('');
    } catch (err) {
      console.error('Error ending break:', err);
      alert('Failed to end break. Please try again.');
    } finally {
      setBreakLoading(false);
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
        
        {currentShift && (() => {
          const activeBreak = getCurrentBreak();
          return (
            <>
              <div style={{
                backgroundColor: activeBreak ? '#fef3c7' : '#f0fdf4',
                border: `2px solid ${activeBreak ? '#f59e0b' : '#22c55e'}`,
                borderRadius: '12px',
                padding: '20px',
                marginBottom: '16px'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  marginBottom: '16px'
                }}>
                  <Clock size={24} color={activeBreak ? "#f59e0b" : "#22c55e"} />
                  <span style={{
                    fontSize: '16px',
                    fontWeight: '600',
                    color: activeBreak ? '#92400e' : '#166534'
                  }}>
                    {activeBreak ? 'On Break' : 'Shift Active'}
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

              {activeBreak && (
                <div style={{
                  backgroundColor: '#fef3c7',
                  border: '2px solid #f59e0b',
                  borderRadius: '12px',
                  padding: '16px',
                  marginBottom: '24px'
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    marginBottom: '12px'
                  }}>
                    <Coffee size={20} color="#f59e0b" />
                    <span style={{
                      fontSize: '14px',
                      fontWeight: '600',
                      color: '#92400e'
                    }}>
                      Break Active
                    </span>
                  </div>
                  
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}>
                    <div>
                      <span style={{
                        fontSize: '12px',
                        color: '#78350f',
                        display: 'block',
                        marginBottom: '2px'
                      }}>
                        Break Started
                      </span>
                      <span style={{
                        fontSize: '16px',
                        fontWeight: '600',
                        color: '#92400e'
                      }}>
                        {formatTime(activeBreak.start_time)}
                      </span>
                    </div>
                    
                    <div>
                      <span style={{
                        fontSize: '12px',
                        color: '#78350f',
                        display: 'block',
                        marginBottom: '2px'
                      }}>
                        Break Duration
                      </span>
                      <span style={{
                        fontSize: '16px',
                        fontWeight: '600',
                        color: '#92400e'
                      }}>
                        {formatDuration(activeBreak.start_time)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </>
          );
        })()}

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
            <>
              {!getCurrentBreak() ? (
                <button
                  onClick={handleStartBreak}
                  disabled={breakLoading}
                  style={{
                    width: '100%',
                    padding: '20px',
                    backgroundColor: breakLoading ? '#9ca3af' : '#f59e0b',
                    color: 'white',
                    border: 'none',
                    borderRadius: '12px',
                    fontSize: '18px',
                    fontWeight: '600',
                    cursor: breakLoading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '12px',
                    boxShadow: breakLoading ? 'none' : '0 4px 6px rgba(0,0,0,0.1)',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    if (!breakLoading) {
                      e.currentTarget.style.backgroundColor = '#d97706';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!breakLoading) {
                      e.currentTarget.style.backgroundColor = '#f59e0b';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }
                  }}
                >
                  <Coffee size={24} fill="white" />
                  {breakLoading ? 'Starting...' : 'Start Break'}
                </button>
              ) : (
                <button
                  onClick={handleEndBreak}
                  disabled={breakLoading}
                  style={{
                    width: '100%',
                    padding: '20px',
                    backgroundColor: breakLoading ? '#9ca3af' : '#22c55e',
                    color: 'white',
                    border: 'none',
                    borderRadius: '12px',
                    fontSize: '18px',
                    fontWeight: '600',
                    cursor: breakLoading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '12px',
                    boxShadow: breakLoading ? 'none' : '0 4px 6px rgba(0,0,0,0.1)',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    if (!breakLoading) {
                      e.currentTarget.style.backgroundColor = '#16a34a';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!breakLoading) {
                      e.currentTarget.style.backgroundColor = '#22c55e';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }
                  }}
                >
                  <RotateCcw size={24} fill="white" />
                  {breakLoading ? 'Ending...' : 'End Break'}
                </button>
              )}
              
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
            </>
          )}
        </div>
      </div>

      {/* Break End Modal */}
      {showBreakModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setShowBreakModal(false);
            setBreakNote('');
          }
        }}
        >
          <div style={{
            backgroundColor: 'white',
            borderRadius: '16px',
            padding: '24px',
            maxWidth: '400px',
            width: '100%',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '20px'
            }}>
              <h2 style={{
                fontSize: '20px',
                fontWeight: '700',
                color: '#111827',
                margin: 0
              }}>
                End Break
              </h2>
              <button
                onClick={() => {
                  setShowBreakModal(false);
                  setBreakNote('');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <X size={20} color="#6b7280" />
              </button>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '600',
                color: '#374151',
                marginBottom: '8px'
              }}>
                What did you eat?
              </label>
              <input
                type="text"
                value={breakNote}
                onChange={(e) => setBreakNote(e.target.value)}
                placeholder="e.g., Sandwich, Pizza, Salad..."
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '16px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    confirmEndBreak();
                  }
                }}
                autoFocus
              />
            </div>

            <div style={{
              display: 'flex',
              gap: '12px'
            }}>
              <button
                onClick={() => {
                  setShowBreakModal(false);
                  setBreakNote('');
                }}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmEndBreak}
                disabled={!breakNote.trim() || breakLoading}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: (!breakNote.trim() || breakLoading) ? '#9ca3af' : '#22c55e',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: (!breakNote.trim() || breakLoading) ? 'not-allowed' : 'pointer'
                }}
              >
                {breakLoading ? 'Saving...' : 'End Break'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


