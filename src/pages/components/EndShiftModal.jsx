import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { supabase } from '../../lib/supabaseClient';
import { Mail, Phone, User, Calendar, AlertTriangle } from 'lucide-react';

export function EndShiftModal({ isOpen, onClose, mode, userId, setterMap = {}, closerMap = {} }) {
  const [incompleteLeads, setIncompleteLeads] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchIncompleteLeads();
    }
  }, [isOpen, mode, userId]);

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

      // Filter for incomplete leads
      const incomplete = leads.filter(lead => {
        const isMissingPickUp = lead.picked_up === null || lead.picked_up === undefined;
        const isMissingConfirmed = lead.confirmed === null || lead.confirmed === undefined;
        const isMissingNote = mode === 'setter' ? !lead.setter_note_id : !lead.closer_note_id;
        
        return isMissingPickUp || isMissingConfirmed || isMissingNote;
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
    if (lead.picked_up === null || lead.picked_up === undefined) {
      missing.push('Pick Up');
    }
    if (lead.confirmed === null || lead.confirmed === undefined) {
      missing.push('Confirmed');
    }
    if (!lead.setter_note_id) {
      missing.push('Setter Note');
    }
    return missing;
  };

  const getFieldColor = (field) => {
    switch (field) {
      case 'Pick Up': return '#ef4444'; // red
      case 'Confirmed': return '#f59e0b'; // yellow
      case 'Setter Note': return '#8b5cf6'; // purple
      default: return '#6b7280';
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div style={{ minWidth: '600px', maxWidth: '800px' }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '12px', 
          marginBottom: '24px',
          paddingBottom: '16px',
          borderBottom: '2px solid #e5e7eb'
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
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <div style={{ fontSize: '18px', color: '#10b981', fontWeight: '600' }}>
              🎉 All leads are complete! Great job!
            </div>
            <div style={{ fontSize: '14px', color: '#6b7280', marginTop: '8px' }}>
              No missing pick ups, confirmations, or setter notes found.
            </div>
          </div>
        ) : (
          <>
            <div style={{ 
              backgroundColor: '#fef3c7', 
              border: '1px solid #f59e0b', 
              borderRadius: '8px', 
              padding: '16px', 
              marginBottom: '20px' 
            }}>
              <div style={{ fontSize: '16px', fontWeight: '600', color: '#92400e', marginBottom: '4px' }}>
                {incompleteLeads.length} lead{incompleteLeads.length !== 1 ? 's' : ''} need{incompleteLeads.length === 1 ? 's' : ''} attention
              </div>
              <div style={{ fontSize: '14px', color: '#92400e' }}>
                Please complete the missing fields before ending your shift.
              </div>
            </div>

            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {incompleteLeads.map((lead, index) => {
                const missingFields = getMissingFields(lead);
                return (
                  <div
                    key={lead.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '16px',
                      backgroundColor: index % 2 === 0 ? '#f9fafb' : 'white',
                      borderBottom: '1px solid #e5e7eb',
                      transition: 'background-color 0.2s'
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
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#6b7280' }}>
                          <Mail size={12} />
                          <span>{lead.email || 'No email'}</span>
                        </div>
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#6b7280' }}>
                          <Phone size={12} />
                          <span>{lead.phone || 'No phone'}</span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px', color: '#6b7280' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Calendar size={12} />
                          <span>Booked: {new Date(lead.book_date).toLocaleDateString()}</span>
                        </div>
                        
                        {lead.call_date && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Calendar size={12} />
                            <span>Call: {new Date(lead.call_date).toLocaleDateString()}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                      <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: '500' }}>
                        Missing:
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
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

        <div style={{ 
          display: 'flex', 
          justifyContent: 'flex-end', 
          gap: '12px', 
          marginTop: '24px',
          paddingTop: '16px',
          borderTop: '1px solid #e5e7eb'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px',
              backgroundColor: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            Close
          </button>
          
          {incompleteLeads.length > 0 && (
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
          )}
        </div>
      </div>
    </Modal>
  );
}
