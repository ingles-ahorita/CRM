import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useParams, useNavigate } from 'react-router-dom';
import { LeadItemCompact, LeadListHeader } from './components/LeadItem';
import { NotesModal } from './components/Modal';
import { Phone, Mail } from 'lucide-react';
import { parseISO } from 'date-fns';
import * as DateHelpers from '../utils/dateHelpers';

// Helper function to parse date string as UTC (matches SQL date_trunc behavior)
function parseDateAsUTC(dateString) {
  // If no timezone indicator, append 'Z' to force UTC parsing
  const hasTimezone = dateString.includes('Z') || dateString.match(/[+-]\d{2}:?\d{2}$/);
  const isoString = hasTimezone ? dateString : dateString + 'Z';
  return parseISO(isoString);
}

export default function CloserStatsDashboard() {
  const { closer } = useParams(); 
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const yearMonth = DateHelpers.getYearMonthInTimezone(new Date(), DateHelpers.DEFAULT_TIMEZONE);
    return yearMonth ? yearMonth.monthKey : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  });
  const [viewMode, setViewMode] = useState('stats'); // 'stats' or 'purchases'
  const [purchases, setPurchases] = useState([]);
  const [purchasesLoading, setPurchasesLoading] = useState(false);
  const [purchasesForCommission, setPurchasesForCommission] = useState([]);
  const [purchasesForCommissionLoading, setPurchasesForCommissionLoading] = useState(false);
  const [purchaseLogRefunds, setPurchaseLogRefunds] = useState([]);
  const [purchaseLogRefundsLoading, setPurchaseLogRefundsLoading] = useState(false);
  const [secondInstallments, setSecondInstallments] = useState(0);
  const [secondInstallmentsCommission, setSecondInstallmentsCommission] = useState(0);
  const [secondInstallmentsLoading, setSecondInstallmentsLoading] = useState(false);
  const [secondInstallmentsList, setSecondInstallmentsList] = useState([]);
  const [secondInstallmentsListLoading, setSecondInstallmentsListLoading] = useState(false);
  const [refunds, setRefunds] = useState(0);
  const [refundsLoading, setRefundsLoading] = useState(false);
  const [refundsCommission, setRefundsCommission] = useState(0);
  const [refundsCommissionLoading, setRefundsCommissionLoading] = useState(false);
  const [refundsList, setRefundsList] = useState([]);
  const [refundsListLoading, setRefundsListLoading] = useState(false);
  const [sameMonthRefundsList, setSameMonthRefundsList] = useState([]);
  const [previousMonthRefundsList, setPreviousMonthRefundsList] = useState([]);
  const [setterMap, setSetterMap] = useState({});
  const [closerMap, setCloserMap] = useState({});
  const navigate = useNavigate();

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const monthlyData = await fetchMonthlyCloserStats(closer);
      setData(monthlyData);
      setLoading(false);
    };
    loadData();
  }, [closer]);

  // Fetch setters and closers maps
  useEffect(() => {
    const fetchMaps = async () => {
      const { data: settersData } = await supabase
        .from('setters')
        .select('id, name');
      if (settersData) {
        const setterMapObj = {};
        settersData.forEach(s => { setterMapObj[s.id] = s.name; });
        setSetterMap(setterMapObj);
      }

      const { data: closersData } = await supabase
        .from('closers')
        .select('id, name');
      if (closersData) {
        const closerMapObj = {};
        closersData.forEach(c => { closerMapObj[c.id] = c.name; });
        setCloserMap(closerMapObj);
      }
    };
    fetchMaps();
  }, []);

  // Fetch purchases when month changes or view mode changes
  useEffect(() => {
    if (viewMode === 'purchases') {
      const loadPurchases = async () => {
        setPurchasesLoading(true);
        setPurchaseLogRefundsLoading(true);
        const purchasesData = await fetchPurchases(closer, selectedMonth);
        setPurchases(purchasesData);
        // Also fetch refunds list based on refund_date
        const refundsData = await fetchPurchaseLogRefunds(closer, selectedMonth);
        setPurchaseLogRefunds(refundsData);
        setPurchasesLoading(false);
        setPurchaseLogRefundsLoading(false);
      };
      loadPurchases();
    } else if (viewMode === 'refunds') {
      const loadRefundsList = async () => {
        setRefundsListLoading(true);
        const refundsData = await fetchRefundsList(closer, selectedMonth);
        // Split refunds into same-month and previous-month
        const sameMonth = refundsData.filter(refund => {
          if (!refund.purchase_date || !refund.refund_date) return false;
          return DateHelpers.isSameMonthInTimezone(
            refund.purchase_date,
            refund.refund_date,
            DateHelpers.DEFAULT_TIMEZONE
          );
        });
        const previousMonth = refundsData.filter(refund => {
          if (!refund.purchase_date || !refund.refund_date) return false;
          return !DateHelpers.isSameMonthInTimezone(
            refund.purchase_date,
            refund.refund_date,
            DateHelpers.DEFAULT_TIMEZONE
          );
        });
        setSameMonthRefundsList(sameMonth);
        setPreviousMonthRefundsList(previousMonth);
        setRefundsList(refundsData);
        setRefundsListLoading(false);
      };
      loadRefundsList();
    } else if (viewMode === 'secondInstallments') {
      const loadSecondInstallmentsList = async () => {
        setSecondInstallmentsListLoading(true);
        // Calculate previous month for second installments
        const [year, monthNum] = selectedMonth.split('-');
        const prevMonthDate = new Date(parseInt(year), parseInt(monthNum) - 2, 1);
        const prevMonth = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;
        const secondInstallmentsData = await fetchSecondInstallmentsList(closer, prevMonth);
        setSecondInstallmentsList(secondInstallmentsData);
        setSecondInstallmentsListLoading(false);
      };
      loadSecondInstallmentsList();
    }
  }, [closer, selectedMonth, viewMode]);

  // Fetch second installments from previous month
  useEffect(() => {
    const loadSecondInstallments = async () => {
      setSecondInstallmentsLoading(true);
      const result = await fetchSecondInstallments(closer, selectedMonth);
      setSecondInstallments(result.count);
      setSecondInstallmentsCommission(result.commission);
      setSecondInstallmentsLoading(false);
    };
    loadSecondInstallments();
  }, [closer, selectedMonth]);

  // Fetch refunds from selected month
  useEffect(() => {
    const loadRefunds = async () => {
      setRefundsLoading(true);
      setRefundsCommissionLoading(true);
      const count = await fetchRefunds(closer, selectedMonth);
      setRefunds(count);
      // Also fetch refunds commission based on refund_date
      const refundsComm = await fetchRefundsCommission(closer, selectedMonth);
      setRefundsCommission(refundsComm);
      setRefundsLoading(false);
      setRefundsCommissionLoading(false);
    };
    loadRefunds();
  }, [closer, selectedMonth]);

  // Always fetch purchases for commission calculation (regardless of viewMode)
  useEffect(() => {
    const loadPurchasesForCommission = async () => {
      setPurchasesForCommissionLoading(true);
      const purchasesData = await fetchPurchases(closer, selectedMonth);
      setPurchasesForCommission(purchasesData);
      setPurchasesForCommissionLoading(false);
    };
    loadPurchasesForCommission();
  }, [closer, selectedMonth]); 

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-xl text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <button 
          onClick={() => navigate(-1)} 
          style={{ backgroundColor: '#727272ff', marginBottom: 12, color: 'white', padding: '5px 7px' }}
        >
          ← Back
        </button>
        
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          {data[0]?.closerName || 'Closer'} - Monthly Stats
        </h1>
        
        {/* View Mode Toggle */}
        <div className="mb-4 flex gap-2">
          <button
            onClick={() => setViewMode('stats')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              viewMode === 'stats'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Stats
          </button>
          <button
            onClick={() => setViewMode('purchases')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              viewMode === 'purchases'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Purchase Log
          </button>
          <button
            onClick={() => setViewMode('refunds')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              viewMode === 'refunds'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Refunds
          </button>
          <button
            onClick={() => setViewMode('secondInstallments')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              viewMode === 'secondInstallments'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Second Installments
          </button>
        </div>

        {/* Month Selector */}
        <div className="mb-6 bg-white p-4 rounded-lg shadow">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Month
          </label>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {data.map((row) => (
              <option key={row.month} value={row.month}>
                {row.month}
              </option>
            ))}
          </select>
        </div>
        
        {viewMode === 'stats' ? (
          <>
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                        Month
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">
                        Show-Ups
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">
                        Purchases
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">
                        Base Commission
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider bg-green-50">
                        Conversion Rate
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {data.filter(row => row.month >= '2025-10').map((row, index) => (
                      <tr key={index} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {row.month}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900 font-semibold">
                          {row.showUps}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900 font-semibold">
                          {row.purchases}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-bold text-gray-900">
                          ${row.revenue?.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-semibold bg-green-50">
                          <span className={`${
                            row.conversionRate >= 70 ? 'text-green-600' : 
                            row.conversionRate >= 50 ? 'text-yellow-600' : 
                            'text-red-600'
                          }`}>
                            {row.conversionRate > 0 ? `${row.conversionRate?.toFixed(2)}%` : '-%'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Current Month Stats */}
            {(() => {
              const currentMonthData = data.find(row => row.month === selectedMonth);
              if (!currentMonthData) return null;
              
              // Calculate previous month
              const [year, monthNum] = selectedMonth.split('-');
              const prevMonthDate = new Date(parseInt(year), parseInt(monthNum) - 2, 1);
              const prevMonth = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;
              
              return (
                <div className="mt-6 grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div className="bg-white rounded-lg shadow p-6">
                    <div className="text-sm font-medium text-gray-500">Show-Ups ({selectedMonth})</div>
                    <div className="mt-2 text-3xl font-bold text-gray-900">
                      {currentMonthData.showUps}
                    </div>
                  </div>
                  
                  <div className="bg-white rounded-lg shadow p-6">
                    <div className="text-sm font-medium text-gray-500">Purchases ({selectedMonth})</div>
                    <div className="mt-2 text-3xl font-bold text-green-600">
                      {currentMonthData.purchases}
                    </div>
                  </div>
                  
                  <div className="bg-white rounded-lg shadow p-6">
                    <div className="text-sm font-medium text-gray-500">Second Installments ({prevMonth})</div>
                    <div className="mt-2 text-3xl font-bold text-purple-600">
                      {secondInstallmentsLoading ? (
                        <span className="text-lg">...</span>
                      ) : (
                        secondInstallments
                      )}
                    </div>
                  </div>
                  
                  <div className="bg-white rounded-lg shadow p-6">
                    <div className="text-sm font-medium text-gray-500">Refunds ({selectedMonth})</div>
                    <div className="mt-2 text-3xl font-bold text-red-600">
                      {refundsLoading ? (
                        <span className="text-lg">...</span>
                      ) : (
                        refunds
                      )}
                    </div>
                  </div>
                  
                  <div className="bg-white rounded-lg shadow p-6">
                    <div className="text-sm font-medium text-gray-500">Conversion Rate ({selectedMonth})</div>
                    <div className="mt-2 text-3xl font-bold text-blue-600">
                      {currentMonthData.conversionRate?.toFixed(1)}%
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-sm font-medium text-gray-500">Comission ({selectedMonth})</div>
                <div className="mt-2 text-3xl font-bold text-purple-600">
                  ${(() => {
                    const currentMonthRevenue = data.find(row => row.month === selectedMonth)?.revenue || 0;
                    const secondInstallmentsComm = secondInstallmentsLoading ? 0 : secondInstallmentsCommission;
                    const refundsComm = refundsCommissionLoading ? 0 : refundsCommission;
                    
                    // Calculate commission from same-month refunds in purchases table
                    // These are refunds that happened in the same month as purchase
                    // Their commission can be 0 (if clawback is 100%) or positive (if clawback < 100%)
                    // Use purchasesForCommission which is always loaded, not purchases which is only loaded in purchases view
                    const sameMonthRefundsComm = purchasesForCommissionLoading ? 0 : purchasesForCommission
                      .filter(p => p.outcome === 'refund' && p.commission !== null && p.commission !== undefined)
                      .reduce((sum, p) => sum + (p.commission || 0), 0);
                    
                    // Refunds commission is already negative, so adding it subtracts from total
                    // Same-month refunds commission is positive (or 0), so adding it adds to total
                    const totalCommission = currentMonthRevenue + secondInstallmentsComm + refundsComm + sameMonthRefundsComm;
                    return totalCommission.toFixed(2);
                  })()}
                </div>
                <div className="text-xs text-gray-500 mt-1 space-y-1">
                  <div>Base: ${data.find(row => row.month === selectedMonth)?.revenue?.toFixed(2) || '0.00'}</div>
                  {!secondInstallmentsLoading && secondInstallmentsCommission > 0 && (
                    <div className="text-green-600">+ ${secondInstallmentsCommission.toFixed(2)} from second installments</div>
                  )}
                  {(() => {
                    // Use purchasesForCommission which is always loaded, not purchases which is only loaded in purchases view
                    const sameMonthRefundsComm = purchasesForCommissionLoading ? 0 : purchasesForCommission
                      .filter(p => p.outcome === 'refund' && p.commission !== null && p.commission !== undefined)
                      .reduce((sum, p) => sum + (p.commission || 0), 0);
                    return !purchasesForCommissionLoading && sameMonthRefundsComm > 0 && (
                      <div className="text-green-600">+ ${sameMonthRefundsComm.toFixed(2)} from same-month refunds (clawback)</div>
                    );
                  })()}
                  {!refundsCommissionLoading && (
                    <div className={refundsCommission < 0 ? 'text-red-600' : 'text-gray-500'}>
                      {refundsCommission > 0 ? '+' : ''}${refundsCommission.toFixed(2)} from previous-month refunds
                    </div>
                  )}
                </div>
              </div>
              
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-sm font-medium text-gray-500">Best Month Overall</div>
                <div className="mt-2 text-2xl font-bold text-green-600">
                  {data.length > 0 ? data.reduce((best, current) => 
                    (current.purchases > best.purchases) ? current : best
                  ).month : 'N/A'}
                </div>
                <div className="text-sm text-gray-500">
                  {data.length > 0 ? data.reduce((best, current) => 
                    (current.purchases > best.purchases) ? current : best
                  ).purchases : 0} purchases
                </div>
              </div>
            </div>
          </>
        ) : viewMode === 'purchases' ? (
          <>
            {/* Purchases Table */}
            <div className="bg-white rounded-lg shadow mb-6">
              <div className="p-4 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">
                  Purchases - {selectedMonth}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  {purchases.length} purchase{purchases.length !== 1 ? 's' : ''} found
                </p>
              </div>
              {purchasesLoading ? (
                <div className="p-8 text-center text-gray-500">Loading purchases...</div>
              ) : purchases.length === 0 ? (
                <div className="p-8 text-center text-gray-500">No purchases found for this month.</div>
              ) : (
                <div>
                  {/* Purchase Log Header */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 1.2fr 1.2fr 1.5fr 1fr 1fr',
                      gap: '16px',
                      padding: '12px 16px',
                      backgroundColor: '#f3f4f6',
                      borderBottom: '2px solid #e5e7eb',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: '#6b7280',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}
                  >
                    <div>Contact Info</div>
                    <div>Setter</div>
                    <div>Purchase Date</div>
                    <div>Offer</div>
                    <div style={{ textAlign: 'center' }}>Commission</div>
                    <div style={{ textAlign: 'center' }}>Notes</div>
                  </div>
                  {purchases.map(lead => (
                    <PurchaseItem
                      key={lead.id}
                      lead={lead}
                      setterMap={setterMap}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Refunds Table */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-4 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">
                  Refunds from Previous Months - {selectedMonth}
                </h2>
                <p className="text-sm text-red-600 mt-1">
                  {purchaseLogRefunds.length} refund{purchaseLogRefunds.length !== 1 ? 's' : ''} found from previous month{purchaseLogRefunds.length !== 1 ? 's' : ''} (based on refund date)
                </p>
              </div>
              {purchaseLogRefundsLoading ? (
                <div className="p-8 text-center text-gray-500">Loading refunds...</div>
              ) : purchaseLogRefunds.length === 0 ? (
                <div className="p-8 text-center text-gray-500">No refunds from previous months found for this period.</div>
              ) : (
                <div>
                  {/* Refunds Log Header */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 1.2fr 1.2fr 1.2fr 1.5fr 1fr 1fr',
                      gap: '16px',
                      padding: '12px 16px',
                      backgroundColor: '#f3f4f6',
                      borderBottom: '2px solid #e5e7eb',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: '#6b7280',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}
                  >
                    <div>Contact Info</div>
                    <div>Setter</div>
                    <div>Purchase Date</div>
                    <div>Refund Date</div>
                    <div>Offer</div>
                    <div style={{ textAlign: 'center' }}>Commission</div>
                    <div style={{ textAlign: 'center' }}>Notes</div>
                  </div>
                  {purchaseLogRefunds.map(lead => (
                    <PurchaseItem
                      key={lead.id}
                      lead={lead}
                      setterMap={setterMap}
                      isRefundsTable={true}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        ) : viewMode === 'refunds' ? (
          <>
            {/* Same Month Refunds Table */}
            <div className="bg-white rounded-lg shadow mb-6">
              <div className="p-4 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">
                  Refunds from Same Month - {selectedMonth}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  {sameMonthRefundsList.length} refund{sameMonthRefundsList.length !== 1 ? 's' : ''} found (commission: $0.00)
                </p>
              </div>
              {refundsListLoading ? (
                <div className="p-8 text-center text-gray-500">Loading refunds...</div>
              ) : sameMonthRefundsList.length === 0 ? (
                <div className="p-8 text-center text-gray-500">No same-month refunds found.</div>
              ) : (
                <div>
                  {/* Same Month Refunds Header */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 1.2fr 1.2fr 1.5fr 1fr 1fr',
                      gap: '16px',
                      padding: '12px 16px',
                      backgroundColor: '#f3f4f6',
                      borderBottom: '2px solid #e5e7eb',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: '#6b7280',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}
                  >
                    <div>Contact Info</div>
                    <div>Setter</div>
                    <div>Refund Date</div>
                    <div>Offer</div>
                    <div style={{ textAlign: 'center' }}>Commission</div>
                    <div style={{ textAlign: 'center' }}>Notes</div>
                  </div>
                  {sameMonthRefundsList.map(lead => (
                    <PurchaseItem
                      key={lead.id}
                      lead={lead}
                      setterMap={setterMap}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Previous Month Refunds Table */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-4 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">
                  Refunds from Previous Months - {selectedMonth}
                </h2>
                <p className="text-sm text-red-600 mt-1">
                  {previousMonthRefundsList.length} refund{previousMonthRefundsList.length !== 1 ? 's' : ''} found (based on refund date)
                </p>
              </div>
              {refundsListLoading ? (
                <div className="p-8 text-center text-gray-500">Loading refunds...</div>
              ) : previousMonthRefundsList.length === 0 ? (
                <div className="p-8 text-center text-gray-500">No refunds from previous months found.</div>
              ) : (
                <div>
                  {/* Previous Month Refunds Header */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 1.2fr 1.2fr 1.2fr 1.5fr 1fr 1fr',
                      gap: '16px',
                      padding: '12px 16px',
                      backgroundColor: '#f3f4f6',
                      borderBottom: '2px solid #e5e7eb',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: '#6b7280',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}
                  >
                    <div>Contact Info</div>
                    <div>Setter</div>
                    <div>Purchase Date</div>
                    <div>Refund Date</div>
                    <div>Offer</div>
                    <div style={{ textAlign: 'center' }}>Commission</div>
                    <div style={{ textAlign: 'center' }}>Notes</div>
                  </div>
                  {previousMonthRefundsList.map(lead => (
                    <PurchaseItem
                      key={lead.id}
                      lead={lead}
                      setterMap={setterMap}
                      isRefundsTable={true}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        ) : viewMode === 'secondInstallments' ? (
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                Second Installments - {(() => {
                  const [year, monthNum] = selectedMonth.split('-');
                  const prevMonthDate = new Date(parseInt(year), parseInt(monthNum) - 2, 1);
                  return `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;
                })()}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {secondInstallmentsList.length} second installment{secondInstallmentsList.length !== 1 ? 's' : ''} found
              </p>
            </div>
            {secondInstallmentsListLoading ? (
              <div className="p-8 text-center text-gray-500">Loading second installments...</div>
            ) : secondInstallmentsList.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No second installments found for the previous month.</div>
            ) : (
              <div>
                {/* Second Installments Log Header */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1.2fr 1.2fr 1.5fr 1fr 1fr',
                    gap: '16px',
                    padding: '12px 16px',
                    backgroundColor: '#f3f4f6',
                    borderBottom: '2px solid #e5e7eb',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}
                >
                  <div>Contact Info</div>
                  <div>Setter</div>
                  <div>Purchase Date</div>
                  <div>Offer</div>
                  <div style={{ textAlign: 'center' }}>Commission</div>
                  <div style={{ textAlign: 'center' }}>Notes</div>
                </div>
                {secondInstallmentsList.map(lead => (
                  <PurchaseItem
                    key={lead.id}
                    lead={lead}
                    setterMap={setterMap}
                  />
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

async function fetchMonthlyCloserStats(closer = null) {
  console.log('this is the closer', closer);
  // Fetch calls for show-up calculations
  let callsQuery = supabase
    .from('calls')
    .select(`
      call_date, 
      showed_up,
      is_reschedule,
      lead_id,
      closers (id, name)
    `)
    .gte('call_date', '2025-10-01')
    .order('call_date', { ascending: true });

  // Filter by closer if provided
  if (closer) {
    callsQuery = callsQuery.eq('closer_id', closer);
  }

  const { data: calls, error: callsError } = await callsQuery;

  if (callsError) {
    console.error('Error fetching calls:', callsError);
    return [];
  }

  // Filter out rescheduled leads to avoid double-counting
  const rescheduledLeadIds = new Set(
    calls.filter(c => c.is_reschedule === true).map(c => c.lead_id)
  );

  const filteredCalls = calls.filter(call => {
    const keep = call.is_reschedule === true || !rescheduledLeadIds.has(call.lead_id);
    return keep;
  });

  // Fetch outcome_log entries for purchase calculations (include 'yes' outcomes and refunds with clawback < 100%)
  let outcomeQuery = supabase
    .from('outcome_log')
    .select(`
      purchase_date,
      outcome,
      commission,
      clawback,
      call_id,
      calls!inner!call_id (
        closer_id,
        closers (id, name)
      )
    `)
    .in('outcome', ['yes', 'refund'])
    .not('purchase_date', 'is', null);

  // Filter by closer via the calls relationship
  if (closer) {
    outcomeQuery = outcomeQuery.eq('calls.closer_id', closer);
    console.log('Filtering outcome_log by closer_id:', closer);
  }

  const { data: outcomeLogs, error: outcomeError } = await outcomeQuery;
  
  if (closer && outcomeLogs) {
    console.log(`Found ${outcomeLogs.length} outcome_log entries for closer ${closer}`);
    // Check if any entries have the wrong closer_id
    const wrongCloser = outcomeLogs.filter(ol => ol.calls && ol.calls.closer_id !== closer);
    if (wrongCloser.length > 0) {
      console.warn(`Warning: Found ${wrongCloser.length} outcome_log entries with wrong closer_id:`, wrongCloser);
    }
  }

  if (outcomeError) {
    console.error('Error fetching outcome logs:', outcomeError);
    return [];
  }

  return calculateMonthlyCloserData(filteredCalls, outcomeLogs || []);
}

function calculateMonthlyCloserData(calls, outcomeLogs) {
  const grouped = {};

  function getMonth(dateValue) {
    if (!dateValue) return null;

    // Use date-fns helper to normalize to timezone
    const yearMonth = DateHelpers.getYearMonthInTimezone(dateValue, DateHelpers.DEFAULT_TIMEZONE);
    if (!yearMonth) return null;
    
    const key = yearMonth.monthKey;

    if (!grouped[key]) {
      grouped[key] = {
        month: yearMonth.monthKey,
        showUps: 0,
        purchases: 0,
        revenue: 0,
      };
    }
    return grouped[key];
  }

  // Count show-ups based on call_date from calls
  calls.forEach(call => {
    if (!call.call_date) return;
    if (call.showed_up === true) {
      getMonth(call.call_date).showUps++;
    }
  });
  
  // Count purchases and calculate revenue from outcome_log
  outcomeLogs.forEach(outcomeLog => {
    if (!outcomeLog.purchase_date) return;
    const monthP = getMonth(outcomeLog.purchase_date);
    
    // Count 'yes' outcomes as purchases
    if (monthP && outcomeLog.outcome === 'yes') {
      console.log(monthP.month, outcomeLog.outcome);
      monthP.purchases++;
      // Add commission to revenue if available
      if (outcomeLog.commission) {
        monthP.revenue += outcomeLog.commission;
      }
    }
    
    // Count refunds with clawback < 100% as purchases (partial refunds)
    if (monthP && outcomeLog.outcome === 'refund') {
      const clawbackPercentage = outcomeLog.clawback ?? 100;
      if (clawbackPercentage < 100) {
        console.log(monthP.month, 'refund with clawback < 100%:', clawbackPercentage);
        monthP.purchases++;
      }
    }
  });

  return Object.values(grouped).map(item => ({
    ...item,
    conversionRate: item.showUps > 0 ? (item.purchases / item.showUps) * 100 : 0,
    closerName: calls[0]?.closers?.name || outcomeLogs[0]?.calls?.closers?.name || 'Unknown Closer'
  })).sort((a, b) => a.month.localeCompare(b.month));
}

async function fetchPurchases(closer = null, month = null) {
  if (!month) return [];

  // Parse month (format: YYYY-MM) and create a date in UTC for that month
  const [year, monthNum] = month.split('-');
  // Create date in UTC (15th of month) to avoid edge cases
  const monthDate = new Date(Date.UTC(parseInt(year), parseInt(monthNum) - 1, 15));
  
  // Use date-fns helper to get month range normalized to timezone
  const monthRange = DateHelpers.getMonthRangeInTimezone(monthDate, DateHelpers.DEFAULT_TIMEZONE);
  
  if (!monthRange) return [];
  
  const startDate = monthRange.startDate;
  const endDate = monthRange.endDate;
  
  console.log('Date range filter:', {
    month,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString()
  });

  // Format dates for Supabase query (ensure they're in ISO format)
  const startDateISO = startDate.toISOString();
  const endDateISO = endDate.toISOString();
  
  // Now query outcome_log - include both 'yes' and 'refund' outcomes
  // We'll filter refunds to only include those in same month as purchase
  let query = supabase
    .from('outcome_log')
    .select(`
      *,
      calls!inner!call_id (
        *,
        closers (id, name),
        setters (id, name),
        leads (id, customer_id)
      ),
      offers!offer_id (
        id,
        name
      )
    `)
    .in('outcome', ['yes', 'refund'])
    .gte('purchase_date', startDateISO)
    .lte('purchase_date', endDateISO)
    .order('purchase_date', { ascending: false });

  // Filter by closer_id directly in the join if closer is specified
  if (closer) {
    query = query.eq('calls.closer_id', closer);
  }

  const { data: outcomeLogs, error } = await query;

  if (error) {
    console.error('Error fetching purchases:', error);
    return [];
  }

  // First, deduplicate outcome_log entries by call_id BEFORE transforming
  // If multiple outcome_log entries exist for the same call_id, keep only the most recent one
  const outcomeLogsByCallId = new Map();
  
  (outcomeLogs || []).forEach(outcomeLog => {
    // Must have a valid call
    if (!outcomeLog.calls || !outcomeLog.calls.id) return;
    
    // Double-check closer_id if specified
    if (closer && outcomeLog.calls.closer_id !== closer) {
      return;
    }
    
    const callId = outcomeLog.calls.id;
    const existing = outcomeLogsByCallId.get(callId);
    
    // If no existing entry, or this outcome_log_id is newer, keep this one
    if (!existing || outcomeLog.id > existing.id) {
      outcomeLogsByCallId.set(callId, outcomeLog);
    }
  });
  
  // Now transform the deduplicated outcome_log entries (preserve leads for customer_id indicator)
  let purchases = Array.from(outcomeLogsByCallId.values())
    .map(outcomeLog => {
      // Check if refund happened in same month as purchase (normalized to timezone)
      const isSameMonthRefund = outcomeLog.outcome === 'refund' && 
        outcomeLog.purchase_date && 
        outcomeLog.refund_date &&
        DateHelpers.isSameMonthInTimezone(
          outcomeLog.purchase_date, 
          outcomeLog.refund_date, 
          DateHelpers.DEFAULT_TIMEZONE
        );
      
      // Check if clawback percentage is less than 100
      const clawbackPercentage = outcomeLog.clawback ?? 100;
      const hasClawbackAdjustment = clawbackPercentage < 100;
      
      // For same-month refunds: if clawback < 100%, preserve the adjusted commission (positive)
      // Otherwise, set to 0. For purchases and previous-month refunds, use the stored commission
      let commission = outcomeLog.commission;
      if (isSameMonthRefund && !hasClawbackAdjustment) {
        commission = 0;
      }
      
      return {
        ...outcomeLog.calls,
        // Add outcome_log fields that might be useful
        outcome_log_id: outcomeLog.id,
        purchase_date: outcomeLog.purchase_date,
        refund_date: outcomeLog.refund_date,
        outcome: outcomeLog.outcome,
        commission: commission,
        offer_id: outcomeLog.offer_id,
        offer_name: outcomeLog.offers?.name || null,
        discount: outcomeLog.discount,
        // Keep purchased_at for backward compatibility, but use purchase_date
        purchased_at: outcomeLog.purchase_date,
        purchased: true
      };
    });

  // Filter by date range and closer - ensure all purchases are within the selected month and belong to the correct closer
  purchases = purchases.filter(purchase => {
    // Must have purchase_date
    if (!purchase.purchase_date) return false;
    
    // Filter by closer_id if specified
    if (closer && purchase.closer_id !== closer) {
      return false;
    }
    
    // For refunds, only include if refund happened in same month as purchase
    if (purchase.outcome === 'refund') {
      if (!purchase.refund_date) return false;
      const purchaseDate = new Date(purchase.purchase_date);
      // Only include if same month (normalized to timezone)
      if (!DateHelpers.isSameMonthInTimezone(
        purchase.purchase_date,
        purchase.refund_date,
        DateHelpers.DEFAULT_TIMEZONE
      )) return false;
    }
    
    // Filter by date range (based on purchase_date)
    const purchaseDate = new Date(purchase.purchase_date);
    const purchaseDateOnly = new Date(purchaseDate.getFullYear(), purchaseDate.getMonth(), purchaseDate.getDate());
    const startDateOnly = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const endDateOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
    
    return purchaseDateOnly >= startDateOnly && purchaseDateOnly <= endDateOnly;
  });
  
  // Sort by purchase_date descending
  purchases.sort((a, b) => {
    const dateA = new Date(a.purchase_date);
    const dateB = new Date(b.purchase_date);
    return dateB - dateA;
  });

  return purchases;
}

async function fetchSecondInstallments(closer = null, currentMonth = null) {
  if (!currentMonth) return { count: 0, commission: 0 };

  // Calculate previous month
  const [year, monthNum] = currentMonth.split('-');
  const prevMonthDate = new Date(parseInt(year), parseInt(monthNum) - 2, 1);
  const prevYear = prevMonthDate.getFullYear();
  const prevMonth = prevMonthDate.getMonth() + 1;
  
  // Create dates at start and end of previous month in UTC
  const startDate = new Date(Date.UTC(prevYear, prevMonth - 1, 1, 0, 0, 0, 0));
  const endDate = new Date(Date.UTC(prevYear, prevMonth, 0, 23, 59, 59, 999));
  
  // Format dates for Supabase query
  const startDateISO = startDate.toISOString().split('T')[0] + 'T00:00:00.000Z';
  const endDateISO = endDate.toISOString().split('T')[0] + 'T23:59:59.999Z';
  
  // Query outcome_log for second installments from previous month (include commission)
  let query = supabase
    .from('outcome_log')
    .select(`
      id,
      call_id,
      commission,
      calls!inner!call_id (
        closer_id
      )
    `)
    .eq('outcome', 'yes')
    .eq('paid_second_installment', true)
    .gte('purchase_date', startDateISO)
    .lte('purchase_date', endDateISO);

  // Filter by closer_id if specified
  if (closer) {
    query = query.eq('calls.closer_id', closer);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching second installments:', error);
    return { count: 0, commission: 0 };
  }

  // Filter by closer_id in JavaScript as well (in case join filter doesn't work)
  let filteredData = data || [];
  if (closer) {
    filteredData = filteredData.filter(item => 
      item.calls && item.calls.closer_id === closer
    );
  }

  // Calculate total commission
  const totalCommission = filteredData.reduce((sum, item) => {
    return sum + (item.commission || 0);
  }, 0);

  return {
    count: filteredData.length,
    commission: totalCommission
  };
}

async function fetchRefunds(closer = null, month = null) {
  if (!month) return 0;

  // Parse month (format: YYYY-MM)
  const [year, monthNum] = month.split('-');
  // Create dates at start and end of month in UTC
  const startDate = new Date(Date.UTC(parseInt(year), parseInt(monthNum) - 1, 1, 0, 0, 0, 0));
  const endDate = new Date(Date.UTC(parseInt(year), parseInt(monthNum), 0, 23, 59, 59, 999));
  
  // Query outcome_log for refunds
  let query = supabase
    .from('outcome_log')
    .select(`
      id,
      call_id,
      refund_date,
      purchase_date,
      calls!inner!call_id (
        closer_id
      )
    `)
    .eq('outcome', 'refund');

  // Filter by closer_id if specified
  if (closer) {
    query = query.eq('calls.closer_id', closer);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching refunds:', error);
    return 0;
  }

  // Filter by closer_id in JavaScript as well (in case join filter doesn't work)
  let filteredData = data || [];
  if (closer) {
    filteredData = filteredData.filter(item => 
      item.calls && item.calls.closer_id === closer
    );
  }

  // Filter by date range in JavaScript (check refund_date first, then purchase_date)
  filteredData = filteredData.filter(item => {
    const dateToCheck = item.refund_date || item.purchase_date;
    if (!dateToCheck) return false;
    
    const checkDate = new Date(dateToCheck);
    const checkDateOnly = new Date(checkDate.getFullYear(), checkDate.getMonth(), checkDate.getDate());
    const startDateOnly = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const endDateOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
    
    return checkDateOnly >= startDateOnly && checkDateOnly <= endDateOnly;
  });

  return filteredData.length;
}

async function fetchRefundsCommission(closer = null, month = null) {
  if (!month) return 0;

  // Parse month (format: YYYY-MM)
  const [year, monthNum] = month.split('-');
  // Create dates at start and end of month in UTC
  const startDate = new Date(Date.UTC(parseInt(year), parseInt(monthNum) - 1, 1, 0, 0, 0, 0));
  const endDate = new Date(Date.UTC(parseInt(year), parseInt(monthNum), 0, 23, 59, 59, 999));
  
  // Format dates for Supabase query
  const startDateISO = startDate.toISOString().split('T')[0] + 'T00:00:00.000Z';
  const endDateISO = endDate.toISOString().split('T')[0] + 'T23:59:59.999Z';
  
  // Query outcome_log for refunds with refund_date in the selected month
  // Include purchase_date to check if refund happened in same month as sale
  let query = supabase
    .from('outcome_log')
    .select(`
      id,
      call_id,
      refund_date,
      purchase_date,
      commission,
      calls!inner!call_id (
        closer_id
      )
    `)
    .eq('outcome', 'refund')
    .not('refund_date', 'is', null)
    .gte('refund_date', startDateISO)
    .lte('refund_date', endDateISO);

  // Filter by closer_id if specified
  if (closer) {
    query = query.eq('calls.closer_id', closer);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching refunds commission:', error);
    return 0;
  }

  // Filter by closer_id in JavaScript as well (in case join filter doesn't work)
  let filteredData = data || [];
  if (closer) {
    filteredData = filteredData.filter(item => 
      item.calls && item.calls.closer_id === closer
    );
  }

  // Filter by date range and exclude refunds that happened in same month as sale
  filteredData = filteredData.filter(item => {
    if (!item.refund_date) return false;
    
    // Check if refund_date is in the selected month
    const refundDate = new Date(item.refund_date);
    const refundDateOnly = new Date(refundDate.getFullYear(), refundDate.getMonth(), refundDate.getDate());
    const startDateOnly = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const endDateOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
    
    if (refundDateOnly < startDateOnly || refundDateOnly > endDateOnly) {
      return false;
    }
    
    // Exclude if refund happened in same month as purchase
    if (item.purchase_date) {
      const purchaseDate = new Date(item.purchase_date);
      const refundMonth = refundDate.getFullYear() * 12 + refundDate.getMonth();
      const purchaseMonth = purchaseDate.getFullYear() * 12 + purchaseDate.getMonth();
      
      // If refund and purchase are in the same month, exclude it
      if (refundMonth === purchaseMonth) {
        return false;
      }
    }
    
    return true;
  });

  // Sum up commission (refunds commission is negative)
  const totalCommission = filteredData.reduce((sum, item) => {
    return sum + (item.commission || 0);
  }, 0);

  return totalCommission;
}

async function fetchPurchaseLogRefunds(closer = null, month = null) {
  if (!month) return [];

  // Parse month (format: YYYY-MM)
  const [year, monthNum] = month.split('-');
  // Create dates at start and end of month in UTC
  const startDate = new Date(Date.UTC(parseInt(year), parseInt(monthNum) - 1, 1, 0, 0, 0, 0));
  const endDate = new Date(Date.UTC(parseInt(year), parseInt(monthNum), 0, 23, 59, 59, 999));
  
  // Format dates for Supabase query
  const startDateISO = startDate.toISOString().split('T')[0] + 'T00:00:00.000Z';
  const endDateISO = endDate.toISOString().split('T')[0] + 'T23:59:59.999Z';
  
  // Query outcome_log for refunds with refund_date in the selected month
  let query = supabase
    .from('outcome_log')
    .select(`
      *,
      calls!inner!call_id (
        *,
        closers (id, name),
        setters (id, name),
        leads (id, customer_id)
      ),
      offers!offer_id (
        id,
        name
      )
    `)
    .eq('outcome', 'refund')
    .not('refund_date', 'is', null)
    .gte('refund_date', startDateISO)
    .lte('refund_date', endDateISO)
    .order('refund_date', { ascending: false });

  // Filter by closer_id if specified
  if (closer) {
    query = query.eq('calls.closer_id', closer);
  }

  const { data: outcomeLogs, error } = await query;

  if (error) {
    console.error('Error fetching purchase log refunds:', error);
    return [];
  }

  // Transform outcome_log entries
  let refunds = (outcomeLogs || [])
    .map(outcomeLog => ({
      ...outcomeLog.calls,
      outcome_log_id: outcomeLog.id,
      purchase_date: outcomeLog.purchase_date,
      refund_date: outcomeLog.refund_date,
      outcome: outcomeLog.outcome,
      commission: outcomeLog.commission,
      offer_id: outcomeLog.offer_id,
      offer_name: outcomeLog.offers?.name || null,
      discount: outcomeLog.discount,
      purchased_at: outcomeLog.purchase_date,
      purchased: true
    }))
    .filter(refund => {
      // Must have refund_date
      if (!refund.refund_date) return false;
      
      // Filter by closer_id if specified
      if (closer && refund.closer_id !== closer) {
        return false;
      }
      
      // Filter by date range (refund_date)
      const checkDate = new Date(refund.refund_date);
      const checkDateOnly = new Date(checkDate.getFullYear(), checkDate.getMonth(), checkDate.getDate());
      const startDateOnly = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
      const endDateOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
      
      if (checkDateOnly < startDateOnly || checkDateOnly > endDateOnly) {
        return false;
      }
      
      // Exclude refunds that happened in same month as purchase (those appear in purchases table)
      if (refund.purchase_date) {
        const purchaseDate = new Date(refund.purchase_date);
        const refundMonth = checkDate.getFullYear() * 12 + checkDate.getMonth();
        const purchaseMonth = purchaseDate.getFullYear() * 12 + purchaseDate.getMonth();
        
        // Exclude if refund and purchase are in the same month
        if (refundMonth === purchaseMonth) {
          return false;
        }
      }
      
      return true;
    });
  
  // Sort by refund_date descending
  refunds.sort((a, b) => {
    const dateA = new Date(a.refund_date);
    const dateB = new Date(b.refund_date);
    return dateB - dateA;
  });

  return refunds;
}

async function fetchRefundsList(closer = null, month = null) {
  if (!month) return [];

  // Parse month (format: YYYY-MM)
  const [year, monthNum] = month.split('-');
  // Create dates at start and end of month in UTC
  const startDate = new Date(Date.UTC(parseInt(year), parseInt(monthNum) - 1, 1, 0, 0, 0, 0));
  const endDate = new Date(Date.UTC(parseInt(year), parseInt(monthNum), 0, 23, 59, 59, 999));
  
  // Format dates for Supabase query
  const startDateISO = startDate.toISOString().split('T')[0] + 'T00:00:00.000Z';
  const endDateISO = endDate.toISOString().split('T')[0] + 'T23:59:59.999Z';
  
  // Query outcome_log for refunds
  let query = supabase
    .from('outcome_log')
    .select(`
      *,
      calls!inner!call_id (
        *,
        closers (id, name),
        setters (id, name),
        leads (id, customer_id)
      ),
      offers!offer_id (
        id,
        name
      )
    `)
    .eq('outcome', 'refund')
    .order('refund_date', { ascending: false, nullsFirst: false });

  // Filter by closer_id if specified
  if (closer) {
    query = query.eq('calls.closer_id', closer);
  }

  const { data: outcomeLogs, error } = await query;

  if (error) {
    console.error('Error fetching refunds list:', error);
    return [];
  }

  // Transform and filter by date range
  let refunds = (outcomeLogs || [])
    .map(outcomeLog => {
      // Check if refund happened in same month as purchase
      const isSameMonthRefund = outcomeLog.purchase_date && 
        outcomeLog.refund_date &&
        (() => {
          const purchaseDate = new Date(outcomeLog.purchase_date);
          const refundDate = new Date(outcomeLog.refund_date);
          const purchaseMonth = purchaseDate.getFullYear() * 12 + purchaseDate.getMonth();
          const refundMonth = refundDate.getFullYear() * 12 + refundDate.getMonth();
          return purchaseMonth === refundMonth;
        })();
      
      // Check if clawback percentage is less than 100
      const clawbackPercentage = outcomeLog.clawback ?? 100;
      const hasClawbackAdjustment = clawbackPercentage < 100;
      
      // For same-month refunds: if clawback < 100%, preserve the adjusted commission (positive)
      // Otherwise, set to 0. For previous-month refunds, use the stored commission (already adjusted)
      let commission = outcomeLog.commission;
      if (isSameMonthRefund && !hasClawbackAdjustment) {
        commission = 0;
      }
      
      return {
        ...outcomeLog.calls,
        outcome_log_id: outcomeLog.id,
        purchase_date: outcomeLog.purchase_date,
        refund_date: outcomeLog.refund_date,
        outcome: outcomeLog.outcome,
        commission: commission,
        offer_id: outcomeLog.offer_id,
        offer_name: outcomeLog.offers?.name || null,
        discount: outcomeLog.discount,
        purchased_at: outcomeLog.purchase_date,
        purchased: true
      };
    })
    .filter(refund => {
      // Must have refund_date or purchase_date
      if (!refund.refund_date && !refund.purchase_date) return false;
      
      // Filter by closer_id if specified
      if (closer && refund.closer_id !== closer) {
        return false;
      }
      
      // Filter by date range (use refund_date if available, otherwise purchase_date)
      const dateToCheck = refund.refund_date || refund.purchase_date;
      const checkDate = new Date(dateToCheck);
      const checkDateOnly = new Date(checkDate.getFullYear(), checkDate.getMonth(), checkDate.getDate());
      const startDateOnly = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
      const endDateOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
      
      return checkDateOnly >= startDateOnly && checkDateOnly <= endDateOnly;
    });
  
  // Sort by refund_date descending (or purchase_date if refund_date is null)
  refunds.sort((a, b) => {
    const dateA = new Date(a.refund_date || a.purchase_date);
    const dateB = new Date(b.refund_date || b.purchase_date);
    return dateB - dateA;
  });

  return refunds;
}

async function fetchSecondInstallmentsList(closer = null, month = null) {
  if (!month) return [];

  // Parse month (format: YYYY-MM)
  const [year, monthNum] = month.split('-');
  // Create dates at start and end of month in UTC
  const startDate = new Date(Date.UTC(parseInt(year), parseInt(monthNum) - 1, 1, 0, 0, 0, 0));
  const endDate = new Date(Date.UTC(parseInt(year), parseInt(monthNum), 0, 23, 59, 59, 999));
  
  // Format dates for Supabase query
  const startDateISO = startDate.toISOString().split('T')[0] + 'T00:00:00.000Z';
  const endDateISO = endDate.toISOString().split('T')[0] + 'T23:59:59.999Z';
  
  // Query outcome_log for second installments
  let query = supabase
    .from('outcome_log')
    .select(`
      *,
      calls!inner!call_id (
        *,
        closers (id, name),
        setters (id, name),
        leads (id, customer_id)
      ),
      offers!offer_id (
        id,
        name
      )
    `)
    .eq('outcome', 'yes')
    .eq('paid_second_installment', true)
    .gte('purchase_date', startDateISO)
    .lte('purchase_date', endDateISO)
    .order('purchase_date', { ascending: false });

  // Filter by closer_id if specified
  if (closer) {
    query = query.eq('calls.closer_id', closer);
  }

  const { data: outcomeLogs, error } = await query;

  if (error) {
    console.error('Error fetching second installments list:', error);
    return [];
  }

  // Transform outcome_log entries
  let secondInstallments = (outcomeLogs || [])
    .map(outcomeLog => ({
      ...outcomeLog.calls,
      outcome_log_id: outcomeLog.id,
      purchase_date: outcomeLog.purchase_date,
      outcome: outcomeLog.outcome,
      commission: outcomeLog.commission,
      offer_id: outcomeLog.offer_id,
      offer_name: outcomeLog.offers?.name || null,
      discount: outcomeLog.discount,
      purchased_at: outcomeLog.purchase_date,
      purchased: true,
      paid_second_installment: outcomeLog.paid_second_installment
    }))
    .filter(item => {
      // Filter by closer_id if specified
      if (closer && item.closer_id !== closer) {
        return false;
      }
      
      // Filter by date range
      if (!item.purchase_date) return false;
      const purchaseDate = new Date(item.purchase_date);
      const purchaseDateOnly = new Date(purchaseDate.getFullYear(), purchaseDate.getMonth(), purchaseDate.getDate());
      const startDateOnly = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
      const endDateOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
      
      return purchaseDateOnly >= startDateOnly && purchaseDateOnly <= endDateOnly;
    });
  
  // Sort by purchase_date descending
  secondInstallments.sort((a, b) => {
    const dateA = new Date(a.purchase_date);
    const dateB = new Date(b.purchase_date);
    return dateB - dateA;
  });

  return secondInstallments;
}

// Purchase Item Component - Simplified for purchase log
function PurchaseItem({ lead, setterMap = {}, isRefundsTable = false }) {
  const navigate = useNavigate();
  const [editModalOpen, setEditModalOpen] = useState(false);

  // Determine grid columns based on table type
  const gridColumns = isRefundsTable 
    ? '2fr 1.2fr 1.2fr 1.2fr 1.5fr 1fr 1fr' // Includes purchase date
    : '2fr 1.2fr 1.2fr 1.5fr 1fr 1fr'; // Standard purchase table

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: gridColumns,
        gap: '16px',
        alignItems: 'center',
        padding: '12px 16px',
        backgroundColor: 'white',
        borderBottom: '1px solid #e5e7eb',
        fontSize: '14px',
        transition: 'background-color 0.2s'
      }}
      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
    >
      {/* Contact Info */}
      <div style={{ overflow: 'hidden', flex: 1 }}>
        <a
          href={`/lead/${lead.lead_id}`} 
          target="_blank"
          onClick={(e) => {
            if (!e.metaKey && !e.ctrlKey) {
              e.preventDefault();
              navigate(`/lead/${lead.lead_id}`);
            }
          }}
          style={{
            fontWeight: '600',
            color: '#111827',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            marginBottom: '4px',
            display: 'block'
          }}
        >
          {lead.name || 'No name'}
          <span title={lead.leads?.customer_id ? 'Has Kajabi ID in leads table' : 'No Kajabi ID in leads table'} style={{ marginLeft: 6 }}>
            {lead.leads?.customer_id ? '✅' : '❌'}
          </span>
        </a>
        <div style={{
          fontSize: '12px',
          color: '#6b7280',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          marginBottom: '2px'
        }}>
          <Mail size={12} />
            <a 
            style={{ color: '#6b7280', textDecoration: 'none' }} 
            href={`https://app.kajabi.com/admin/sites/2147813413/contacts?page=1&search=${encodeURIComponent(lead.email)}`}
            target="_blank" 
            rel="noopener noreferrer"
          >
            {lead.email || 'No email'}
          </a>
        </div>
        <div style={{
          fontSize: '12px',
          color: '#6b7280',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: 'flex',
          alignItems: 'center',
          gap: '4px'
        }}>
          <Phone size={12} />
          <a
            href={`https://app.manychat.com/fb1237190/chat/${lead.manychat_user_id || ''}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#6b7280', textDecoration: 'none' }}
          >
            {lead.phone || 'No phone'}
          </a>
        </div>
      </div>

      {/* Setter */}
      <div
        onClick={() => navigate(`/setter/${lead.setter_id}`)}
        style={{
          color: '#001749ff',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          fontSize: '13px'
        }}
      >
        {setterMap[lead.setter_id] || 'N/A'}
      </div>

      {/* Purchase Date - Show in refunds table */}
      {isRefundsTable && (
        <div style={{ fontSize: '13px', color: '#6b7280' }}>
          {DateHelpers.formatTimeWithRelative(lead.purchase_date) || 'N/A'}
        </div>
      )}

      {/* Purchase Date / Refund Date */}
      <div style={{ fontSize: '13px', color: '#6b7280' }}>
        {isRefundsTable 
          ? (lead.refund_date ? DateHelpers.formatTimeWithRelative(lead.refund_date) : 'N/A')
          : (lead.outcome === 'refund' && lead.refund_date
              ? DateHelpers.formatTimeWithRelative(lead.refund_date)
              : DateHelpers.formatTimeWithRelative(lead.purchase_date) || 'N/A')}
      </div>

      {/* Offer Name */}
      <div style={{ fontSize: '13px', color: '#111827', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '8px' }}>
        {lead.offer_name || 'N/A'}
        {lead.outcome === 'refund' && (
          <span style={{
            backgroundColor: '#ef4444',
            color: 'white',
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '10px',
            fontWeight: '600',
            textTransform: 'uppercase'
          }}>
            REFUND
          </span>
        )}
      </div>

      {/* Commission */}
      <div style={{ fontSize: '13px', color: lead.outcome === 'refund' ? '#ef4444' : '#10b981', fontWeight: '600', textAlign: 'center' }}>
        {lead.commission !== null && lead.commission !== undefined ? `$${lead.commission.toFixed(2)}` : 'N/A'}
      </div>

      {/* Edit Closer Note */}
      <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
        <button
          onClick={() => setEditModalOpen(true)}
          style={{
            padding: '5px 12px',
            backgroundColor: lead.closer_note_id ? '#7053d0ff' : '#3f2f76ff',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
        >
          ✏️
        </button>
      </div>

      <NotesModal 
        isOpen={editModalOpen} 
        onClose={() => setEditModalOpen(false)} 
        lead={lead}
        callId={lead.id}
        mode="closer"
      />
    </div>
  );
}
