import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import Header from './components/Header';
import { useSimpleAuth } from '../useSimpleAuth';
import { Plus, Edit, Trash2, Check, X } from 'lucide-react';

export default function OffersPage() {
  const { userId } = useSimpleAuth();
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    base_commission: '',
    PIF_commission: '',
    kajabi_id: '',
    weekly_classes: '',
    active: true
  });

  useEffect(() => {
    fetchOffers();
  }, []);

  const fetchOffers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('offers')
        .select('*')
        .order('name');

      if (error) throw error;
      setOffers(data || []);
    } catch (error) {
      console.error('Error fetching offers:', error);
      alert('Error loading offers: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (offer = null) => {
    if (offer) {
      setEditingOffer(offer);
      setFormData({
        name: offer.name || '',
        base_commission: offer.base_commission || '',
        PIF_commission: offer.PIF_commission || '',
        kajabi_id: offer.kajabi_id || '',
        weekly_classes: offer.weekly_classes || '',
        active: offer.active !== undefined ? offer.active : true
      });
    } else {
      setEditingOffer(null);
      setFormData({
        name: '',
        base_commission: '',
        PIF_commission: '',
        kajabi_id: '',
        weekly_classes: '',
        active: true
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingOffer(null);
    setFormData({
      name: '',
      base_commission: '',
      PIF_commission: '',
      kajabi_id: '',
      weekly_classes: '',
      active: true
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const payload = {
        name: formData.name.trim(),
        base_commission: formData.base_commission ? parseFloat(formData.base_commission) : null,
        PIF_commission: formData.PIF_commission ? parseFloat(formData.PIF_commission) : null,
        kajabi_id: formData.kajabi_id ? formData.kajabi_id.trim() : null,
        weekly_classes: formData.weekly_classes ? parseInt(formData.weekly_classes) : null,
        active: formData.active
      };

      if (editingOffer) {
        const { error } = await supabase
          .from('offers')
          .update(payload)
          .eq('id', editingOffer.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('offers')
          .insert([payload]);

        if (error) throw error;
      }

      await fetchOffers();
      handleCloseModal();
    } catch (error) {
      console.error('Error saving offer:', error);
      alert('Error saving offer: ' + error.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this offer?')) return;

    try {
      const { error } = await supabase
        .from('offers')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await fetchOffers();
    } catch (error) {
      console.error('Error deleting offer:', error);
      alert('Error deleting offer: ' + error.message);
    }
  };

  const toggleActive = async (offer) => {
    try {
      const { error } = await supabase
        .from('offers')
        .update({ active: !offer.active })
        .eq('id', offer.id);

      if (error) throw error;
      await fetchOffers();
    } catch (error) {
      console.error('Error toggling active status:', error);
      alert('Error updating offer: ' + error.message);
    }
  };

  // Group offers by active status
  const activeOffers = offers.filter(offer => offer.active === true);
  const inactiveOffers = offers.filter(offer => offer.active !== true);

  const renderOfferTable = (offersList, title, emptyMessage) => {
    if (offersList.length === 0) {
      return null;
    }

    return (
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ 
          fontSize: '20px', 
          fontWeight: '600', 
          color: '#111827',
          marginBottom: '16px',
          paddingBottom: '8px',
          borderBottom: '2px solid #e5e7eb'
        }}>
          {title} ({offersList.length})
        </h2>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          overflow: 'hidden'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ 
                backgroundColor: '#f9fafb',
                borderBottom: '2px solid #e5e7eb'
              }}>
                <th style={{ 
                  padding: '12px 16px', 
                  textAlign: 'left', 
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#374151'
                }}>Name</th>
                <th style={{ 
                  padding: '12px 16px', 
                  textAlign: 'left', 
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#374151'
                }}>Base Commission</th>
                <th style={{ 
                  padding: '12px 16px', 
                  textAlign: 'left', 
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#374151'
                }}>PIF Commission</th>
                <th style={{ 
                  padding: '12px 16px', 
                  textAlign: 'left', 
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#374151'
                }}>Kajabi ID</th>
                <th style={{ 
                  padding: '12px 16px', 
                  textAlign: 'left', 
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#374151'
                }}>Weekly Classes</th>
                <th style={{ 
                  padding: '12px 16px', 
                  textAlign: 'center', 
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#374151'
                }}>Status</th>
                <th style={{ 
                  padding: '12px 16px', 
                  textAlign: 'center', 
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#374151'
                }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {offersList.map((offer) => (
                <tr 
                  key={offer.id}
                  style={{ 
                    borderBottom: '1px solid #e5e7eb',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f9fafb';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'white';
                  }}
                >
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: '#111827', fontWeight: '500' }}>
                    {offer.name}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: '#111827' }}>
                    {offer.base_commission !== null && offer.base_commission !== undefined 
                      ? `$${offer.base_commission.toFixed(2)}` 
                      : '-'}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: '#111827' }}>
                    {offer.PIF_commission !== null && offer.PIF_commission !== undefined 
                      ? `$${offer.PIF_commission.toFixed(2)}` 
                      : '-'}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: '#111827' }}>
                    {offer.kajabi_id || '-'}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: '#111827' }}>
                    {offer.weekly_classes !== null && offer.weekly_classes !== undefined 
                      ? offer.weekly_classes 
                      : '-'}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <button
                      onClick={() => toggleActive(offer)}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: offer.active ? '#10b981' : '#6b7280',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        margin: '0 auto'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.opacity = '0.9';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = '1';
                      }}
                    >
                      {offer.active ? <Check size={14} /> : <X size={14} />}
                      {offer.active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                      <button
                        onClick={() => handleOpenModal(offer)}
                        style={{
                          padding: '6px 10px',
                          backgroundColor: '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#2563eb';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = '#3b82f6';
                        }}
                        title="Edit"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(offer.id)}
                        style={{
                          padding: '6px 10px',
                          backgroundColor: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#dc2626';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = '#ef4444';
                        }}
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', padding: '24px' }}>
      <div style={{ width: '90%', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '24px'
        }}>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: '#111827' }}>
            Offers Management
          </h1>
          <button
            onClick={() => handleOpenModal()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#2563eb';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#3b82f6';
            }}
          >
            <Plus size={18} />
            Add Offer
          </button>
        </div>

        {loading ? (
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            minHeight: '400px',
            fontSize: '18px',
            color: '#6b7280'
          }}>
            Loading offers...
          </div>
        ) : offers.length === 0 ? (
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            padding: '40px',
            textAlign: 'center',
            color: '#6b7280',
            fontSize: '16px'
          }}>
            No offers found. Click "Add Offer" to create one.
          </div>
        ) : (
          <div>
            {renderOfferTable(activeOffers, '🟢 Active Offers', 'No active offers')}
            {renderOfferTable(inactiveOffers, '⚪ Inactive Offers', 'No inactive offers')}
          </div>
        )}

        {/* Modal for Create/Edit */}
        {isModalOpen && (
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
              zIndex: 1000
            }}
            onClick={handleCloseModal}
          >
            <div 
              style={{
                backgroundColor: 'white',
                borderRadius: '8px',
                padding: '24px',
                width: '90%',
                maxWidth: '500px',
                maxHeight: '90vh',
                overflow: 'auto',
                boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginBottom: '24px'
              }}>
                <h2 style={{ 
                  fontSize: '24px', 
                  fontWeight: 'bold', 
                  color: '#111827'
                }}>
                  {editingOffer ? 'Edit Offer' : 'Create Offer'}
                </h2>
                <button
                  onClick={handleCloseModal}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '24px',
                    color: '#6b7280',
                    cursor: 'pointer',
                    padding: '0',
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '4px',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f3f4f6';
                    e.currentTarget.style.color = '#111827';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = '#6b7280';
                  }}
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '8px', 
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#374151'
                  }}>
                    Name <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#3b82f6';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#d1d5db';
                    }}
                  />
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '8px', 
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#374151'
                  }}>
                    Base Commission ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.base_commission}
                    onChange={(e) => setFormData({ ...formData, base_commission: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#3b82f6';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#d1d5db';
                    }}
                  />
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '8px', 
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#374151'
                  }}>
                    PIF Commission ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.PIF_commission}
                    onChange={(e) => setFormData({ ...formData, PIF_commission: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#3b82f6';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#d1d5db';
                    }}
                  />
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '8px', 
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#374151'
                  }}>
                    Kajabi ID
                  </label>
                  <input
                    type="text"
                    value={formData.kajabi_id}
                    onChange={(e) => setFormData({ ...formData, kajabi_id: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#3b82f6';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#d1d5db';
                    }}
                  />
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '8px', 
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#374151'
                  }}>
                    Weekly Classes
                  </label>
                  <input
                    type="number"
                    value={formData.weekly_classes}
                    onChange={(e) => setFormData({ ...formData, weekly_classes: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#3b82f6';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#d1d5db';
                    }}
                  />
                </div>

                <div style={{ marginBottom: '24px' }}>
                  <label style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#374151',
                    cursor: 'pointer'
                  }}>
                    <input
                      type="checkbox"
                      checked={formData.active}
                      onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                      style={{
                        width: '18px',
                        height: '18px',
                        cursor: 'pointer'
                      }}
                    />
                    Active
                  </label>
                </div>

                <div style={{ 
                  display: 'flex', 
                  gap: '12px', 
                  justifyContent: 'flex-end'
                }}>
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    style={{
                      padding: '10px 20px',
                      backgroundColor: '#f3f4f6',
                      color: '#374151',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#e5e7eb';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#f3f4f6';
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    style={{
                      padding: '10px 20px',
                      backgroundColor: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#2563eb';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#3b82f6';
                    }}
                  >
                    {editingOffer ? 'Update' : 'Create'}
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

