import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { listOffers, fetchOffer } from '../lib/kajabiApi';
import { LOCK_IN_OFFER_DB_ID, PAYOFF_OFFER_DB_ID } from '../lib/specialOffers';
import Header from './components/Header';
import { useSimpleAuth } from '../useSimpleAuth';
import { Plus, Edit, Trash2, Check, X } from 'lucide-react';

export default function OffersPage() {
  const { userId } = useSimpleAuth();
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedKajabiId, setSelectedKajabiId] = useState(null);
  const [kajabiOffers, setKajabiOffers] = useState([]);
  const [kajabiOffersLoading, setKajabiOffersLoading] = useState(false);
  const [kajabiOfferSearch, setKajabiOfferSearch] = useState('');
  const [kajabiOfferDropdownOpen, setKajabiOfferDropdownOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    installments: '',
    base_commission: '',
    PIF_commission: '',
    kajabi_id: '',
    checkout_url: '',
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
        .order('created_at', { ascending: true });

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
        price: offer.price || '',
        installments: offer.installments !== null && offer.installments !== undefined ? String(offer.installments) : '',
        base_commission: offer.base_commission || '',
        PIF_commission: offer.PIF_commission || '',
        kajabi_id: offer.kajabi_id || '',
        checkout_url: offer.checkout_url || '',
        weekly_classes: offer.weekly_classes || '',
        active: offer.active !== undefined ? offer.active : true
      });
      setKajabiOfferSearch(offer.kajabi_id || '');
    } else {
      setEditingOffer(null);
      setFormData({
        name: '',
        price: '',
        installments: '',
        base_commission: '',
        PIF_commission: '',
        kajabi_id: '',
        checkout_url: '',
        weekly_classes: '',
        active: true
      });
      setKajabiOfferSearch('');
    }
    setKajabiOfferDropdownOpen(false);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingOffer(null);
    setKajabiOfferSearch('');
    setKajabiOfferDropdownOpen(false);
    setFormData({
      name: '',
      price: '',
      installments: '',
      base_commission: '',
      PIF_commission: '',
      kajabi_id: '',
      checkout_url: '',
      weekly_classes: '',
      active: true
    });
  };

  // Load Kajabi offers when modal opens
  useEffect(() => {
    if (!isModalOpen) return;
    setKajabiOffersLoading(true);
    listOffers({ perPage: 100 })
      .then(({ data }) => setKajabiOffers(data || []))
      .catch((err) => {
        console.error('Kajabi offers load error:', err);
        setKajabiOffers([]);
      })
      .finally(() => setKajabiOffersLoading(false));
  }, [isModalOpen]);

  // Filter Kajabi offers by ID (search by offer id)
  const kajabiOfferSearchLower = kajabiOfferSearch.trim().toLowerCase();
  const kajabiOffersFiltered = kajabiOfferSearchLower
    ? kajabiOffers.filter((o) => String(o.id).toLowerCase().includes(kajabiOfferSearchLower))
    : kajabiOffers;

  const handleSelectKajabiOffer = (offer) => {
    setFormData((prev) => ({
      ...prev,
      kajabi_id: offer.id,
      checkout_url: offer.checkout_url || ''
    }));
    setKajabiOfferSearch(String(offer.id));
    setKajabiOfferDropdownOpen(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    let checkoutUrlForPayload = formData.checkout_url?.trim() || null;
    if (formData.kajabi_id && formData.kajabi_id.trim() !== '') {
      const id = String(formData.kajabi_id).trim();
      const inList = kajabiOffers.some((o) => String(o.id) === id);
      if (!inList) {
        const existing = await fetchOffer(id);
        if (!existing) {
          alert('Please select a Kajabi offer from the list. The ID must exist in Kajabi.');
          return;
        }
        checkoutUrlForPayload = existing.checkout_url || null;
      } else {
        const selected = kajabiOffers.find((o) => String(o.id) === id);
        if (selected?.checkout_url) checkoutUrlForPayload = selected.checkout_url;
      }
    }
    try {
      const payload = {
        name: formData.name.trim(),
        price: formData.price ? parseFloat(formData.price) : null,
        installments: formData.installments ? parseInt(formData.installments) : null,
        base_commission: formData.base_commission ? parseFloat(formData.base_commission) : null,
        PIF_commission: formData.PIF_commission ? parseFloat(formData.PIF_commission) : null,
        kajabi_id: formData.kajabi_id ? formData.kajabi_id.trim() : null,
        checkout_url: checkoutUrlForPayload,
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

  const handleKajabiIdClick = (e, kajabiId) => {
    e.preventDefault();
    setSelectedKajabiId(kajabiId);
    setIsDialogOpen(true);
  };

  const handleNavigateToKajabi = (type) => {
    if (!selectedKajabiId) return;
    
    const url = type === 'offer' 
      ? `https://app.kajabi.com/admin/offers/${selectedKajabiId}/edit`
      : `https://app.kajabi.com/admin/offers/${selectedKajabiId}/checkout/edit`;
    
    window.open(url, '_blank', 'noopener,noreferrer');
    setIsDialogOpen(false);
    setSelectedKajabiId(null);
  };

  // Lock-in & Payoff (special offers) in a separate section; rest by active status
  const specialOfferIds = [LOCK_IN_OFFER_DB_ID, PAYOFF_OFFER_DB_ID];
  const specialOffers = offers.filter((o) => specialOfferIds.includes(o.id));
  const lockInOffer = specialOffers.find((o) => o.id === LOCK_IN_OFFER_DB_ID);
  const payoffOffer = specialOffers.find((o) => o.id === PAYOFF_OFFER_DB_ID);
  const otherOffers = offers.filter((o) => !specialOfferIds.includes(o.id));
  const activeOffers = otherOffers.filter((offer) => offer.active === true);
  const inactiveOffers = otherOffers.filter((offer) => offer.active !== true);

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
                }}>Price</th>
                <th style={{ 
                  padding: '12px 16px', 
                  textAlign: 'left', 
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#374151'
                }}>Installments</th>
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
                }}>Checkout link</th>
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
                    {offer.price !== null && offer.price !== undefined 
                      ? `$${offer.price.toFixed(2)}` 
                      : '-'}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: '#111827' }}>
                    {offer.installments !== null && offer.installments !== undefined 
                      ? (offer.installments === 0 ? 'SINGLE' : offer.installments)
                      : '-'}
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
                    {offer.kajabi_id ? (
                      <a
                        href="#"
                        onClick={(e) => handleKajabiIdClick(e, offer.kajabi_id)}
                        style={{
                          color: '#3b82f6',
                          textDecoration: 'none',
                          fontWeight: '500',
                          cursor: 'pointer'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.textDecoration = 'underline';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.textDecoration = 'none';
                        }}
                      >
                        {offer.kajabi_id}
                      </a>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: '#111827' }}>
                    {offer.checkout_url ? (
                      <a
                        href={offer.checkout_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: '#3b82f6',
                          textDecoration: 'none'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
                      >
                        Checkout
                      </a>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: '#111827' }}>
                    {offer.weekly_classes === null 
                      ? 'unlimited'
                      : offer.weekly_classes}
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
            {renderOfferTable(specialOffers, '🔒 Lock-in & Payoff', 'Lock-in and Payoff offers not found')}
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
                    Price ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
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
                    Installments
                  </label>
                  <select
                    value={formData.installments}
                    onChange={(e) => setFormData({ ...formData, installments: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                      outline: 'none',
                      boxSizing: 'border-box',
                      backgroundColor: 'white',
                      cursor: 'pointer'
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#3b82f6';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#d1d5db';
                    }}
                  >
                    <option value="">Select installments...</option>
                    <option value="0">SINGLE</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                    <option value="6">6</option>
                    <option value="7">7</option>
                  </select>
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

                <div style={{ marginBottom: '20px', position: 'relative' }}>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '8px', 
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#374151'
                  }}>
                    Kajabi Offer (search by ID)
                  </label>
                  <input
                    type="text"
                    value={kajabiOfferSearch}
                    onChange={(e) => {
                      const v = e.target.value;
                      setKajabiOfferSearch(v);
                      if (v.trim() === '') setFormData((prev) => ({ ...prev, kajabi_id: '' }));
                      setKajabiOfferDropdownOpen(true);
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#3b82f6';
                      setKajabiOfferDropdownOpen(true);
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#d1d5db';
                      setTimeout(() => {
                        setKajabiOfferDropdownOpen(false);
                        const validId = kajabiOffers.some((o) => String(o.id) === kajabiOfferSearch.trim());
                        if (!validId && kajabiOfferSearch.trim() !== '') {
                          setKajabiOfferSearch(formData.kajabi_id || '');
                        }
                      }, 150);
                    }}
                    placeholder="Search by offer ID (select from list)"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                  {kajabiOffersLoading && (
                    <span style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px', display: 'block' }}>
                      Loading Kajabi offers...
                    </span>
                  )}
                  {kajabiOfferDropdownOpen && !kajabiOffersLoading && (
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: '100%',
                        marginTop: '4px',
                        backgroundColor: 'white',
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                        maxHeight: '220px',
                        overflowY: 'auto',
                        zIndex: 10
                      }}
                    >
                      {kajabiOffersFiltered.length === 0 ? (
                        <div style={{ padding: '12px 16px', fontSize: '14px', color: '#6b7280' }}>
                          No offers matching this ID.
                        </div>
                      ) : (
                        kajabiOffersFiltered.map((offer) => (
                          <button
                            key={offer.id}
                            type="button"
                            onClick={() => handleSelectKajabiOffer(offer)}
                            style={{
                              width: '100%',
                              padding: '10px 16px',
                              textAlign: 'left',
                              border: 'none',
                              backgroundColor: 'transparent',
                              fontSize: '14px',
                              color: '#111827',
                              cursor: 'pointer',
                              borderBottom: '1px solid #f3f4f6'
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f3f4f6'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                          >
                            <span style={{ fontWeight: '600' }}>{offer.id}</span>
                            <span style={{ color: '#6b7280', fontSize: '13px', marginLeft: '8px' }}>
                              {offer.internal_title || 'Untitled'}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
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

        {/* Dialog for Kajabi Navigation */}
        {isDialogOpen && (
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
              zIndex: 1001
            }}
            onClick={() => {
              setIsDialogOpen(false);
              setSelectedKajabiId(null);
            }}
          >
            <div 
              style={{
                backgroundColor: 'white',
                borderRadius: '8px',
                padding: '24px',
                width: '90%',
                maxWidth: '400px',
                boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ 
                fontSize: '20px', 
                fontWeight: 'bold', 
                color: '#111827',
                marginBottom: '16px'
              }}>
                Navigate to Kajabi
              </h3>
              <p style={{
                fontSize: '14px',
                color: '#6b7280',
                marginBottom: '24px'
              }}>
                Choose where you want to go:
              </p>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}>
                <button
                  onClick={() => handleNavigateToKajabi('offer')}
                  style={{
                    padding: '12px 20px',
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    textAlign: 'left'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#2563eb';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#3b82f6';
                  }}
                >
                  Edit Offer
                </button>
                <button
                  onClick={() => handleNavigateToKajabi('checkout')}
                  style={{
                    padding: '12px 20px',
                    backgroundColor: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    textAlign: 'left'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#059669';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#10b981';
                  }}
                >
                  Edit Checkout Page
                </button>
                <button
                  onClick={() => {
                    setIsDialogOpen(false);
                    setSelectedKajabiId(null);
                  }}
                  style={{
                    padding: '12px 20px',
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
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

