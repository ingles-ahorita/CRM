import { supabase } from '../../lib/supabaseClient';
import {Modal, NotesModal} from './Modal';
import { useNavigate } from 'react-router-dom';
import { Mail, Phone, User, Calendar } from 'lucide-react';
import { useState, useEffect } from 'react';

import * as DateHelpers from '../../utils/dateHelpers';

const formatStatusValue = (value) => {
  if (value === true) return 'true';
  if (value === false) return 'false';
  if (value === null || value === undefined) return 'null';
  return value;
};

export default function LeadItem({ lead, setterMap = {}, closerMap = {}, mode = 'full' }) {
  const [pickUp, setPickUp] = useState(() => formatStatusValue(lead.picked_up));
  const [confirmed, setConfirmed] = useState(() => formatStatusValue(lead.confirmed));
  const [showUp, setShowUp] = useState(() => formatStatusValue(lead.showed_up));
  const [purchase, setPurchase] = useState(() => formatStatusValue(lead.purchased));
  const [setter, setSetter] = useState(lead.setter_id !== null && lead.setter_id !== undefined ? String(lead.setter_id) : '');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteButtonText, setNoteButtonText] = useState(lead.setter_note_id ? "📝 Edit note" : "✚ Add note");
  const [tempSetter, setTempSetter] = useState(setter);
  const navigate = useNavigate();

  useEffect(() => {
    setPickUp(formatStatusValue(lead.picked_up));
    setConfirmed(formatStatusValue(lead.confirmed));
    setShowUp(formatStatusValue(lead.showed_up));
    setPurchase(formatStatusValue(lead.purchased));
    setSetter(lead.setter_id !== null && lead.setter_id !== undefined ? String(lead.setter_id) : '');

  }, [lead, showNoteModal]);

  const setterOptions = Object.entries(setterMap).map(([id, name]) => ({
    id,
    name,
  }));

  return (
    <div
      key={lead.id}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'left',
        marginBottom: '12px',
        minHeight: '80px',
        backgroundColor: 'white',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        padding: '16px',
        paddingRight: '0px',
        transition: 'box-shadow 0.2s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '35px', flex: 1, justifyContent: 'left', flexWrap: 'nowrap' }}>
        <div style={{ width: '25%', alignItems: 'top', justifyContent: 'left' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: '#111827', marginBottom: '4px', marginTop: '4px' }}>
            <a
              onClick={() => navigate(`/lead/${lead.lead_id}`)}
              style={{ cursor: 'pointer', color: '#323232ff', textDecoration: 'none' }}
            >
              {lead.name || 'No name'}
            </a>
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', fontSize: '12px', color: '#6b7280', gap: '4px' }}>
            <Mail size={12} />
            <span>{lead.email || 'No email'}</span>
          </div>
            <div style={{ display: 'flex', alignItems: 'center', fontSize: '12px', color: '#6b7280', gap: '4px' }}>
              <Phone size={12} />
              <span>
                <a
                  href={`https://app.manychat.com/fb1237190/chat/${lead.manychat_user_id || ''}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#6b7280' }}
                >
                  {lead.phone || 'No phone'}
                </a>
              </span>
            </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'left' }}>
          <StatusDropdown
            value={pickUp}
            onChange={(value) => updateStatus(lead.id, 'picked_up', value, setPickUp)}
            label="Pick Up"
            disabled={mode === 'closer'}
          />
          <StatusDropdown
            value={confirmed}
            onChange={(value) => updateStatus(lead.id, 'confirmed', value, setConfirmed)}
            label="Confirmed"
            disabled={mode === 'closer'}
          />
          <StatusDropdown
            value={showUp}
            onChange={(value) => updateStatus(lead.id, 'showed_up', value, setShowUp)}
            label="Show Up"
            disabled={mode === 'setter'}
          />
          <StatusDropdown
            value={purchase}
            onChange={(value) => updateStatus(lead.id, 'purchased', value, setPurchase)}
            label="Purchased"
            disabled={mode === 'setter'}
          />
        </div>

        <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: '#6b7280', paddingLeft: '20px', borderLeft: '1px solid #e5e7eb', minWidth: '150px', maxWidth: '200px', fontWeight: '400', flexDirection: 'column' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>

{(mode !== 'setter') && (

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <User size={12} />
              <span
                onClick={() => navigate(`/setter/${lead.setter_id}`)}
                style={{
                  cursor: 'pointer',
                  color: '#001749ff',
                  textDecoration: 'none',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '0.8';
                  e.currentTarget.style.fontWeight = '600';
                  e.currentTarget.style.transition = 'all 0.2s';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.textDecoration = 'none';
                  e.currentTarget.style.opacity = '1';
                  e.currentTarget.style.fontWeight = '400';
                }}
              >
                Setter: {setterMap[setter] || 'N/A'}
              </span>
            </div>
  )}
      {(mode !== 'closer') && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap'}}>
              <User size={12} />
              <span
                onClick={() => navigate(`/closer/${lead.closer_id}`)}
                style={{
                  cursor: 'pointer',
                  color: '#001749ff',
                  textDecoration: 'none',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '0.8';
                  e.currentTarget.style.fontWeight = '600';
                  e.currentTarget.style.transition = 'all 0.2s';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.textDecoration = 'none';
                  e.currentTarget.style.opacity = '1';
                  e.currentTarget.style.fontWeight = '400';
                }}
              >
                Closer: {closerMap[lead.closer_id] || 'N/A'}
              </span>
            </div> )}
          </div>
          
          <button
  onClick={() => setShowNoteModal(true)}
  style={{
    padding: '5px 0px',
    backgroundColor: '#001749ff',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    whiteSpace: 'nowrap', // Prevents text wrapping
    width: '60%'
  }}> {noteButtonText} </button>

          
        </div> 

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end', color: '#6b7280',fontSize: '12px', marginLeft: 'auto'  }}>

           {(mode === 'closer' || mode === 'full') && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'nowrap' }}>
              <Calendar size={12} />
              <span style={{whiteSpace: 'nowrap'}}>{DateHelpers.formatTimeWithRelative(lead.call_date)|| 'N/A'}</span>
            </div> )}

            {(mode === 'setter' ) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'nowrap' }}>
              <Calendar size={12} />
              <span style={{whiteSpace: 'nowrap'}}>{DateHelpers.formatTimeWithRelative(lead.call_date, lead.timezone) + " " + DateHelpers.getUTCOffset(lead.timezone) || 'N/A'}</span>
            </div>)}


            <div style={{ display: 'flex', alignSelf: 'flex-end', gap: '4px' }}>
              <span>{DateHelpers.formatTimeAgo(lead.book_date) || 'N/A'}</span>
            </div>
            <div style={{ marginLeft: 'auto' }}>
            </div>
          </div>


      </div>

  <ThreeDotsMenu
    onEdit={() => setIsModalOpen(true)}
    onDelete={() => console.log('Delete')}
  />

      <Modal isOpen={isModalOpen} onClose={() => {setIsModalOpen(false); setTempSetter(setter);}}>
        <span style={{ display: 'block', fontSize: '30px', marginBottom: '26px' }}>
  Transfer <b>{lead.name}</b> to
</span>
        <SetterDropdown
          value={tempSetter}
          onChange={(value) => setTempSetter(value)}
          label="Setter"
          options={setterOptions}
        />

        <button onClick={() => {
          updateStatus(lead.id, 'setter_id', tempSetter, setSetter);
          setIsModalOpen(false);
          }} style={{ marginTop: '16px', padding: '8px 16px', backgroundColor: '#001749ff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          Transfer
        </button>
      </Modal>


      <NotesModal isOpen={showNoteModal} onClose={() => setShowNoteModal(false)} lead={lead} callId={lead.id} mode={'setter'} />

    </div>
  );
}

  const updateStatus = async (id, field, value, setterF) => {
    setterF(value); // Update local state immediately for responsiveness

    let formattedValue = value;

    if (['picked_up', 'confirmed', 'showed_up', 'purchased'].includes(field)) {
      if (value === 'true' || value === true) {
        formattedValue = true;
      } else if (value === 'false' || value === false) {
        formattedValue = false;
      } else if (value === 'null' || value === null || value === '') {
        formattedValue = null;
      }
    } else if (field === 'setter_id') {
      formattedValue = value ? Number(value) : null;
    }

    const { error } = await supabase.from('calls').update({ [field]: formattedValue }).eq('id', id);

    if (error) {
      console.error('Error updating lead:', error);
      return;
    }
  };



  const StatusDropdown = ({ value, onChange, label, disabled = false}) => {

    // Get background color based on value
    const getBackgroundColor = () => {
      if (value === true || value === 'true') return '#cfffc5ff'; // green for true
      if (value === false || value === 'false') return '#ff9494ff'; // red for false
      if (value === null || value === '' || value === undefined || value === 'null') return '#f9ffa6ff'; // yellow for null/empty
      return '#f9ffa6ff';
    };
    
    return (
     <div style={{
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  alignItems: 'center',
  justifyContent: 'center'
}}
>
  <label style={{
    whiteSpace: 'nowrap',
    fontSize: '11px',
    fontWeight: '500',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  }}
>
    {label}
  </label>
  <select 
  value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
  style={{
    appearance: 'none',
    backgroundColor: getBackgroundColor(),
    color: '#000000',
    borderColor: '#d1d5db',
    border: '1px solid rgba(0,0,0,0.1)',
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all 0.1s',
    outline: 'none',
    textAlign: 'center'
  }}
  
  onMouseEnter={(e) => {
    e.currentTarget.style.opacity = '0.8';
    e.currentTarget.style.borderColor = '#bcbec0ff';
  }}
  onMouseLeave={(e) => {
    e.currentTarget.style.opacity = '1';
    e.currentTarget.style.borderColor = '#d1d5db';
  }}
  
  >
    <option value={"true"} style={{
      backgroundColor: '#cfffc5',
      padding: '12px',
      fontSize: '14px',
      fontWeight: '500'
    }}>YES</option>
    <option value={"false"}>NO</option>
    <option value={"null"}>TBD</option>
  </select>
</div>
    );
  };


  const SetterDropdown = ({ value, onChange, label, options }) => {

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <label style={{ fontSize: '10px', color: '#6b7280', fontWeight: '500' }}>
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
        padding: '4px 8px',
        borderRadius: '4px',
        fontSize: '12px',
        fontWeight: '500',
        border: '1px solid #d1d5db',
        backgroundColor: '#e8e8e8ff',
        cursor: 'pointer',
        color: '#000000',
        outline: 'none'
        }}
      >
        <option value="">Select setter</option>
        {options.map(({ id, name }) => (
        <option key={id} value={id}>{name}</option>
        ))}
      </select>
      </div>
    );
  };


const ThreeDotsMenu = ({ onEdit, onDelete }) => {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <button
      onClick={() => setMenuOpen(!menuOpen)}
      style={{
        position: 'relative',
        alignSelf: 'flex-start',
        background: 'none',
        border: 'none',
        fontWeight: 'bold',
        cursor: 'pointer',
        padding: '0% 1.5%',
        marginTop: '-5px',
        fontSize: '18px',
        color: '#6b7280',
        marginLeft: '2%',
        outline: 'none'
      }}
    >
      ⋮
      
      {menuOpen && (
        <>
          <div style={{
            position: 'absolute',
            right: '0',
            top: '100%',
            backgroundColor: 'white',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            borderRadius: '4px',
            minWidth: '150px',
            zIndex: 1000
          }}>
            <button 
              onClick={(e) => { 
                e.stopPropagation(); 
                onEdit(); 
                setMenuOpen(false); 
              }}
              style={{
                width: '100%',
                padding: '8px 16px',
                border: 'none',
                background: 'none',
                textAlign: 'left',
                cursor: 'pointer',
                color: '#6b7280',
                fontWeight: '300',
                fontSize: '14px'
              }}
            >
              Transfer
            </button>
            <button 
              onClick={(e) => { 
                e.stopPropagation(); 
                onDelete(); 
                setMenuOpen(false); 
              }}
              style={{
                width: '100%',
                padding: '8px 16px',
                border: 'none',
                background: 'none',
                textAlign: 'left',
                cursor: 'pointer',
                color: '#ef4444',
                fontWeight: '300',
                fontSize: '14px'
              }}
            >
              Report
            </button>
          </div>
          
          <div
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(false);
            }}
            style={{
              position: 'fixed',
              top: 0, left: 0, right: 0, bottom: 0,
              zIndex: 999
            }}
          />
        </>
      )}
    </button>
  );
};
