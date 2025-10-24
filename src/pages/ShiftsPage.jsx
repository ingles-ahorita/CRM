import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Calendar, Clock, User, FileText, CheckCircle, Circle } from 'lucide-react';

export default function ShiftsPage() {
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState('start_time');
  const [sortOrder, setSortOrder] = useState('desc');
  const [filterStatus, setFilterStatus] = useState('all'); // all, open, closed

  useEffect(() => {
    fetchShifts();
  }, [sortBy, sortOrder, filterStatus]);

  const fetchShifts = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('setter_shifts')
        .select(`
          *,
          setters(
            id,
            name
          )
        `);

      // Apply status filter
      if (filterStatus !== 'all') {
        query = query.eq('status', filterStatus);
      }

      // Apply sorting
      query = query.order(sortBy, { ascending: sortOrder === 'asc' });

      const { data, error } = await query;

      if (error) throw error;
      setShifts(data || []);
    } catch (err) {
      console.error('Error fetching shifts:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDuration = (startTime, endTime) => {
    if (!startTime || !endTime) return 'N/A';
    const start = new Date(startTime);
    const end = new Date(endTime);
    const diffMs = end - start;
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  const getStatusIcon = (status) => {
    return status === 'open' ? (
      <Circle size={16} className="text-yellow-500" />
    ) : (
      <CheckCircle size={16} className="text-green-500" />
    );
  };

  const getStatusColor = (status) => {
    return status === 'open' 
      ? 'bg-yellow-100 text-yellow-800 border-yellow-200' 
      : 'bg-green-100 text-green-800 border-green-200';
  };

  if (loading) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        backgroundColor: '#f9fafb', 
        padding: '24px', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center' 
      }}>
        <div style={{ fontSize: '18px', color: '#6b7280' }}>Loading shifts...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        backgroundColor: '#f9fafb', 
        padding: '24px', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center' 
      }}>
        <div style={{ fontSize: '18px', color: '#dc2626' }}>Error: {error}</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ 
            fontSize: '28px', 
            fontWeight: 'bold', 
            color: '#111827', 
            marginBottom: '8px' 
          }}>
            Shift Management
          </h1>
          <p style={{ color: '#6b7280', fontSize: '16px' }}>
            View and manage all setter and closer shifts
          </p>
        </div>

        {/* Controls */}
        <div style={{ 
          display: 'flex', 
          gap: '16px', 
          marginBottom: '24px',
          flexWrap: 'wrap',
          alignItems: 'center'
        }}>
          {/* Status Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>
              Status:
            </label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{
                padding: '6px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                backgroundColor: 'white'
              }}
            >
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          {/* Sort By */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>
              Sort by:
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{
                padding: '6px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                backgroundColor: 'white'
              }}
            >
              <option value="start_time">Start Time</option>
              <option value="end_time">End Time</option>
              <option value="created_at">Created</option>
            </select>
          </div>

          {/* Sort Order */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>
              Order:
            </label>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              style={{
                padding: '6px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                backgroundColor: 'white'
              }}
            >
              <option value="desc">Newest First</option>
              <option value="asc">Oldest First</option>
            </select>
          </div>
        </div>

        {/* Shifts Table */}
        <div style={{ 
          backgroundColor: 'white', 
          borderRadius: '8px', 
          border: '1px solid #e5e7eb',
          overflow: 'hidden'
        }}>
          {shifts.length === 0 ? (
            <div style={{ 
              padding: '48px', 
              textAlign: 'center', 
              color: '#6b7280' 
            }}>
              <Clock size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
              <p style={{ fontSize: '16px', marginBottom: '8px' }}>No shifts found</p>
              <p style={{ fontSize: '14px' }}>Shifts will appear here once they are created</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                      Status
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                      User
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                      Start Time
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                      End Time
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                      Duration
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                      Closing Note
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shifts.map((shift) => (
                    <tr 
                      key={shift.id}
                      style={{ 
                        borderBottom: '1px solid #f3f4f6',
                        transition: 'background-color 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                    >
                      {/* Status */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '8px' 
                        }}>
                          {getStatusIcon(shift.status)}
                          <span 
                            style={{
                              padding: '4px 8px',
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontWeight: '500',
                              border: '1px solid',
                              ...(shift.status === 'open' 
                                ? { backgroundColor: '#fef3c7', color: '#92400e', borderColor: '#f59e0b' }
                                : { backgroundColor: '#dcfce7', color: '#166534', borderColor: '#22c55e' }
                              )
                            }}
                          >
                            {shift.status === 'open' ? 'Open' : 'Closed'}
                          </span>
                        </div>
                      </td>

                      {/* User */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <User size={16} style={{ color: '#6b7280' }} />
                          <div>
                            <div style={{ fontWeight: '500', color: '#111827' }}>
                              {shift.setters?.name || 'Unknown'}
                            </div>
                            <div style={{ fontSize: '12px', color: '#6b7280' }}>
                              {shift.setters ? 'Setter' : 'Closer'}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Start Time */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Calendar size={16} style={{ color: '#6b7280' }} />
                          <span style={{ fontSize: '14px', color: '#374151' }}>
                            {formatDate(shift.start_time)}
                          </span>
                        </div>
                      </td>

                      {/* End Time */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Calendar size={16} style={{ color: '#6b7280' }} />
                          <span style={{ fontSize: '14px', color: '#374151' }}>
                            {shift.end_time ? formatDate(shift.end_time) : 'Still active'}
                          </span>
                        </div>
                      </td>

                      {/* Duration */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Clock size={16} style={{ color: '#6b7280' }} />
                          <span style={{ fontSize: '14px', color: '#374151' }}>
                            {shift.end_time ? formatDuration(shift.start_time, shift.end_time) : 'Ongoing'}
                          </span>
                        </div>
                      </td>

                      {/* Closing Note */}
                      <td style={{ padding: '12px 16px' }}>
                        {shift.closing_note ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <FileText size={16} style={{ color: '#6b7280' }} />
                            <span 
                              style={{ 
                                fontSize: '14px', 
                                color: '#374151',
                                maxWidth: '200px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                cursor: 'pointer'
                              }}
                              title={shift.closing_note}
                            >
                              {shift.closing_note}
                            </span>
                          </div>
                        ) : (
                          <span style={{ fontSize: '14px', color: '#9ca3af', fontStyle: 'italic' }}>
                            {shift.status === 'open' ? 'No note yet' : 'No note provided'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Summary */}
        {shifts.length > 0 && (
          <div style={{ 
            marginTop: '24px', 
            padding: '16px', 
            backgroundColor: 'white', 
            borderRadius: '8px', 
            border: '1px solid #e5e7eb' 
          }}>
            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
              <div>
                <span style={{ fontSize: '14px', color: '#6b7280' }}>Total Shifts: </span>
                <span style={{ fontSize: '16px', fontWeight: '600', color: '#111827' }}>
                  {shifts.length}
                </span>
              </div>
              <div>
                <span style={{ fontSize: '14px', color: '#6b7280' }}>Open Shifts: </span>
                <span style={{ fontSize: '16px', fontWeight: '600', color: '#f59e0b' }}>
                  {shifts.filter(s => s.status === 'open').length}
                </span>
              </div>
              <div>
                <span style={{ fontSize: '14px', color: '#6b7280' }}>Closed Shifts: </span>
                <span style={{ fontSize: '16px', fontWeight: '600', color: '#22c55e' }}>
                  {shifts.filter(s => s.status === 'closed').length}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
