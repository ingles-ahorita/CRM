import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Plus, Edit, Trash2, Users as UsersIcon, UserCheck, ChevronDown, ChevronUp } from 'lucide-react';

export default function UsersPage() {
  const [activeTab, setActiveTab] = useState('setters'); // 'setters' or 'closers'
  const [setters, setSetters] = useState([]);
  const [closers, setClosers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [showInactiveUsers, setShowInactiveUsers] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    active: true,
    mc_api_key: '' // Only for closers
  });

  useEffect(() => {
    fetchUsers();
    setShowInactiveUsers(false); // Reset collapsed state when switching tabs
  }, [activeTab]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      if (activeTab === 'setters') {
        const { data, error } = await supabase
          .from('setters')
          .select('*')
          .order('name', { ascending: true });
        
        if (error) throw error;
        setSetters(data || []);
      } else {
        const { data, error } = await supabase
          .from('closers')
          .select('*')
          .order('name', { ascending: true });
        
        if (error) throw error;
        setClosers(data || []);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      alert('Failed to fetch users. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (user = null) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        name: user.name || '',
        email: user.email || '',
        password: '', // Don't pre-fill password
        active: user.active !== undefined ? user.active : true,
        mc_api_key: user.mc_api_key || ''
      });
    } else {
      setEditingUser(null);
      setFormData({
        name: '',
        email: '',
        password: '',
        active: true,
        mc_api_key: ''
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingUser(null);
    setFormData({
      name: '',
      email: '',
      password: '',
      active: true,
      mc_api_key: ''
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name || !formData.email) {
      alert('Name and email are required.');
      return;
    }

    try {
      const tableName = activeTab === 'setters' ? 'setters' : 'closers';
      const submitData = {
        name: formData.name.trim(),
        email: formData.email.toLowerCase().trim(),
        active: formData.active
      };

      // Only include password if it's provided (for updates) or for new users
      if (formData.password) {
        submitData.password = formData.password;
      }

      // Only include mc_api_key for closers
      if (activeTab === 'closers' && formData.mc_api_key) {
        submitData.mc_api_key = formData.mc_api_key.trim();
      }

      if (editingUser) {
        // Update existing user
        const { data, error } = await supabase
          .from(tableName)
          .update(submitData)
          .eq('id', editingUser.id)
          .select()
          .single();

        if (error) throw error;
      } else {
        // Create new user
        // Password is required for new users
        if (!formData.password) {
          alert('Password is required for new users.');
          return;
        }

        const { data, error } = await supabase
          .from(tableName)
          .insert(submitData)
          .select()
          .single();

        if (error) throw error;
      }

      handleCloseModal();
      fetchUsers();
    } catch (error) {
      console.error('Error saving user:', error);
      alert(`Failed to ${editingUser ? 'update' : 'create'} user. ${error.message}`);
    }
  };

  const handleDelete = async (user) => {
    if (!window.confirm(`Are you sure you want to delete ${user.name}? This action cannot be undone.`)) {
      return;
    }

    try {
      const tableName = activeTab === 'setters' ? 'setters' : 'closers';
      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq('id', user.id);

      if (error) throw error;

      fetchUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('Failed to delete user. Please try again.');
    }
  };

  const handleToggleActive = async (user) => {
    try {
      const tableName = activeTab === 'setters' ? 'setters' : 'closers';
      const { error } = await supabase
        .from(tableName)
        .update({ active: !user.active })
        .eq('id', user.id);

      if (error) throw error;

      fetchUsers();
    } catch (error) {
      console.error('Error updating user status:', error);
      alert('Failed to update user status. Please try again.');
    }
  };

  const users = activeTab === 'setters' ? setters : closers;
  const activeUsers = users.filter(user => user.active);
  const inactiveUsers = users.filter(user => !user.active);

  const renderUserRow = (user) => (
    <tr 
      key={user.id}
      style={{ 
        borderBottom: '1px solid #f3f4f6',
        transition: 'background-color 0.2s'
      }}
      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
    >
      <td style={{ padding: '12px 16px', fontSize: '14px', color: '#111827', fontWeight: '500' }}>
        {user.name}
      </td>
      <td style={{ padding: '12px 16px', fontSize: '14px', color: '#374151' }}>
        {user.email}
      </td>
      {activeTab === 'closers' && (
        <td style={{ padding: '12px 16px', fontSize: '14px', color: '#374151', fontFamily: 'monospace' }}>
          {user.mc_api_key ? (
            <span style={{ fontSize: '12px' }}>
              {user.mc_api_key.substring(0, 20)}...
            </span>
          ) : (
            <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>Not set</span>
          )}
        </td>
      )}
      {activeTab === 'setters' && (
        <td style={{ padding: '12px 16px', fontSize: '14px', color: '#374151' }}>
          {user.timezone}
        </td>
      )}
      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
        <button
          onClick={() => handleToggleActive(user)}
          style={{
            padding: '4px 12px',
            backgroundColor: user.active ? '#dcfce7' : '#fee2e2',
            color: user.active ? '#166534' : '#991b1b',
            border: 'none',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          {user.active ? 'Active' : 'Inactive'}
        </button>
      </td>
      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
          <button
            onClick={() => handleOpenModal(user)}
            style={{
              padding: '6px 12px',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '500',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <Edit size={14} />
          </button>
          <button
            onClick={() => handleDelete(user)}
            style={{
              padding: '6px 12px',
              backgroundColor: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '500',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </td>
    </tr>
  );

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', padding: '24px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: '#111827', margin: 0 }}>
            Users Management
          </h1>
          <button
            onClick={() => handleOpenModal()}
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
            Add {activeTab === 'setters' ? 'Setter' : 'Closer'}
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
          <button
            onClick={() => setActiveTab('setters')}
            style={{
              padding: '10px 20px',
              backgroundColor: activeTab === 'setters' ? '#3b82f6' : '#ffffff',
              color: activeTab === 'setters' ? 'white' : '#374151',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s'
            }}
          >
            <UsersIcon size={18} />
            Setters
          </button>
          <button
            onClick={() => setActiveTab('closers')}
            style={{
              padding: '10px 20px',
              backgroundColor: activeTab === 'closers' ? '#3b82f6' : '#ffffff',
              color: activeTab === 'closers' ? 'white' : '#374151',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s'
            }}
          >
            <UserCheck size={18} />
            Closers
          </button>
        </div>

        {/* Users Table */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '48px', color: '#6b7280' }}>
            Loading users...
          </div>
        ) : (
          <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                    Name
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                    Email
                  </th>
                  {activeTab === 'closers' && ( 
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                      ManyChat API Key
                    </th>
                  )}
                  {activeTab === 'setters' && (
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                      Timezone
                    </th>
                  )}
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                    Status
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={activeTab === 'closers' ? 5 : 4} style={{ padding: '48px', textAlign: 'center', color: '#6b7280' }}>
                      No {activeTab} found. Click "Add {activeTab === 'setters' ? 'Setter' : 'Closer'}" to create one.
                    </td>
                  </tr>
                ) : (
                  <>
                    {/* Active Users */}
                    {activeUsers.length > 0 && activeUsers.map((user) => renderUserRow(user))}
                    
                    {/* Inactive Users Section */}
                    {inactiveUsers.length > 0 && (
                      <>
                        <tr 
                          onClick={() => setShowInactiveUsers(!showInactiveUsers)}
                          style={{
                            backgroundColor: '#f9fafb',
                            borderTop: '2px solid #e5e7eb',
                            borderBottom: '1px solid #e5e7eb',
                            cursor: 'pointer',
                            transition: 'background-color 0.2s'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                        >
                          <td 
                            colSpan={activeTab === 'closers' ? 5 : 4}
                            style={{ 
                              padding: '12px 16px',
                              fontSize: '14px',
                              fontWeight: '600',
                              color: '#6b7280',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px'
                            }}
                          >
                            {showInactiveUsers ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                            Inactive {activeTab === 'setters' ? 'Setters' : 'Closers'} ({inactiveUsers.length})
                          </td>
                        </tr>
                        {showInactiveUsers && inactiveUsers.map((user) => renderUserRow(user))}
                      </>
                    )}
                    
                    {/* Show message if no active users */}
                    {activeUsers.length === 0 && inactiveUsers.length === 0 && (
                      <tr>
                        <td colSpan={activeTab === 'closers' ? 5 : 4} style={{ padding: '48px', textAlign: 'center', color: '#6b7280' }}>
                          No {activeTab} found. Click "Add {activeTab === 'setters' ? 'Setter' : 'Closer'}" to create one.
                        </td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Modal */}
        {showModal && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 2000,
              padding: '20px'
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                handleCloseModal();
              }
            }}
          >
            <div
              style={{
                backgroundColor: 'white',
                borderRadius: '16px',
                padding: '24px',
                maxWidth: '500px',
                width: '100%',
                boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#111827', marginBottom: '20px' }}>
                {editingUser ? `Edit ${activeTab === 'setters' ? 'Setter' : 'Closer'}` : `Add New ${activeTab === 'setters' ? 'Setter' : 'Closer'}`}
              </h2>

              <form onSubmit={handleSubmit}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                      Name *
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '2px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '16px',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                      onFocus={(e) => e.currentTarget.style.borderColor = '#3b82f6'}
                      onBlur={(e) => e.currentTarget.style.borderColor = '#e5e7eb'}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                      Email *
                    </label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '2px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '16px',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                      onFocus={(e) => e.currentTarget.style.borderColor = '#3b82f6'}
                      onBlur={(e) => e.currentTarget.style.borderColor = '#e5e7eb'}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                      Password {editingUser ? '(leave blank to keep current)' : '*'}
                    </label>
                    <input
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      required={!editingUser}
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '2px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '16px',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                      onFocus={(e) => e.currentTarget.style.borderColor = '#3b82f6'}
                      onBlur={(e) => e.currentTarget.style.borderColor = '#e5e7eb'}
                    />
                  </div>

                  {activeTab === 'closers' && (
                    <div>
                      <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                        ManyChat API Key
                      </label>
                      <input
                        type="text"
                        value={formData.mc_api_key}
                        onChange={(e) => setFormData({ ...formData, mc_api_key: e.target.value })}
                        placeholder="Optional"
                        style={{
                          width: '100%',
                          padding: '12px',
                          border: '2px solid #e5e7eb',
                          borderRadius: '8px',
                          fontSize: '16px',
                          fontFamily: 'monospace',
                          outline: 'none',
                          boxSizing: 'border-box'
                        }}
                        onFocus={(e) => e.currentTarget.style.borderColor = '#3b82f6'}
                        onBlur={(e) => e.currentTarget.style.borderColor = '#e5e7eb'}
                      />
                    </div>
                  )}

                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: '600', color: '#374151', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={formData.active}
                        onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                      Active
                    </label>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                  <button
                    type="button"
                    onClick={handleCloseModal}
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
                    type="submit"
                    style={{
                      flex: 1,
                      padding: '12px',
                      backgroundColor: '#22c55e',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '16px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    <Plus size={18} />
                    {editingUser ? 'Update' : 'Create'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
