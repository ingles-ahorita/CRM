import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Calendar, Clock, CheckCircle, Circle, Save, X, Edit, Coffee, Plus, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';

export default function RubenShiftsView() {
  const [allShifts, setAllShifts] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingShiftId, setEditingShiftId] = useState(null);
  const [editingBreakIndex, setEditingBreakIndex] = useState(null);
  const [editedShift, setEditedShift] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newShift, setNewShift] = useState({
    start_time: '',
    end_time: '',
    status: 'closed',
    breaks: []
  });
  const [currentFortnight, setCurrentFortnight] = useState(() => {
    // Get current fortnight (1-15 or 16-end of month)
    const now = new Date();
    const day = now.getDate();
    return day <= 15 ? 1 : 2;
  });
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return now.getMonth();
  });
  const [currentYear, setCurrentYear] = useState(() => {
    const now = new Date();
    return now.getFullYear();
  });

  useEffect(() => {
    fetchShifts();
  }, []);

  useEffect(() => {
    filterShiftsByFortnight();
  }, [allShifts, currentFortnight, currentMonth, currentYear]);

  const fetchShifts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('ruben')
        .select('*')
        .order('start_time', { ascending: true });

      if (error) throw error;
      setAllShifts(data || []);
    } catch (err) {
      console.error('Error fetching shifts:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getFortnightDates = (fortnight, month, year) => {
    const startDay = fortnight === 1 ? 1 : 16;
    const endDay = fortnight === 1 ? 15 : new Date(year, month + 1, 0).getDate();
    
    const startDate = new Date(year, month, startDay, 0, 0, 0);
    const endDate = new Date(year, month, endDay, 23, 59, 59);
    
    return { startDate, endDate };
  };

  const filterShiftsByFortnight = () => {
    const { startDate, endDate } = getFortnightDates(currentFortnight, currentMonth, currentYear);
    
    const filtered = allShifts.filter(shift => {
      const shiftDate = new Date(shift.start_time);
      return shiftDate >= startDate && shiftDate <= endDate;
    });
    
    setShifts(filtered);
  };

  const calculateFortnightSummary = () => {
    const { startDate, endDate } = getFortnightDates(currentFortnight, currentMonth, currentYear);
    
    const fortnightShifts = allShifts.filter(shift => {
      const shiftDate = new Date(shift.start_time);
      return shiftDate >= startDate && shiftDate <= endDate;
    });

    let totalHours = 0;
    let totalMinutes = 0;
    let totalBreaks = 0;
    let totalBreakMinutes = 0;
    let closedShifts = 0;
    let openShifts = 0;

    fortnightShifts.forEach(shift => {
      if (shift.status === 'open') {
        openShifts++;
      } else {
        closedShifts++;
      }

      if (shift.start_time) {
        const start = new Date(shift.start_time);
        const end = shift.end_time ? new Date(shift.end_time) : new Date();
        const diffMs = end - start;
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        totalHours += hours;
        totalMinutes += minutes;
      }

      if (shift.breaks && Array.isArray(shift.breaks)) {
        shift.breaks.forEach(breakItem => {
          if (breakItem.start_time && breakItem.end_time) {
            totalBreaks++;
            const breakStart = new Date(breakItem.start_time);
            const breakEnd = new Date(breakItem.end_time);
            const breakDiffMs = breakEnd - breakStart;
            const breakMinutes = Math.floor(breakDiffMs / (1000 * 60));
            totalBreakMinutes += breakMinutes;
          }
        });
      }
    });

    // Convert minutes to hours
    totalHours += Math.floor(totalMinutes / 60);
    totalMinutes = totalMinutes % 60;

    const breakHours = Math.floor(totalBreakMinutes / 60);
    const breakMins = totalBreakMinutes % 60;

    // Calculate work hours (total - breaks)
    let workHours = totalHours - breakHours;
    let workMinutes = totalMinutes - breakMins;
    
    // Handle negative minutes
    if (workMinutes < 0) {
      workHours -= 1;
      workMinutes += 60;
    }

    return {
      totalShifts: fortnightShifts.length,
      closedShifts,
      openShifts,
      totalHours,
      totalMinutes,
      totalBreaks,
      breakHours,
      breakMins,
      workHours: Math.max(0, workHours),
      workMinutes: Math.max(0, workMinutes),
      totalIncome: (totalHours + (totalMinutes / 60)) * 15
    };
  };

  const navigateFortnight = (direction) => {
    if (direction === 'prev') {
      if (currentFortnight === 1) {
        setCurrentFortnight(2);
        if (currentMonth === 0) {
          setCurrentMonth(11);
          setCurrentYear(currentYear - 1);
        } else {
          setCurrentMonth(currentMonth - 1);
        }
      } else {
        setCurrentFortnight(1);
      }
    } else {
      if (currentFortnight === 2) {
        setCurrentFortnight(1);
        if (currentMonth === 11) {
          setCurrentMonth(0);
          setCurrentYear(currentYear + 1);
        } else {
          setCurrentMonth(currentMonth + 1);
        }
      } else {
        setCurrentFortnight(2);
      }
    }
  };

  const handleAddShift = async () => {
    if (!newShift.start_time) {
      alert('Please enter a start time.');
      return;
    }

    try {
      setSaving(true);
      
      const insertData = {
        start_time: new Date(newShift.start_time).toISOString(),
        end_time: newShift.end_time ? new Date(newShift.end_time).toISOString() : null,
        status: newShift.status,
        breaks: newShift.breaks || []
      };

      const { data, error } = await supabase
        .from('ruben')
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;

      setAllShifts([data, ...allShifts]);
      setShowAddModal(false);
      setNewShift({
        start_time: '',
        end_time: '',
        status: 'closed',
        breaks: []
      });
    } catch (err) {
      console.error('Error adding shift:', err);
      alert('Failed to add shift. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDuration = (startTime, endTime) => {
    if (!startTime) return 'N/A';
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date();
    const diffMs = end - start;
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  const handleEditShift = (shift) => {
    setEditingShiftId(shift.id);
    setEditedShift({
      ...shift,
      breaks: shift.breaks ? [...shift.breaks] : []
    });
  };

  const handleCancelEdit = () => {
    setEditingShiftId(null);
    setEditingBreakIndex(null);
    setEditedShift(null);
  };

  const handleSaveShift = async () => {
    if (!editedShift) return;

    try {
      setSaving(true);
      
      // Convert datetime-local format back to ISO string
      const updateData = {
        start_time: editedShift.start_time ? new Date(editedShift.start_time).toISOString() : null,
        end_time: editedShift.end_time ? new Date(editedShift.end_time).toISOString() : null,
        status: editedShift.status,
        breaks: editedShift.breaks || []
      };

      const { data, error } = await supabase
        .from('ruben')
        .update(updateData)
        .eq('id', editedShift.id)
        .select()
        .single();

      if (error) throw error;

      // Update local state
      setAllShifts(allShifts.map(s => s.id === editedShift.id ? data : s));
      handleCancelEdit();
    } catch (err) {
      console.error('Error saving shift:', err);
      alert('Failed to save shift. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteShift = async (shiftId) => {
    if (!window.confirm('Are you sure you want to delete this shift? This action cannot be undone.')) {
      return;
    }

    try {
      setSaving(true);
      const { error } = await supabase
        .from('ruben')
        .delete()
        .eq('id', shiftId);

      if (error) throw error;

      // Update local state
      setAllShifts(allShifts.filter(s => s.id !== shiftId));
    } catch (err) {
      console.error('Error deleting shift:', err);
      alert('Failed to delete shift. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleEditBreak = (shift, breakIndex) => {
    setEditingShiftId(shift.id);
    setEditingBreakIndex(breakIndex);
    setEditedShift({
      ...shift,
      breaks: shift.breaks ? [...shift.breaks] : []
    });
  };

  const handleBreakTimeChange = (field, value) => {
    if (!editedShift || editingBreakIndex === null) return;
    
    const updatedBreaks = [...editedShift.breaks];
    updatedBreaks[editingBreakIndex] = {
      ...updatedBreaks[editingBreakIndex],
      [field]: value ? new Date(value).toISOString() : null
    };
    
    setEditedShift({
      ...editedShift,
      breaks: updatedBreaks
    });
  };

  const handleBreakNoteChange = (value) => {
    if (!editedShift || editingBreakIndex === null) return;
    
    const updatedBreaks = [...editedShift.breaks];
    updatedBreaks[editingBreakIndex] = {
      ...updatedBreaks[editingBreakIndex],
      note: value
    };
    
    setEditedShift({
      ...editedShift,
      breaks: updatedBreaks
    });
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
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', padding: '24px' }}>
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
        backgroundColor: 'white',
        borderRadius: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        overflow: 'hidden'
      }}>
        <div style={{
          padding: '24px',
          borderBottom: '1px solid #e5e7eb',
          backgroundColor: '#f9fafb'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px'
          }}>
            <div>
              <h1 style={{
                fontSize: '24px',
                fontWeight: '700',
                color: '#111827',
                margin: 0
              }}>
                Ruben Shifts - Editable View
              </h1>
              <p style={{
                fontSize: '14px',
                color: '#6b7280',
                marginTop: '8px',
                margin: 0
              }}>
                Click the edit icon to modify shift times
              </p>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              style={{
                padding: '10px 20px',
                backgroundColor: '#22c55e',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}
            >
              <Plus size={18} />
              Add Shift
            </button>
          </div>

          {/* Fortnight Navigation */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: '20px',
            padding: '16px',
            backgroundColor: 'white',
            borderRadius: '8px',
            border: '1px solid #e5e7eb'
          }}>
            <button
              onClick={() => navigateFortnight('prev')}
              style={{
                padding: '8px 12px',
                backgroundColor: '#f3f4f6',
                color: '#374151',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <ChevronLeft size={18} />
              Previous
            </button>
            
            <div style={{ textAlign: 'center' }}>
              <div style={{
                fontSize: '18px',
                fontWeight: '700',
                color: '#111827',
                marginBottom: '4px'
              }}>
                {new Date(currentYear, currentMonth).toLocaleString('en-US', { month: 'long', year: 'numeric' })}
              </div>
              <div style={{
                fontSize: '14px',
                color: '#6b7280'
              }}>
                Fortnight {currentFortnight} ({currentFortnight === 1 ? '1-15' : '16-' + new Date(currentYear, currentMonth + 1, 0).getDate()})
              </div>
            </div>

            <button
              onClick={() => navigateFortnight('next')}
              style={{
                padding: '8px 12px',
                backgroundColor: '#f3f4f6',
                color: '#374151',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              Next
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Fortnight Summary */}
          {(() => {
            const summary = calculateFortnightSummary();
            return (
              <div style={{
                marginTop: '16px',
                padding: '16px',
                backgroundColor: '#eff6ff',
                borderRadius: '8px',
                border: '1px solid #bfdbfe'
              }}>
                <h3 style={{
                  fontSize: '16px',
                  fontWeight: '600',
                  color: '#1e40af',
                  marginBottom: '12px'
                }}>
                  Fortnight Summary
                </h3>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                  gap: '12px'
                }}>
                  <div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Total Shifts</div>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#111827' }}>{summary.totalShifts}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Closed</div>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#22c55e' }}>{summary.closedShifts}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Open</div>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#f59e0b' }}>{summary.openShifts}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Total Hours</div>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#111827' }}>
                      {summary.totalHours}h {summary.totalMinutes}m
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Break Time</div>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#6b7280' }}>
                      {summary.breakHours}h {summary.breakMins}m
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Work Hours</div>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#1e40af' }}>
                      {summary.workHours}h {summary.workMinutes}m
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Total Breaks</div>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#111827' }}>{summary.totalBreaks}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Total Income</div>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#111827' }}>€{summary.totalIncome}</div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

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
                <tr style={{ backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                    Status
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
                    Breaks
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {shifts.map((shift) => {
                  const isEditing = editingShiftId === shift.id;
                  const shiftData = isEditing ? editedShift : shift;
                  const breaks = shiftData?.breaks || [];

                  return (
                    <tr 
                      key={shift.id}
                      style={{ 
                        borderBottom: '1px solid #f3f4f6',
                        backgroundColor: isEditing ? '#fef3c7' : 'white',
                        transition: 'background-color 0.2s'
                      }}
                    >
                      {/* Status */}
                      <td style={{ padding: '12px 16px' }}>
                        {isEditing ? (
                          <select
                            value={shiftData.status}
                            onChange={(e) => setEditedShift({ ...shiftData, status: e.target.value })}
                            style={{
                              padding: '6px 12px',
                              border: '1px solid #d1d5db',
                              borderRadius: '6px',
                              fontSize: '14px',
                              backgroundColor: 'white'
                            }}
                          >
                            <option value="open">Open</option>
                            <option value="closed">Closed</option>
                          </select>
                        ) : (
                          <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '8px' 
                          }}>
                            {shift.status === 'open' ? (
                              <Circle size={16} color="#f59e0b" />
                            ) : (
                              <CheckCircle size={16} color="#22c55e" />
                            )}
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
                        )}
                      </td>

                      {/* Start Time */}
                      <td style={{ padding: '12px 16px' }}>
                        {isEditing ? (
                          <input
                            type="datetime-local"
                            value={formatDateTime(shiftData.start_time)}
                            onChange={(e) => setEditedShift({ ...shiftData, start_time: e.target.value })}
                            style={{
                              padding: '6px 12px',
                              border: '1px solid #d1d5db',
                              borderRadius: '6px',
                              fontSize: '14px',
                              width: '100%',
                              maxWidth: '200px'
                            }}
                          />
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Calendar size={16} color="#6b7280" />
                            <span style={{ fontSize: '14px', color: '#374151' }}>
                              {formatDate(shift.start_time)}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* End Time */}
                      <td style={{ padding: '12px 16px' }}>
                        {isEditing ? (
                          <input
                            type="datetime-local"
                            value={formatDateTime(shiftData.end_time)}
                            onChange={(e) => setEditedShift({ ...shiftData, end_time: e.target.value })}
                            style={{
                              padding: '6px 12px',
                              border: '1px solid #d1d5db',
                              borderRadius: '6px',
                              fontSize: '14px',
                              width: '100%',
                              maxWidth: '200px'
                            }}
                          />
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Calendar size={16} color="#6b7280" />
                            <span style={{ fontSize: '14px', color: '#374151' }}>
                              {shift.end_time ? formatDate(shift.end_time) : 'Still active'}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Duration */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Clock size={16} color="#6b7280" />
                          <span style={{ fontSize: '14px', color: '#374151' }}>
                            {formatDuration(shift.start_time, shift.end_time)}
                          </span>
                        </div>
                      </td>

                      {/* Breaks */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {breaks.length === 0 ? (
                            <span style={{ fontSize: '14px', color: '#9ca3af' }}>No breaks</span>
                          ) : (
                            breaks.map((breakItem, index) => (
                              <div 
                                key={index}
                                style={{
                                  padding: '8px',
                                  backgroundColor: '#f9fafb',
                                  borderRadius: '6px',
                                  border: '1px solid #e5e7eb'
                                }}
                              >
                                {isEditing && editingBreakIndex === index ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                      <Coffee size={14} color="#6b7280" />
                                      <span style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>Break {index + 1}</span>
                                    </div>
                                    <input
                                      type="datetime-local"
                                      value={formatDateTime(breakItem.start_time)}
                                      onChange={(e) => handleBreakTimeChange('start_time', e.target.value)}
                                      style={{
                                        padding: '4px 8px',
                                        border: '1px solid #d1d5db',
                                        borderRadius: '4px',
                                        fontSize: '12px',
                                        width: '100%'
                                      }}
                                      placeholder="Start time"
                                    />
                                    <input
                                      type="datetime-local"
                                      value={formatDateTime(breakItem.end_time)}
                                      onChange={(e) => handleBreakTimeChange('end_time', e.target.value)}
                                      style={{
                                        padding: '4px 8px',
                                        border: '1px solid #d1d5db',
                                        borderRadius: '4px',
                                        fontSize: '12px',
                                        width: '100%'
                                      }}
                                      placeholder="End time"
                                    />
                                    <input
                                      type="text"
                                      value={breakItem.note || ''}
                                      onChange={(e) => handleBreakNoteChange(e.target.value)}
                                      style={{
                                        padding: '4px 8px',
                                        border: '1px solid #d1d5db',
                                        borderRadius: '4px',
                                        fontSize: '12px',
                                        width: '100%'
                                      }}
                                      placeholder="What did you eat?"
                                    />
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                      <Coffee size={14} color="#6b7280" />
                                      <span style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>Break {index + 1}</span>
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#6b7280' }}>
                                      Start: {formatDate(breakItem.start_time)}
                                    </div>
                                    {breakItem.end_time && (
                                      <div style={{ fontSize: '11px', color: '#6b7280' }}>
                                        End: {formatDate(breakItem.end_time)}
                                      </div>
                                    )}
                                    {breakItem.note && (
                                      <div style={{ fontSize: '11px', color: '#374151', fontStyle: 'italic' }}>
                                        Note: {breakItem.note}
                                      </div>
                                    )}
                                    {isEditing && (
                                      <button
                                        onClick={() => handleEditBreak(shiftData, index)}
                                        style={{
                                          marginTop: '4px',
                                          padding: '2px 6px',
                                          fontSize: '10px',
                                          backgroundColor: '#3b82f6',
                                          color: 'white',
                                          border: 'none',
                                          borderRadius: '4px',
                                          cursor: 'pointer'
                                        }}
                                      >
                                        Edit Break
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '12px 16px' }}>
                        {isEditing ? (
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              onClick={handleSaveShift}
                              disabled={saving}
                              style={{
                                padding: '6px 12px',
                                backgroundColor: saving ? '#9ca3af' : '#22c55e',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '14px',
                                fontWeight: '500',
                                cursor: saving ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              <Save size={14} />
                              {saving ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              disabled={saving}
                              style={{
                                padding: '6px 12px',
                                backgroundColor: '#ef4444',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '14px',
                                fontWeight: '500',
                                cursor: saving ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              <X size={14} />
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              onClick={() => handleEditShift(shift)}
                              style={{
                                padding: '6px 12px',
                                backgroundColor: '#3b82f6',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '14px',
                                fontWeight: '500',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              <Edit size={14} />
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteShift(shift.id)}
                              disabled={saving}
                              style={{
                                padding: '4px 6px',
                                backgroundColor: saving ? '#9ca3af' : '#ef4444',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                fontSize: '12px',
                                cursor: saving ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                              title="Delete shift"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Shift Modal */}
      {showAddModal && (
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
            setShowAddModal(false);
            setNewShift({
              start_time: '',
              end_time: '',
              status: 'closed',
              breaks: []
            });
          }
        }}
        >
          <div style={{
            backgroundColor: 'white',
            borderRadius: '16px',
            padding: '24px',
            maxWidth: '500px',
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
                Add New Shift
              </h2>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewShift({
                    start_time: '',
                    end_time: '',
                    status: 'closed',
                    breaks: []
                  });
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#374151',
                  marginBottom: '8px'
                }}>
                  Start Time *
                </label>
                <input
                  type="datetime-local"
                  value={newShift.start_time}
                  onChange={(e) => setNewShift({ ...newShift, start_time: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '16px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  required
                />
              </div>

              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#374151',
                  marginBottom: '8px'
                }}>
                  End Time
                </label>
                <input
                  type="datetime-local"
                  value={newShift.end_time}
                  onChange={(e) => setNewShift({ ...newShift, end_time: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '16px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#374151',
                  marginBottom: '8px'
                }}>
                  Status
                </label>
                <select
                  value={newShift.status}
                  onChange={(e) => setNewShift({ ...newShift, status: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '16px',
                    outline: 'none',
                    boxSizing: 'border-box',
                    backgroundColor: 'white'
                  }}
                >
                  <option value="open">Open</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
            </div>

            <div style={{
              display: 'flex',
              gap: '12px',
              marginTop: '24px'
            }}>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewShift({
                    start_time: '',
                    end_time: '',
                    status: 'closed',
                    breaks: []
                  });
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
                onClick={handleAddShift}
                disabled={!newShift.start_time || saving}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: (!newShift.start_time || saving) ? '#9ca3af' : '#22c55e',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: (!newShift.start_time || saving) ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <Plus size={18} />
                {saving ? 'Adding...' : 'Add Shift'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

