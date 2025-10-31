import React, { useState } from 'react';
import { Modal } from './Modal';
import { supabase } from '../../lib/supabaseClient';
import { Clock, User } from 'lucide-react';

export function StartShiftModal({ isOpen, onClose, userId, userName, onShiftStarted, mode = 'setter' }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleStartShift = async () => {
    setLoading(true);
    setError('');

    try {
      if (!userId) {
        setError('User ID is required to start a shift.');
        setLoading(false);
        return;
      }

      // Create a new shift entry
      const shiftData = {
        start_time: new Date().toISOString(),
        status: 'open'
      };

      // Determine the correct table based on mode
      const shiftsTable = mode === 'closer' ? 'closer_shifts' : 'setter_shifts';
      
      if (mode === 'setter') {
        shiftData.setter_id = userId;
      } else if (mode === 'closer') {
        shiftData.closer_id = userId;
      } 

      console.log('Starting shift with data:', { shiftsTable, shiftData, mode, userId });

      const { data, error: insertError } = await supabase
        .from(shiftsTable)
        .insert(shiftData)
        .select()
        .single();

      if (insertError) {
        console.error('Error starting shift:', insertError);
        console.error('Error details:', {
          shiftsTable,
          shiftData,
          mode,
          userId,
          errorMessage: insertError.message,
          errorDetails: insertError.details,
          errorHint: insertError.hint
        });
        setError(`Failed to start shift: ${insertError.message || 'Please try again.'}`);
        return;
      }

      console.log('Shift started successfully:', data);
      onShiftStarted(data);
      onClose();
    } catch (err) {
      console.error('Error starting shift:', err);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div style={{ minWidth: '400px' }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '12px', 
          marginBottom: '24px',
          paddingBottom: '16px',
          borderBottom: '2px solid #e5e7eb'
        }}>
          <Clock size={24} color="#10b981" />
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827', margin: 0 }}>
            Start Shift
          </h2>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px', 
            marginBottom: '8px' 
          }}>
            <User size={16} color="#6b7280" />
            <span style={{ fontSize: '14px', color: '#6b7280' }}>
              Starting shift for: <strong>{userName}</strong>
            </span>
          </div>
          <p style={{ fontSize: '14px', color: '#6b7280', margin: 0 }}>
            This will create a new shift entry and track your work time.
          </p>
        </div>

        {error && (
          <div style={{ 
            backgroundColor: '#fef2f2', 
            border: '1px solid #fecaca', 
            borderRadius: '6px', 
            padding: '12px', 
            marginBottom: '20px' 
          }}>
            <p style={{ color: '#dc2626', margin: 0, fontSize: '14px' }}>
              {error}
            </p>
          </div>
        )}

        <div style={{ 
          display: 'flex', 
          justifyContent: 'flex-end', 
          gap: '12px' 
        }}>
          <button
            onClick={onClose}
            disabled={loading}
            style={{
              padding: '10px 20px',
              backgroundColor: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              opacity: loading ? 0.6 : 1
            }}
          >
            Cancel
          </button>
          
          <button
            onClick={handleStartShift}
            disabled={loading}
            style={{
              padding: '10px 20px',
              backgroundColor: loading ? '#9ca3af' : '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            {loading ? (
              <>
                <div style={{
                  width: '16px',
                  height: '16px',
                  border: '2px solid #ffffff',
                  borderTop: '2px solid transparent',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }} />
                Starting...
              </>
            ) : (
              <>
                <Clock size={16} />
                Start Shift
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
