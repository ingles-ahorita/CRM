import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function AISetterPage() {
  const [systemPrompt, setSystemPrompt] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [testMessage, setTestMessage] = useState('');
  const [testState, setTestState] = useState('{}');
  const [response, setResponse] = useState(null);
  const [calling, setCalling] = useState(false);
  
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast({ show: false, message: '', type: 'success' });
    }, 3000);
  };

  useEffect(() => {
    fetchSystemPrompt();
  }, []);

  const fetchSystemPrompt = async () => {
    try {
      const { data, error } = await supabase
        .from('ai_prompts')
        .select('prompt')
        .eq('id', 1)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching system prompt:', error);
      } else if (data) {
        setSystemPrompt(data.prompt || '');
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSystemPrompt = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('ai_prompts')
        .update({
          prompt: systemPrompt
        })
        .eq('id', 1);
      if (error) throw error;
      showToast('System prompt saved successfully!', 'success');
    } catch (error) {
      console.error('Error saving system prompt:', error);
      showToast('Error saving system prompt: ' + error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const callAI = async () => {
    console.log('Calling AI...');
    setCalling(true);
    setResponse(null);
    try {
      let parsedState = {};
      try {
        parsedState = JSON.parse(testState);
      } catch (e) {
        showToast('Invalid JSON in state field', 'error');
        setCalling(false);
        return;
      }

      const res = await fetch('/api/ai-setter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: testMessage,
          state: parsedState
        })
      }).catch((fetchError) => {
        // Network error - API server might not be running
        throw new Error(`Failed to connect to API. Make sure the server is running on port 3000. ${fetchError.message}`);
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(errorData.message || errorData.error || `HTTP error! status: ${res.status}`);
      }

      const data = await res.json();
      setResponse(data);
    } catch (error) {
      console.error('Error calling AI:', error);
      showToast('Error calling AI: ' + error.message, 'error');
    } finally {
      setCalling(false);
    }
  };

  if (loading) {
    return <div style={{ padding: '24px' }}>Loading...</div>;
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '32px' }}>
        AI Setter Configuration
      </h1>

      {/* System Prompt Editor */}
      <div style={{ 
        backgroundColor: 'white', 
        borderRadius: '8px', 
        padding: '24px', 
        marginBottom: '32px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '16px' }}>
          System Prompt
        </h2>
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="Enter system prompt..."
          style={{
            width: '100%',
            minHeight: '150px',
            padding: '12px',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            fontSize: '14px',
            fontFamily: 'monospace',
            resize: 'vertical',
            outline: 'none',
            marginBottom: '12px'
          }}
        />
        <button
          onClick={saveSystemPrompt}
          disabled={saving}
          style={{
            padding: '10px 24px',
            backgroundColor: saving ? '#9ca3af' : '#001749ff',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: saving ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: '500'
          }}
        >
          {saving ? 'Saving...' : 'Save Prompt'}
        </button>
      </div>

      {/* Test API */}
      <div style={{ 
        backgroundColor: 'white', 
        borderRadius: '8px', 
        padding: '24px',
        marginBottom: '32px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '16px' }}>
          Test AI Setter
        </h2>
        
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
            Message:
          </label>
          <input
            type="text"
            value={testMessage}
            onChange={(e) => setTestMessage(e.target.value)}
            placeholder="Enter test message..."
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
              outline: 'none'
            }}
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
            State (JSON):
          </label>
          <textarea
            value={testState}
            onChange={(e) => setTestState(e.target.value)}
            placeholder='{"key": "value"}'
            style={{
              width: '100%',
              minHeight: '80px',
              padding: '10px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
              fontFamily: 'monospace',
              resize: 'vertical',
              outline: 'none'
            }}
          />
        </div>

        <button
          onClick={callAI}
          disabled={calling || !testMessage}
          style={{
            padding: '10px 24px',
            backgroundColor: (calling || !testMessage) ? '#9ca3af' : '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: (calling || !testMessage) ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: '500'
          }}
        >
          {calling ? 'Calling...' : 'Call AI Setter'}
        </button>
      </div>

      {/* Response View */}
      {response && response.response && (
        <div style={{ 
          backgroundColor: 'white', 
          borderRadius: '8px', 
          padding: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '16px' }}>
            Response
          </h2>
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontWeight: '500', marginBottom: '8px', color: '#374151' }}>Reply:</div>
            <div style={{
              padding: '16px',
              backgroundColor: '#f9fafb',
              borderRadius: '6px',
              fontSize: '14px',
              border: '1px solid #e5e7eb',
              whiteSpace: 'pre-wrap'
            }}>
              {response.response.reply || 'No reply in response'}
            </div>
          </div>
          <div>
            <div style={{ fontWeight: '500', marginBottom: '8px', color: '#374151' }}>Action:</div>
            <div style={{
              padding: '16px',
              backgroundColor: '#f9fafb',
              borderRadius: '6px',
              fontSize: '14px',
              border: '1px solid #e5e7eb'
            }}>
              {response.response.action || 'No action in response'}
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast.show && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            padding: '12px 20px',
            backgroundColor: toast.type === 'success' ? '#10b981' : '#ef4444',
            color: 'white',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 1000,
            fontSize: '14px',
            fontWeight: '500',
            animation: 'slideIn 0.3s ease-out'
          }}
        >
          {toast.message}
        </div>
      )}

      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
