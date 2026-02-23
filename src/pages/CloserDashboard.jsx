import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import CloserDashboardCards from './components/CloserDashboardCards';

export default function CloserDashboard() {
  const { closer } = useParams();
  const navigate = useNavigate();
  const [closerName, setCloserName] = useState('');

  useEffect(() => {
    if (!closer) return;
    let cancelled = false;
    supabase.from('closers').select('id, name').eq('id', closer).maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data?.name) setCloserName(data.name);
      });
    return () => { cancelled = true; };
  }, [closer]);

  if (!closer) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-6xl mx-auto">Invalid closer.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mb-4 px-3 py-1.5 rounded bg-gray-600 text-white text-sm hover:bg-gray-700"
        >
          ← Back
        </button>
        <h1 className="text-3xl font-bold text-gray-900 mb-6">
          {closerName || 'Closer'} Dashboard
        </h1>

        <CloserDashboardCards closer={closer} />
      </div>
    </div>
  );
}
