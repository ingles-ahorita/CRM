import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { supabase } from '../../lib/supabaseClient';
import { Mail, Phone, User, Calendar, AlertTriangle } from 'lucide-react';

export function EndShiftModal({ isOpen, onClose, mode, userId, setterMap = {}, closerMap = {}, currentShiftId = null, onShiftEnded, leads = [] }) {
  const [incompleteLeads, setIncompleteLeads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [closingNote, setClosingNote] = useState('');
  const [closingShift, setClosingShift] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchIncompleteLeads();
    }
  }, [isOpen, mode, userId]);

  const handleEndShift = async () => {
    if (!closingNote.trim()) {
      alert('Please provide a closing note before ending your shift.');
      return;
    }

    if (!currentShiftId) {
      alert('No active shift found. Please contact support.');
      return;
    }

    setClosingShift(true);
    try {
      // Determine the correct table based on mode
      const shiftsTable = mode === 'closer' ? 'closer_shifts' : 'setter_shifts';
      
      // First, fetch the shift to get start_time
      const { data: shiftData, error: shiftError } = await supabase
        .from(shiftsTable)
        .select('start_time')
        .eq('id', currentShiftId)
        .single();

      if (shiftError || !shiftData) {
        console.error('Error fetching shift:', shiftError);
        alert('Failed to fetch shift data. Please try again.');
        return;
      }

      // Calculate average responseTimeMinutes for calls during this shift
      let avgCallTime = null;
      const endTime = new Date();
      const startTime = new Date(shiftData.start_time);
      
      // Filter leads that were booked during this shift period
      const shiftLeads = leads.filter(lead => {
        if (!lead.book_date) return false;
        const bookDate = new Date(lead.book_date);
        return bookDate >= startTime && bookDate <= endTime;
      });

      // Further filter by user type if needed
      let filteredLeads = shiftLeads;
      if (mode === 'setter' && userId) {
        filteredLeads = shiftLeads.filter(lead => lead.setter_id === userId);
      } else if (mode === 'closer' && userId) {
        filteredLeads = shiftLeads.filter(lead => lead.closer_id === userId);
      }

      // Calculate average of responseTimeMinutes from the passed leads
      if (filteredLeads.length > 0) {
        const responseTimes = filteredLeads
          .filter(lead => lead.called && lead.responseTimeMinutes !== null && lead.responseTimeMinutes !== undefined)
          .map(lead => lead.responseTimeMinutes);

        if (responseTimes.length > 0) {
          const totalResponseTime = responseTimes.reduce((sum, time) => sum + time, 0);
          avgCallTime = Math.round((totalResponseTime / responseTimes.length) * 100) / 100; // Round to 2 decimal places
        }
      }

      // Update the shift to closed status with closing note and avg call time
      const updateData = {
        status: 'closed',
        end_time: endTime.toISOString(),
        closing_note: closingNote.trim()
      };

      if (avgCallTime !== null) {
        updateData.avg_call_time = avgCallTime;
      }

      const { error: updateError } = await supabase
        .from(shiftsTable)
        .update(updateData)
        .eq('id', currentShiftId);

      if (updateError) {
        console.error('Error closing shift:', updateError);
        alert('Failed to close shift. Please try again.');
        return;
      }

      console.log('Shift closed successfully');
      onShiftEnded();
      onClose();
    } catch (err) {
      console.error('Error closing shift:', err);
      alert('An unexpected error occurred. Please try again.');
    } finally {
      setClosingShift(false);
    }
  };

  const fetchIncompleteLeads = async () => {
    setLoading(true);
    try {
      // Only include 'calls' in the last 24 hours by 'book_date'
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      let query = supabase
        .from('calls')
        .select(`
          *,
          setters (id, name),
          closers (id, name)
        `)
        .gte('book_date', yesterday.toISOString())
        .order('book_date', { ascending: false });

      // Filter by user type
      if (mode === 'setter' && userId) {
        query = query.eq('setter_id', userId);
      } else if (mode === 'closer' && userId) {
        query = query.eq('closer_id', userId);
      }

      const { data: leads, error } = await query;

      if (error) {
        console.error('Error fetching leads:', error);
        return;
      }

      // Filter for incomplete leads based on mode
      const incomplete = leads.filter(lead => {
        if (mode === 'closer') {
          // For closers, only check show up and purchase
          const isMissingShowUp = lead.showed_up === null || lead.showed_up === undefined;
          const isMissingPurchase = lead.purchased === null || lead.purchased === undefined;
          return isMissingShowUp || isMissingPurchase;
        } else {
          // For setters, check pick up, confirmed, and note
          const isMissingPickUp = lead.picked_up === null || lead.picked_up === undefined;
          const isMissingConfirmed = lead.confirmed === null || lead.confirmed === undefined;
          const isMissingNote = !lead.setter_note_id;
          return isMissingPickUp || isMissingConfirmed || isMissingNote;
        }
      });

      setIncompleteLeads(incomplete);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const getMissingFields = (lead) => {
    const missing = [];
    if (mode === 'closer') {
      // For closers, only check show up and purchase
      if (lead.showed_up === null || lead.showed_up === undefined) {
        missing.push('Show Up');
      }
      if (lead.purchased === null || lead.purchased === undefined) {
        missing.push('Purchase');
      }
      if (!lead.closer_note_id) {
        missing.push('Closer Note');
      }
    } else {
      // For setters, check pick up, confirmed, and note
      if (lead.picked_up === null || lead.picked_up === undefined) {
        missing.push('Pick Up');
      }
      if (lead.confirmed === null || lead.confirmed === undefined) {
        missing.push('Confirmed');
      }
      if (!lead.setter_note_id) {
        missing.push('Setter Note');
      }
    }
    return missing;
  };

  const getFieldColor = (field) => {
    switch (field) {
      case 'Pick Up': return '#ef4444'; // red
      case 'Confirmed': return '#f59e0b'; // yellow
      case 'Setter Note': return '#8b5cf6'; // purple
      case 'Show Up': return '#10b981'; // green
      case 'Purchase': return '#3b82f6'; // blue
      default: return '#6b7280';
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="end-shift-modal">
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', maxHeight: '90vh', overflow: 'hidden' }}>
        {/* Header - Fixed */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '12px', 
          marginBottom: '24px',
          paddingBottom: '16px',
          borderBottom: '2px solid #e5e7eb',
          flexShrink: 0
        }}>
          <AlertTriangle size={24} color="#f59e0b" />
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827', margin: 0 }}>
            End of Shift Report
          </h2>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <div style={{ fontSize: '18px', color: '#6b7280' }}>Loading incomplete leads...</div>
          </div>
        ) : incompleteLeads.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', flexShrink: 0 }}>
            <div style={{ fontSize: '18px', color: '#10b981', fontWeight: '600' }}>
              🎉 All leads are complete! Great job!
            </div>
            <div style={{ fontSize: '14px', color: '#6b7280', marginTop: '8px' }}>
              {mode === 'closer' 
                ? 'No missing show ups or purchases found.'
                : 'No missing pick ups, confirmations, or setter notes found.'}
            </div>
          </div>
        ) : (
          <>
            <div style={{ 
              backgroundColor: '#fef3c7', 
              border: '1px solid #f59e0b', 
              borderRadius: '8px', 
              padding: '16px', 
              marginBottom: '20px',
              flexShrink: 0
            }}>
              <div style={{ fontSize: '16px', fontWeight: '600', color: '#92400e', marginBottom: '4px' }}>
                {incompleteLeads.length} lead{incompleteLeads.length !== 1 ? 's' : ''} need{incompleteLeads.length === 1 ? 's' : ''} attention
              </div>
              <div style={{ fontSize: '14px', color: '#92400e' }}>
                Please complete the missing fields before ending your shift.
              </div>
            </div>

            <div style={{ 
              flex: 1,
              overflowY: 'auto',
              minHeight: 0,
              maxHeight: 'calc(90vh - 400px)',
              paddingRight: '8px'
            }}>
              {incompleteLeads.map((lead, index) => {
                const missingFields = getMissingFields(lead);
                return (
                  <div
                    key={lead.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      padding: '16px',
                      backgroundColor: index % 2 === 0 ? '#f9fafb' : 'white',
                      borderBottom: '1px solid #e5e7eb',
                      transition: 'background-color 0.2s',
                      gap: '12px'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = index % 2 === 0 ? '#f9fafb' : 'white'}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ 
                        fontSize: '16px', 
                        fontWeight: '600', 
                        color: '#111827', 
                        marginBottom: '4px' 
                      }}>
                        {lead.name || 'No name'}
                      </div>
                      
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '16px', 
                        marginBottom: '8px',
                        flexWrap: 'wrap'
                      }}>
                        <div style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '4px', 
                          fontSize: '12px', 
                          color: '#6b7280',
                          minWidth: 0,
                          flex: '1 1 auto'
                        }}>
                          <Mail size={12} />
                          <span style={{ 
                            overflow: 'hidden', 
                            textOverflow: 'ellipsis', 
                            whiteSpace: 'nowrap' 
                          }}>
                            {lead.email || 'No email'}
                          </span>
                        </div>
                        
                        <div style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '4px', 
                          fontSize: '12px', 
                          color: '#6b7280',
                          minWidth: 0,
                          flex: '1 1 auto'
                        }}>
                          <Phone size={12} />
                          <span style={{ 
                            overflow: 'hidden', 
                            textOverflow: 'ellipsis', 
                            whiteSpace: 'nowrap' 
                          }}>
                            {lead.phone || 'No phone'}
                          </span>
                        </div>
                      </div>

                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '16px', 
                        fontSize: '12px', 
                        color: '#6b7280',
                        flexWrap: 'wrap'
                      }}>
                        <div style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '4px',
                          minWidth: 0,
                          flex: '1 1 auto'
                        }}>
                          <Calendar size={12} />
                          <span style={{ 
                            overflow: 'hidden', 
                            textOverflow: 'ellipsis', 
                            whiteSpace: 'nowrap' 
                          }}>
                            Booked: {new Date(lead.book_date).toLocaleDateString()}
                          </span>
                        </div>
                        
                        {lead.call_date && (
                          <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '4px',
                            minWidth: 0,
                            flex: '1 1 auto'
                          }}>
                            <Calendar size={12} />
                            <span style={{ 
                              overflow: 'hidden', 
                              textOverflow: 'ellipsis', 
                              whiteSpace: 'nowrap' 
                            }}>
                              Call: {new Date(lead.call_date).toLocaleDateString()}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      alignItems: 'flex-end', 
                      gap: '8px',
                      minWidth: 0,
                      flexShrink: 0
                    }}>
                      <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: '500' }}>
                        Missing:
                      </div>
                      <div style={{ 
                        display: 'flex', 
                        gap: '6px', 
                        flexWrap: 'wrap', 
                        justifyContent: 'flex-end',
                        maxWidth: '200px'
                      }}>
                        {missingFields.map((field, idx) => (
                          <span
                            key={idx}
                            style={{
                              backgroundColor: getFieldColor(field),
                              color: 'white',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: '600'
                            }}
                          >
                            {field}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Closing Note Section - Fixed */}
        <div style={{ 
          marginTop: '24px',
          paddingTop: '16px',
          borderTop: '1px solid #e5e7eb',
          flexShrink: 0
        }}>
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '8px', 
            marginBottom: '16px' 
          }}>
            <label style={{ fontSize: '14px', color: '#374151', fontWeight: '500' }}>
              Closing Note (Required)
            </label>
            <textarea
              value={closingNote}
              onChange={(e) => setClosingNote(e.target.value)}
              placeholder="Please provide a summary of your shift, any issues encountered, or notes for the next shift..."
              required
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                border: closingNote.trim() ? '1.5px solid #d1d5db' : '1.5px solid #ef4444',
                backgroundColor: closingNote.trim() ? '#ffffff' : '#fef2f2',
                color: '#374151',
                outline: 'none',
                boxShadow: closingNote.trim() ? '0 1px 3px rgba(0, 0, 0, 0.1)' : '0 1px 3px rgba(239, 68, 68, 0.2)',
                transition: 'border-color 0.2s, box-shadow 0.2s, background-color 0.2s',
                resize: 'vertical',
                minHeight: '80px',
                fontFamily: 'inherit'
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#3b82f6';
                e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
                e.target.style.backgroundColor = '#ffffff';
              }}
              onBlur={(e) => {
                if (closingNote.trim()) {
                  e.target.style.borderColor = '#d1d5db';
                  e.target.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';
                  e.target.style.backgroundColor = '#ffffff';
                } else {
                  e.target.style.borderColor = '#ef4444';
                  e.target.style.boxShadow = '0 1px 3px rgba(239, 68, 68, 0.2)';
                  e.target.style.backgroundColor = '#fef2f2';
                }
              }}
            />
            {!closingNote.trim() && (
              <div style={{ 
                fontSize: '12px', 
                color: '#ef4444', 
                fontWeight: '500'
              }}>
                * Closing note is required to end your shift
              </div>
            )}
          </div>
        </div>

        {/* Buttons - Fixed */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'flex-end', 
          gap: '12px', 
          marginTop: '16px',
          flexWrap: 'wrap',
          flexShrink: 0
        }}>
          <button
            onClick={onClose}
            disabled={closingShift}
            style={{
              padding: '10px 20px',
              backgroundColor: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: closingShift ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              opacity: closingShift ? 0.6 : 1
            }}
          >
            Cancel
          </button>
          
          {incompleteLeads.length > 0 ? (
            <button
              onClick={() => {
                alert('Please complete all missing fields before ending your shift.');
              }}
              style={{
                padding: '10px 20px',
                backgroundColor: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500'
              }}
            >
              End Shift (Incomplete)
            </button>
          ) : (
            <button
              onClick={handleEndShift}
              disabled={!closingNote.trim() || closingShift}
              style={{
                padding: '10px 20px',
                backgroundColor: (!closingNote.trim() || closingShift) ? '#9ca3af' : '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: (!closingNote.trim() || closingShift) ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              {closingShift ? (
                <>
                  <div style={{
                    width: '16px',
                    height: '16px',
                    border: '2px solid #ffffff',
                    borderTop: '2px solid transparent',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                  }} />
                  Ending Shift...
                </>
              ) : (
                'End Shift'
              )}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
