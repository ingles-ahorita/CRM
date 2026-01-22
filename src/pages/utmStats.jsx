import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';
import ComparisonTable from './components/ComparisonTable';
import PeriodSelector from './components/PeriodSelector';
import { ViewNotesModal } from './components/Modal';
import { Mail, Phone } from 'lucide-react';
import * as DateHelpers from '../utils/dateHelpers';

// Fetch stats data grouped by UTM parameters
async function fetchUTMStatsData(startDate, endDate) {
  console.log('startDate', startDate);
  console.log('endDate', endDate);
  
  // Fetch calls with UTM fields - assuming they're in calls table or leads table
  const { data: bookedCalls, error: bookedError } = await supabase
    .from('calls')
    .select(`
      picked_up,
      showed_up,
      confirmed,
      purchased,
      purchased_at,
      is_reschedule,
      lead_id,
      phone,
      book_date,
      call_date,
      source_type,
      utm_source,
      utm_medium,
      utm_campaign,
      setters (id, name),
      closers (id, name),
      leads (phone)
    `)
    .gte('call_date', startDate)
    .lte('call_date', endDate);

  if (bookedError) {
    console.error('Error fetching booked calls:', bookedError);
    return null;
  }

  // Fetch bookings made in period (by book_date) for separate tracking
  const { data: bookingsMade, error: bookingsError } = await supabase
    .from('calls')
    .select(`
      book_date,
      source_type,
      utm_source,
      utm_medium,
      utm_campaign,
      is_reschedule,
      lead_id,
      picked_up,
      showed_up,
      confirmed
    `)
    .gte('book_date', startDate)
    .lte('book_date', endDate);

  if (bookingsError) {
    console.error('Error fetching bookings made in period:', bookingsError);
  }

  // Filter bookings made to only include organic calls
  const filteredBookingsMade = (bookingsMade || []).filter(booking => {
    const source = booking.source_type || '';
    const isAds = source.toLowerCase().includes('ad') || source.toLowerCase().includes('ads');
    // Only include organic calls (not ads)
    return !isAds;
  });

  // Fetch purchases from outcome_log
  const purchasedCalls = await fetchPurchasesForDateRange(startDate, endDate);
  
  if (!purchasedCalls) {
    console.error('Error fetching purchased calls');
    return null;
  }

  // Use booked calls for main analysis
  const calls = bookedCalls;

  // Filter out rescheduled leads
  const rescheduledLeadIds = new Set(
    calls.filter(c => c.is_reschedule === true).map(c => c.lead_id)
  );

  const filteredCalls = calls.filter(call => {
    // Filter out rescheduled leads
    const keepReschedule = call.is_reschedule === true || !rescheduledLeadIds.has(call.lead_id);
    // Only include organic calls (exclude ads)
    const source = call.source_type || '';
    const isAds = source.toLowerCase().includes('ad') || source.toLowerCase().includes('ads');
    const isOrganic = !isAds; // Only organic calls
    return keepReschedule && isOrganic;
  });

  // Calculate totals - these will be recalculated from breakdowns to ensure accuracy
  // But keep original for verification
  const _totalBookedRaw = filteredCalls.length;
  const _totalPickedUpRaw = filteredCalls.filter(c => c.picked_up === true).length;
  const _totalShowedUpRaw = filteredCalls.filter(c => c.showed_up === true).length;
  const _totalConfirmedRaw = filteredCalls.filter(c => c.confirmed === true).length;
  const _totalPurchasedRaw = purchasedCalls.length;

  // Helper function to get UTM value from calls table
  const getUTMValue = (call, field) => {
    // UTM fields are in the calls table with utm_ prefix
    const utmField = `utm_${field}`;
    
    // Check if it's directly on the call
    if (call[utmField]) return call[utmField];
    
    return 'Unknown';
  };

  // Helper function to extract granular breakdown key
  const getGranularKey = (call, type) => {
    const source = getUTMValue(call, 'source') || 'Unknown';
    const medium = getUTMValue(call, 'medium') || 'Unknown';
    const campaign = getUTMValue(call, 'campaign') || 'Unknown';
    
    switch (type) {
      case 'source_medium':
        return `${source} + ${medium}`;
      case 'source_campaign':
        return `${source} + ${campaign}`;
      case 'campaign_pattern':
        // Extract patterns from campaign (e.g., "youtube-bio" -> "youtube bio")
        const campaignLower = campaign.toLowerCase();
        if (campaignLower.includes('bio')) {
          return `${source} bio`;
        } else if (campaignLower.includes('link')) {
          return `${source} link`;
        } else if (campaignLower.includes('story')) {
          return `${source} story`;
        } else if (campaignLower.includes('reel')) {
          return `${source} reel`;
        } else if (campaignLower.includes('post')) {
          return `${source} post`;
        } else if (campaignLower.includes('video')) {
          return `${source} video`;
        }
        return `${source} - ${campaign}`;
      default:
        return 'Unknown';
    }
  };

  // Group by UTM Source
  const sourceStats = {};
  
  // Process bookings made in period (by book_date)
  filteredBookingsMade.forEach(booking => {
    const source = getUTMValue(booking, 'source') || 'Unknown';
    
    if (!sourceStats[source]) {
      sourceStats[source] = {
        source: source,
        totalBookedInPeriod: 0,
        totalCallsInPeriod: 0,
        totalPickedUp: 0,
        totalShowedUp: 0,
        totalConfirmed: 0,
        totalPurchased: 0,
        pickUpRate: 0,
        showUpRate: 0,
        conversionRate: 0
      };
    }
    
    sourceStats[source].totalBookedInPeriod++;
    // Track picked up from bookings made in period (for pick up rate calculation)
    if (booking.picked_up) sourceStats[source].totalPickedUp++;
  });
  
  // Process calls that happened in period (by call_date)
  filteredCalls.forEach(call => {
    const source = getUTMValue(call, 'source') || 'Unknown';
    
    if (!sourceStats[source]) {
      sourceStats[source] = {
        source: source,
        totalBookedInPeriod: 0,
        totalCallsInPeriod: 0,
        totalPickedUp: 0,
        totalShowedUp: 0,
        totalConfirmed: 0,
        totalPurchased: 0,
        pickUpRate: 0,
        showUpRate: 0,
        conversionRate: 0
      };
    }
    
    sourceStats[source].totalCallsInPeriod++;
    // Track showed_up and confirmed from calls that happened in period
    if (call.showed_up) sourceStats[source].totalShowedUp++;
    if (call.confirmed) sourceStats[source].totalConfirmed++;
    // Note: totalPickedUp is now tracked from bookings made in period, not from calls in period
  });

  // Process purchased calls for source metrics
  purchasedCalls.forEach(call => {
    const source = getUTMValue(call, 'source') || 'Unknown';
    
    if (!sourceStats[source]) {
      sourceStats[source] = {
        source: source,
        totalBooked: 0,
        totalPickedUp: 0,
        totalShowedUp: 0,
        totalConfirmed: 0,
        totalPurchased: 0,
        pickUpRate: 0,
        showUpRate: 0,
        conversionRate: 0
      };
    }
    
    sourceStats[source].totalPurchased++;
  });

  // Calculate rates for each source (pick up rate uses bookings made in period)
  Object.values(sourceStats).forEach(source => {
    source.pickUpRate = source.totalBookedInPeriod > 0 ? (source.totalPickedUp / source.totalBookedInPeriod) * 100 : 0;
    source.showUpRate = source.totalCallsInPeriod > 0 ? (source.totalShowedUp / source.totalCallsInPeriod) * 100 : 0;
    source.conversionRate = source.totalShowedUp > 0 ? (source.totalPurchased / source.totalShowedUp) * 100 : 0;
  });

  // Group by UTM Medium
  const mediumStats = {};
  
  // Process bookings made in period (by book_date)
  filteredBookingsMade.forEach(booking => {
    const medium = getUTMValue(booking, 'medium') || 'Unknown';
    
    if (!mediumStats[medium]) {
      mediumStats[medium] = {
        medium: medium,
        totalBookedInPeriod: 0,
        totalCallsInPeriod: 0,
        totalPickedUp: 0,
        totalShowedUp: 0,
        totalConfirmed: 0,
        totalPurchased: 0,
        pickUpRate: 0,
        showUpRate: 0,
        conversionRate: 0
      };
    }
    
    mediumStats[medium].totalBookedInPeriod++;
    // Track picked up from bookings made in period (for pick up rate calculation)
    if (booking.picked_up) mediumStats[medium].totalPickedUp++;
  });
  
  // Process calls that happened in period (by call_date)
  filteredCalls.forEach(call => {
    const medium = getUTMValue(call, 'medium') || 'Unknown';
    
    if (!mediumStats[medium]) {
      mediumStats[medium] = {
        medium: medium,
        totalBookedInPeriod: 0,
        totalCallsInPeriod: 0,
        totalPickedUp: 0,
        totalShowedUp: 0,
        totalConfirmed: 0,
        totalPurchased: 0,
        pickUpRate: 0,
        showUpRate: 0,
        conversionRate: 0
      };
    }
    
    mediumStats[medium].totalCallsInPeriod++;
    // Track showed_up and confirmed from calls that happened in period
    if (call.showed_up) mediumStats[medium].totalShowedUp++;
    if (call.confirmed) mediumStats[medium].totalConfirmed++;
    // Note: totalPickedUp is now tracked from bookings made in period, not from calls in period
  });

  // Process purchased calls for medium metrics
  purchasedCalls.forEach(call => {
    const medium = getUTMValue(call, 'medium') || 'Unknown';
    
    if (!mediumStats[medium]) {
      mediumStats[medium] = {
        medium: medium,
        totalBooked: 0,
        totalPickedUp: 0,
        totalShowedUp: 0,
        totalConfirmed: 0,
        totalPurchased: 0,
        pickUpRate: 0,
        showUpRate: 0,
        conversionRate: 0
      };
    }
    
    mediumStats[medium].totalPurchased++;
  });

  // Calculate rates for each medium (pick up rate uses bookings made in period)
  Object.values(mediumStats).forEach(medium => {
    medium.pickUpRate = medium.totalBookedInPeriod > 0 ? (medium.totalPickedUp / medium.totalBookedInPeriod) * 100 : 0;
    medium.showUpRate = medium.totalCallsInPeriod > 0 ? (medium.totalShowedUp / medium.totalCallsInPeriod) * 100 : 0;
    medium.conversionRate = medium.totalShowedUp > 0 ? (medium.totalPurchased / medium.totalShowedUp) * 100 : 0;
  });

  // Group by UTM Campaign
  const campaignStats = {};
  
  // Process bookings made in period (by book_date)
  filteredBookingsMade.forEach(booking => {
    const campaign = getUTMValue(booking, 'campaign') || 'Unknown';
    
    if (!campaignStats[campaign]) {
      campaignStats[campaign] = {
        campaign: campaign,
        totalBookedInPeriod: 0,
        totalCallsInPeriod: 0,
        totalPickedUp: 0,
        totalShowedUp: 0,
        totalConfirmed: 0,
        totalPurchased: 0,
        pickUpRate: 0,
        showUpRate: 0,
        conversionRate: 0
      };
    }
    
    campaignStats[campaign].totalBookedInPeriod++;
    // Track picked up from bookings made in period (for pick up rate calculation)
    if (booking.picked_up) campaignStats[campaign].totalPickedUp++;
  });
  
  // Process calls that happened in period (by call_date)
  filteredCalls.forEach(call => {
    const campaign = getUTMValue(call, 'campaign') || 'Unknown';
    
    if (!campaignStats[campaign]) {
      campaignStats[campaign] = {
        campaign: campaign,
        totalBookedInPeriod: 0,
        totalCallsInPeriod: 0,
        totalPickedUp: 0,
        totalShowedUp: 0,
        totalConfirmed: 0,
        totalPurchased: 0,
        pickUpRate: 0,
        showUpRate: 0,
        conversionRate: 0
      };
    }
    
    campaignStats[campaign].totalCallsInPeriod++;
    // Track showed_up and confirmed from calls that happened in period
    if (call.showed_up) campaignStats[campaign].totalShowedUp++;
    if (call.confirmed) campaignStats[campaign].totalConfirmed++;
    // Note: totalPickedUp is now tracked from bookings made in period, not from calls in period
  });

  // Process purchased calls for campaign metrics
  purchasedCalls.forEach(call => {
    const campaign = getUTMValue(call, 'campaign') || 'Unknown';
    
    if (!campaignStats[campaign]) {
      campaignStats[campaign] = {
        campaign: campaign,
        totalBooked: 0,
        totalPickedUp: 0,
        totalShowedUp: 0,
        totalConfirmed: 0,
        totalPurchased: 0,
        pickUpRate: 0,
        showUpRate: 0,
        conversionRate: 0
      };
    }
    
    campaignStats[campaign].totalPurchased++;
  });

  // Calculate rates for each campaign (pick up rate uses bookings made in period)
  Object.values(campaignStats).forEach(campaign => {
    campaign.pickUpRate = campaign.totalBookedInPeriod > 0 ? (campaign.totalPickedUp / campaign.totalBookedInPeriod) * 100 : 0;
    campaign.showUpRate = campaign.totalCallsInPeriod > 0 ? (campaign.totalShowedUp / campaign.totalCallsInPeriod) * 100 : 0;
    campaign.conversionRate = campaign.totalShowedUp > 0 ? (campaign.totalPurchased / campaign.totalShowedUp) * 100 : 0;
  });

  // Group by Source + Medium combination
  const sourceMediumStats = {};
  
  filteredBookingsMade.forEach(booking => {
    const key = getGranularKey(booking, 'source_medium');
    if (!sourceMediumStats[key]) {
      sourceMediumStats[key] = {
        key: key,
        totalBookedInPeriod: 0,
        totalCallsInPeriod: 0,
        totalPickedUp: 0,
        totalShowedUp: 0,
        totalConfirmed: 0,
        totalPurchased: 0,
        pickUpRate: 0,
        showUpRate: 0,
        conversionRate: 0
      };
    }
    sourceMediumStats[key].totalBookedInPeriod++;
    if (booking.picked_up) sourceMediumStats[key].totalPickedUp++;
  });
  
  filteredCalls.forEach(call => {
    const key = getGranularKey(call, 'source_medium');
    if (!sourceMediumStats[key]) {
      sourceMediumStats[key] = {
        key: key,
        totalBookedInPeriod: 0,
        totalCallsInPeriod: 0,
        totalPickedUp: 0,
        totalShowedUp: 0,
        totalConfirmed: 0,
        totalPurchased: 0,
        pickUpRate: 0,
        showUpRate: 0,
        conversionRate: 0
      };
    }
    sourceMediumStats[key].totalCallsInPeriod++;
    if (call.showed_up) sourceMediumStats[key].totalShowedUp++;
    if (call.confirmed) sourceMediumStats[key].totalConfirmed++;
  });
  
  purchasedCalls.forEach(call => {
    const key = getGranularKey(call, 'source_medium');
    if (!sourceMediumStats[key]) {
      sourceMediumStats[key] = {
        key: key,
        totalBookedInPeriod: 0,
        totalCallsInPeriod: 0,
        totalPickedUp: 0,
        totalShowedUp: 0,
        totalConfirmed: 0,
        totalPurchased: 0,
        pickUpRate: 0,
        showUpRate: 0,
        conversionRate: 0
      };
    }
    sourceMediumStats[key].totalPurchased++;
  });
  
  Object.values(sourceMediumStats).forEach(item => {
    item.pickUpRate = item.totalBookedInPeriod > 0 ? (item.totalPickedUp / item.totalBookedInPeriod) * 100 : 0;
    item.showUpRate = item.totalCallsInPeriod > 0 ? (item.totalShowedUp / item.totalCallsInPeriod) * 100 : 0;
    item.conversionRate = item.totalShowedUp > 0 ? (item.totalPurchased / item.totalShowedUp) * 100 : 0;
  });

  // Group by Source + Campaign combination
  const sourceCampaignStats = {};
  
  filteredBookingsMade.forEach(booking => {
    const key = getGranularKey(booking, 'source_campaign');
    if (!sourceCampaignStats[key]) {
      sourceCampaignStats[key] = {
        key: key,
        totalBookedInPeriod: 0,
        totalCallsInPeriod: 0,
        totalPickedUp: 0,
        totalShowedUp: 0,
        totalConfirmed: 0,
        totalPurchased: 0,
        pickUpRate: 0,
        showUpRate: 0,
        conversionRate: 0
      };
    }
    sourceCampaignStats[key].totalBookedInPeriod++;
    if (booking.picked_up) sourceCampaignStats[key].totalPickedUp++;
  });
  
  filteredCalls.forEach(call => {
    const key = getGranularKey(call, 'source_campaign');
    if (!sourceCampaignStats[key]) {
      sourceCampaignStats[key] = {
        key: key,
        totalBookedInPeriod: 0,
        totalCallsInPeriod: 0,
        totalPickedUp: 0,
        totalShowedUp: 0,
        totalConfirmed: 0,
        totalPurchased: 0,
        pickUpRate: 0,
        showUpRate: 0,
        conversionRate: 0
      };
    }
    sourceCampaignStats[key].totalCallsInPeriod++;
    if (call.showed_up) sourceCampaignStats[key].totalShowedUp++;
    if (call.confirmed) sourceCampaignStats[key].totalConfirmed++;
  });
  
  purchasedCalls.forEach(call => {
    const key = getGranularKey(call, 'source_campaign');
    if (!sourceCampaignStats[key]) {
      sourceCampaignStats[key] = {
        key: key,
        totalBookedInPeriod: 0,
        totalCallsInPeriod: 0,
        totalPickedUp: 0,
        totalShowedUp: 0,
        totalConfirmed: 0,
        totalPurchased: 0,
        pickUpRate: 0,
        showUpRate: 0,
        conversionRate: 0
      };
    }
    sourceCampaignStats[key].totalPurchased++;
  });
  
  Object.values(sourceCampaignStats).forEach(item => {
    item.pickUpRate = item.totalBookedInPeriod > 0 ? (item.totalPickedUp / item.totalBookedInPeriod) * 100 : 0;
    item.showUpRate = item.totalCallsInPeriod > 0 ? (item.totalShowedUp / item.totalCallsInPeriod) * 100 : 0;
    item.conversionRate = item.totalShowedUp > 0 ? (item.totalPurchased / item.totalShowedUp) * 100 : 0;
  });

  // Group by Campaign Pattern (e.g., youtube bio, tiktok bio)
  const campaignPatternStats = {};
  
  filteredBookingsMade.forEach(booking => {
    const key = getGranularKey(booking, 'campaign_pattern');
    if (!campaignPatternStats[key]) {
      campaignPatternStats[key] = {
        key: key,
        totalBookedInPeriod: 0,
        totalCallsInPeriod: 0,
        totalPickedUp: 0,
        totalShowedUp: 0,
        totalConfirmed: 0,
        totalPurchased: 0,
        pickUpRate: 0,
        showUpRate: 0,
        conversionRate: 0
      };
    }
    campaignPatternStats[key].totalBookedInPeriod++;
    if (booking.picked_up) campaignPatternStats[key].totalPickedUp++;
  });
  
  filteredCalls.forEach(call => {
    const key = getGranularKey(call, 'campaign_pattern');
    if (!campaignPatternStats[key]) {
      campaignPatternStats[key] = {
        key: key,
        totalBookedInPeriod: 0,
        totalCallsInPeriod: 0,
        totalPickedUp: 0,
        totalShowedUp: 0,
        totalConfirmed: 0,
        totalPurchased: 0,
        pickUpRate: 0,
        showUpRate: 0,
        conversionRate: 0
      };
    }
    campaignPatternStats[key].totalCallsInPeriod++;
    if (call.showed_up) campaignPatternStats[key].totalShowedUp++;
    if (call.confirmed) campaignPatternStats[key].totalConfirmed++;
  });
  
  purchasedCalls.forEach(call => {
    const key = getGranularKey(call, 'campaign_pattern');
    if (!campaignPatternStats[key]) {
      campaignPatternStats[key] = {
        key: key,
        totalBookedInPeriod: 0,
        totalCallsInPeriod: 0,
        totalPickedUp: 0,
        totalShowedUp: 0,
        totalConfirmed: 0,
        totalPurchased: 0,
        pickUpRate: 0,
        showUpRate: 0,
        conversionRate: 0
      };
    }
    campaignPatternStats[key].totalPurchased++;
  });
  
  Object.values(campaignPatternStats).forEach(item => {
    item.pickUpRate = item.totalBookedInPeriod > 0 ? (item.totalPickedUp / item.totalBookedInPeriod) * 100 : 0;
    item.showUpRate = item.totalCallsInPeriod > 0 ? (item.totalShowedUp / item.totalCallsInPeriod) * 100 : 0;
    item.conversionRate = item.totalShowedUp > 0 ? (item.totalPurchased / item.totalShowedUp) * 100 : 0;
  });

  // Sort by total purchased
  const sortedSources = Object.values(sourceStats).sort((a, b) => b.totalPurchased - a.totalPurchased);
  const sortedMediums = Object.values(mediumStats).sort((a, b) => b.totalPurchased - a.totalPurchased);
  const sortedCampaigns = Object.values(campaignStats).sort((a, b) => b.totalPurchased - a.totalPurchased);
  const sortedSourceMediums = Object.values(sourceMediumStats).sort((a, b) => b.totalPurchased - a.totalPurchased);
  const sortedSourceCampaigns = Object.values(sourceCampaignStats).sort((a, b) => b.totalPurchased - a.totalPurchased);
  const sortedCampaignPatterns = Object.values(campaignPatternStats).sort((a, b) => b.totalPurchased - a.totalPurchased);

  // Calculate totals from breakdown to ensure they match
  // Sum up calls from breakdown tables to get accurate totals
  const totalCallsFromBreakdown = sortedSources.reduce((sum, s) => sum + s.totalCallsInPeriod, 0);
  const totalBookedFromBreakdown = sortedSources.reduce((sum, s) => sum + s.totalBookedInPeriod, 0);
  const totalPickedUpFromBreakdown = sortedSources.reduce((sum, s) => sum + s.totalPickedUp, 0);
  const totalShowedUpFromBreakdown = sortedSources.reduce((sum, s) => sum + s.totalShowedUp, 0);
  const totalConfirmedFromBreakdown = sortedSources.reduce((sum, s) => sum + s.totalConfirmed, 0);
  const totalPurchasedFromBreakdown = sortedSources.reduce((sum, s) => sum + s.totalPurchased, 0);
  
  // Use breakdown totals to ensure consistency
  const totalCalls = totalCallsFromBreakdown;
  const totalBooked = totalBookedFromBreakdown;
  const totalPickedUp = totalPickedUpFromBreakdown;
  const totalShowedUp = totalShowedUpFromBreakdown;
  const totalConfirmed = totalConfirmedFromBreakdown;
  const totalPurchased = totalPurchasedFromBreakdown;
  
  // Verify totals match breakdown - sum up calls from breakdown tables
  const totalCallsFromSourceBreakdown = sortedSources.reduce((sum, s) => sum + s.totalCallsInPeriod, 0);
  const totalCallsFromMediumBreakdown = sortedMediums.reduce((sum, m) => sum + m.totalCallsInPeriod, 0);
  const totalCallsFromCampaignBreakdown = sortedCampaigns.reduce((sum, c) => sum + c.totalCallsInPeriod, 0);
  
  // Debug: Log all unique campaign values found in calls
  const allCampaignValues = new Set();
  filteredCalls.forEach(call => {
    const campaign = call.utm_campaign;
    if (campaign) allCampaignValues.add(campaign);
  });
  purchasedCalls.forEach(call => {
    const campaign = call.utm_campaign;
    if (campaign) allCampaignValues.add(campaign);
  });
  
  console.log('Campaign stats:', {
    totalCampaigns: sortedCampaigns.length,
    campaigns: sortedCampaigns.map(c => ({ name: c.campaign, bookedInPeriod: c.totalBookedInPeriod, callsInPeriod: c.totalCallsInPeriod, purchased: c.totalPurchased })),
    allUniqueCampaignValues: Array.from(allCampaignValues),
    totalCallsRaw: _totalBookedRaw,
    totalCallsFromBreakdown,
    totalCallsFromSourceBreakdown,
    totalCallsFromMediumBreakdown,
    totalCallsFromCampaignBreakdown,
    totalBookingsMade: filteredBookingsMade.length,
    totalPurchasedCalls: purchasedCalls.length,
    discrepancy: _totalBookedRaw - totalCallsFromSourceBreakdown
  });

  return {
    totalBooked, // Bookings made in period (from breakdown)
    totalCalls, // Calls that happened in period (from breakdown)
    totalPickedUp,
    totalShowedUp,
    totalConfirmed,
    totalPurchased,
    totalRescheduled: filteredCalls.filter(c => c.is_reschedule).length,
    sources: sortedSources,
    mediums: sortedMediums,
    campaigns: sortedCampaigns,
    sourceMediums: sortedSourceMediums,
    sourceCampaigns: sortedSourceCampaigns,
    campaignPatterns: sortedCampaignPatterns
  };
}

// Fetch purchases for date range
async function fetchPurchasesForDateRange(startDate, endDate) {
  const startDateObj = new Date(startDate);
  const endDateObj = new Date(endDate);
  endDateObj.setHours(23, 59, 59, 999);

  let query = supabase
    .from('outcome_log')
    .select(`
      *,
      calls!inner!closer_notes_call_id_fkey (
        *,
        utm_source,
        utm_medium,
        utm_campaign,
        closers (id, name),
        setters (id, name),
        leads (phone)
      ),
      offers!offer_id (
        id,
        name
      )
    `)
    .eq('outcome', 'yes')
    .gte('purchase_date', startDateObj.toISOString())
    .lte('purchase_date', endDateObj.toISOString())
    .order('purchase_date', { ascending: false });

  const { data: outcomeLogs, error } = await query;

  if (error) {
    console.error('Error fetching purchases:', error);
    return [];
  }

  // Transform outcome_log entries to match the expected lead format
  const purchases = (outcomeLogs || [])
    .filter(outcomeLog => outcomeLog.calls && outcomeLog.calls.id)
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
      purchased: true
    }))
    // Only include organic calls (exclude ads)
    .filter(call => {
      const source = call.source_type || '';
      const isAds = source.toLowerCase().includes('ad') || source.toLowerCase().includes('ads');
      const isOrganic = !isAds; // Only organic calls
      return isOrganic;
    });

  return purchases;
}

// Fetch weekly stats for comparison
async function fetchWeeklyUTMStats() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  
  const weekRanges = [];
  for (let weekOffset = 0; weekOffset < 12; weekOffset++) {
    const weekEnd = new Date(now);
    weekEnd.setDate(now.getDate() - (weekOffset * 7));
    
    const weekStart = new Date(weekEnd);
    const weekDayOfWeek = weekEnd.getDay();
    const weekDiff = weekDayOfWeek === 0 ? -6 : 1 - weekDayOfWeek;
    weekStart.setDate(weekEnd.getDate() + weekDiff);
    weekStart.setHours(0, 0, 0, 0);
    
    const weekEndAdjusted = new Date(weekStart);
    weekEndAdjusted.setDate(weekStart.getDate() + 6);
    weekEndAdjusted.setHours(23, 59, 59, 999);
    
    const startDateStr = weekStart.toISOString();
    const endDateStr = weekEndAdjusted.toISOString();
    
    weekRanges.push({ startDateStr, endDateStr });
  }
  
  const weekPromises = weekRanges.map(({ startDateStr, endDateStr }) => 
    fetchUTMStatsData(startDateStr, endDateStr)
  );
  
  const weekResults = await Promise.all(weekPromises);
  
  const weeksData = [];
  for (let i = 0; i < weekResults.length; i++) {
    const weekStats = weekResults[i];
    const { startDateStr, endDateStr } = weekRanges[i];
    
    if (weekStats) {
      const pickUpRate = weekStats.totalBooked > 0 ? (weekStats.totalPickedUp / weekStats.totalBooked) * 100 : 0;
      const showUpRateConfirmed = weekStats.totalConfirmed > 0 ? (weekStats.totalShowedUp / weekStats.totalConfirmed) * 100 : 0;
      const showUpRateBooked = weekStats.totalBooked > 0 ? (weekStats.totalShowedUp / weekStats.totalBooked) * 100 : 0;
      const conversionRateShowedUp = weekStats.totalShowedUp > 0 ? (weekStats.totalPurchased / weekStats.totalShowedUp) * 100 : 0;
      const conversionRateBooked = weekStats.totalBooked > 0 ? (weekStats.totalPurchased / weekStats.totalBooked) * 100 : 0;
      
      weeksData.unshift({
        weekStart: startDateStr,
        weekEnd: endDateStr,
        weekLabel: `${startDateStr} to ${endDateStr}`,
        ...weekStats,
        pickUpRate,
        showUpRateConfirmed,
        showUpRateBooked,
        conversionRateShowedUp,
        conversionRateBooked
      });
    }
  }
  
  return weeksData.reverse();
}

// Fetch monthly stats for comparison
async function fetchMonthlyUTMStats() {
  const now = new Date();
  
  const monthRanges = [];
  for (let monthOffset = 0; monthOffset < 4; monthOffset++) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1, 0, 0, 0, 0);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - monthOffset + 1, 0, 23, 59, 59, 999);
    
    const startDateStr = monthStart.toISOString();
    const endDateStr = monthEnd.toISOString();
    const monthLabel = monthStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    
    monthRanges.push({ startDateStr, endDateStr, monthLabel });
  }
  
  const monthPromises = monthRanges.map(({ startDateStr, endDateStr }) => 
    fetchUTMStatsData(startDateStr, endDateStr)
  );
  
  const monthResults = await Promise.all(monthPromises);
  
  const monthsData = monthResults.map((monthStats, i) => {
    const { startDateStr, endDateStr, monthLabel } = monthRanges[i];
    
    if (!monthStats) return null;
    
    const pickUpRate = monthStats.totalBooked > 0 
      ? (monthStats.totalPickedUp / monthStats.totalBooked) * 100 
      : 0;
    const showUpRateConfirmed = monthStats.totalConfirmed > 0 
      ? (monthStats.totalShowedUp / monthStats.totalConfirmed) * 100 
      : 0;
    const showUpRateBooked = monthStats.totalBooked > 0 
      ? (monthStats.totalShowedUp / monthStats.totalBooked) * 100 
      : 0;
    const conversionRateShowedUp = monthStats.totalShowedUp > 0 
      ? (monthStats.totalPurchased / monthStats.totalShowedUp) * 100 
      : 0;
    const conversionRateBooked = monthStats.totalBooked > 0 
      ? (monthStats.totalPurchased / monthStats.totalBooked) * 100 
      : 0;
    
    return {
      monthStart: startDateStr,
      monthEnd: endDateStr,
      periodLabel: monthLabel,
      ...monthStats,
      pickUpRate,
      showUpRateConfirmed,
      showUpRateBooked,
      conversionRateShowedUp,
      conversionRateBooked
    };
  }).filter(Boolean).reverse();
  
  return monthsData.reverse();
}

// Fetch daily stats for comparison
async function fetchDailyUTMStats(numDays = 30) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  
  const dayRanges = [];
  for (let dayOffset = 0; dayOffset < numDays; dayOffset++) {
    const dayEnd = new Date(now);
    dayEnd.setDate(now.getDate() - dayOffset);
    dayEnd.setHours(23, 59, 59, 999);
    
    const dayStart = new Date(dayEnd);
    dayStart.setHours(0, 0, 0, 0);
    
    const startDateStr = `${dayStart.getFullYear()}-${String(dayStart.getMonth() + 1).padStart(2, '0')}-${String(dayStart.getDate()).padStart(2, '0')}T00:00:00`;
    const endDateStr = `${dayEnd.getFullYear()}-${String(dayEnd.getMonth() + 1).padStart(2, '0')}-${String(dayEnd.getDate()).padStart(2, '0')}T23:59:59.999`;
    const dayLabel = dayStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' });
    
    dayRanges.push({ startDateStr, endDateStr, dayLabel });
  }
  
  const dayPromises = dayRanges.map(({ startDateStr, endDateStr }) => 
    fetchUTMStatsData(startDateStr, endDateStr)
  );
  
  const dayResults = await Promise.all(dayPromises);
  
  const daysData = [];
  for (let i = 0; i < dayResults.length; i++) {
    const dayStats = dayResults[i];
    const { startDateStr, endDateStr, dayLabel } = dayRanges[i];
    
    if (dayStats) {
      const pickUpRate = dayStats.totalBooked > 0 ? (dayStats.totalPickedUp / dayStats.totalBooked) * 100 : 0;
      const showUpRateConfirmed = dayStats.totalConfirmed > 0 ? (dayStats.totalShowedUp / dayStats.totalConfirmed) * 100 : 0;
      const showUpRateBooked = dayStats.totalBooked > 0 ? (dayStats.totalShowedUp / dayStats.totalBooked) * 100 : 0;
      const conversionRateShowedUp = dayStats.totalShowedUp > 0 ? (dayStats.totalPurchased / dayStats.totalShowedUp) * 100 : 0;
      const conversionRateBooked = dayStats.totalBooked > 0 ? (dayStats.totalPurchased / dayStats.totalBooked) * 100 : 0;
      
      daysData.unshift({
        dayStart: startDateStr,
        dayEnd: endDateStr,
        periodLabel: dayLabel,
        ...dayStats,
        pickUpRate,
        showUpRateConfirmed,
        showUpRateBooked,
        conversionRateShowedUp,
        conversionRateBooked
      });
    }
  }
  
  return daysData.reverse();
}

export default function UTMStatsDashboard() {
  const formatDateLocal = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
  };

  const getStartOfWeek = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(today);
    monday.setDate(today.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    return formatDateLocal(monday);
  };

  const navigate = useNavigate();
  const [startDate, setStartDate] = useState(getStartOfWeek);
  
  const getTodayLocal = () => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const hours = String(today.getHours()).padStart(2, '0');
    const minutes = String(today.getMinutes()).padStart(2, '0');
    const seconds = String(today.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
  };
  
  const [endDate, setEndDate] = useState(getTodayLocal());
  const [comparisonView, setComparisonView] = useState('none');
  const [selectedDays, setSelectedDays] = useState(30);
  const [weeklyStats, setWeeklyStats] = useState([]);
  const [monthlyStats, setMonthlyStats] = useState([]);
  const [dailyStats, setDailyStats] = useState([]);
  const [loadingWeekly, setLoadingWeekly] = useState(false);
  const [loadingMonthly, setLoadingMonthly] = useState(false);
  const [loadingDaily, setLoadingDaily] = useState(false);
  const [utmFilter, setUtmFilter] = useState('all'); // 'all', 'source', 'medium', 'campaign', 'source_medium', 'source_campaign', 'campaign_pattern'

  const goToPreviousWeek = () => {
    const currentStart = new Date(startDate);
    const dayOfWeek = currentStart.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    currentStart.setDate(currentStart.getDate() + diff);
    currentStart.setDate(currentStart.getDate() - 7);
    
    const newEnd = new Date(currentStart);
    newEnd.setDate(currentStart.getDate() + 6);
    newEnd.setHours(23, 59, 59, 999);
    
    setStartDate(formatDateLocal(currentStart));
    setEndDate(formatDateLocal(newEnd));
  };

  const goToNextWeek = () => {
    const currentStart = new Date(startDate);
    const dayOfWeek = currentStart.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    currentStart.setDate(currentStart.getDate() + diff);
    currentStart.setDate(currentStart.getDate() + 7);
    
    const newEnd = new Date(currentStart);
    newEnd.setDate(currentStart.getDate() + 6);
    newEnd.setHours(23, 59, 59, 999);
    
    setStartDate(formatDateLocal(currentStart));
    setEndDate(formatDateLocal(newEnd));
  };

  const goToCurrentWeek = () => {
    setStartDate(getStartOfWeek());
    setEndDate(getTodayLocal());
  };

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, [startDate, endDate]);

  const loadStats = async () => {
    setLoading(true);
    const data = await fetchUTMStatsData(startDate, endDate);
    setStats(data);
    setLoading(false);
  };

  const loadWeeklyStats = async () => {
    setLoadingWeekly(true);
    const data = await fetchWeeklyUTMStats();
    setWeeklyStats(data);
    setLoadingWeekly(false);
  };

  const loadMonthlyStats = async () => {
    setLoadingMonthly(true);
    const data = await fetchMonthlyUTMStats();
    setMonthlyStats(data);
    setLoadingMonthly(false);
  };

  const loadDailyStats = async () => {
    setLoadingDaily(true);
    const data = await fetchDailyUTMStats(selectedDays);
    setDailyStats(data);
    setLoadingDaily(false);
  };

  const loadComparisonStats = async () => {
    switch (comparisonView) {
      case 'weekly':
        await loadWeeklyStats();
        break;
      case 'monthly':
        await loadMonthlyStats();
        break;
      case 'daily':
        await loadDailyStats();
        break;
      default:
        break;
    }
  };

  useEffect(() => {
    if (comparisonView !== 'none') {
      loadComparisonStats();
    }
  }, [comparisonView, selectedDays]);

  if (loading && comparisonView === 'none') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading UTM stats...</div>
      </div>
    );
  }

  // Calculate metrics
  let pickUpRate = 0, showUpRateConfirmed = 0, showUpRateBooked = 0, conversionRateShowedUp = 0, conversionRateBooked = 0;
  let totalBooked, totalCalls, totalPickedUp, totalShowedUp, totalConfirmed, totalPurchased, totalRescheduled;
  
  if (stats && comparisonView === 'none') {
    totalCalls = stats.totalCalls || 0;
    pickUpRate = totalCalls > 0 ? (stats.totalPickedUp / totalCalls) * 100 : 0;
    showUpRateConfirmed = stats.totalConfirmed > 0 ? (stats.totalShowedUp / stats.totalConfirmed) * 100 : 0;
    showUpRateBooked = totalCalls > 0 ? (stats.totalShowedUp / totalCalls) * 100 : 0;
    conversionRateShowedUp = stats.totalShowedUp > 0 ? (stats.totalPurchased / stats.totalShowedUp) * 100 : 0;
    conversionRateBooked = totalCalls > 0 ? (stats.totalPurchased / totalCalls) * 100 : 0;
    totalBooked = stats.totalBooked; // Bookings made in period
    totalPickedUp = stats.totalPickedUp;
    totalShowedUp = stats.totalShowedUp;
    totalConfirmed = stats.totalConfirmed;
    totalPurchased = stats.totalPurchased;
    totalRescheduled = stats.totalRescheduled;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <button onClick={() => navigate(-1)} style={{ backgroundColor: '#727272ff', marginBottom: 12, color: 'white', padding: '5px 7px' }}>← Back</button>
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <div className="flex justify-between items-center mb-4">
              <h1 className="text-3xl font-bold text-gray-900">Organic Performance Dashboard</h1>
              <div className="flex gap-2 items-center">
                <PeriodSelector 
                  value={comparisonView} 
                  onChange={setComparisonView}
                />
                {comparisonView === 'daily' && (
                  <select
                    value={selectedDays}
                    onChange={(e) => setSelectedDays(Number(e.target.value))}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-700 font-medium"
                  >
                    <option value={7}>7 days</option>
                    <option value={14}>14 days</option>
                    <option value={30}>30 days</option>
                    <option value={60}>60 days</option>
                    <option value={90}>90 days</option>
                  </select>
                )}
              </div>
            </div>

            {/* UTM Filter */}
            {comparisonView === 'none' && (
              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  onClick={() => setUtmFilter('all')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    utmFilter === 'all'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  All UTM
                </button>
                <button
                  onClick={() => setUtmFilter('source')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    utmFilter === 'source'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  By Source
                </button>
                <button
                  onClick={() => setUtmFilter('medium')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    utmFilter === 'medium'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  By Medium
                </button>
                <button
                  onClick={() => setUtmFilter('campaign')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    utmFilter === 'campaign'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  By Campaign
                </button>
                <button
                  onClick={() => setUtmFilter('source_medium')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    utmFilter === 'source_medium'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Source + Medium
                </button>
                <button
                  onClick={() => setUtmFilter('source_campaign')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    utmFilter === 'source_campaign'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Source + Campaign
                </button>
                <button
                  onClick={() => setUtmFilter('campaign_pattern')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    utmFilter === 'campaign_pattern'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Campaign Patterns
                </button>
              </div>
            )}
            
            {/* Navigation Buttons */}
            {comparisonView === 'none' && (
              <div className="flex gap-2" style={{marginBottom: '2vh'}}>
                <button
                  onClick={goToPreviousWeek}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                >
                  ← Previous Week
                </button>
                <button
                  onClick={goToCurrentWeek}
                  className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors font-medium"
                >
                  This Week
                </button>
                <button
                  onClick={goToNextWeek}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                >
                  Next Week →
                </button>
              </div>
            )}
          
            {/* Date Range Filters */}
            {comparisonView === 'none' && (
              <div className="bg-white p-6 rounded-lg shadow mb-6">
                <div className="flex gap-6 items-end">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Start Date: 
                    </label>
                    <input
                      type="date"
                      value={startDate.split('T')[0]}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      End Date:
                    </label>
                    <input
                      type="date"
                      value={endDate.split('T')[0]}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <button
                    onClick={loadStats}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                  >
                    Refresh
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Comparison Views */}
          {comparisonView === 'weekly' && (
            <ComparisonTable
              data={weeklyStats}
              title="Weekly Comparison (Last 12 Weeks)"
              description="Track UTM performance trends over time"
              periodLabel="Week"
              loading={loadingWeekly}
            />
          )}

          {comparisonView === 'monthly' && (
            <ComparisonTable
              data={monthlyStats}
              title="Monthly Comparison (Last 4 Months)"
              description="Track monthly UTM performance trends"
              periodLabel="Month"
              loading={loadingMonthly}
            />
          )}

          {comparisonView === 'daily' && (
            <ComparisonTable
              data={dailyStats}
              title={`Daily Comparison (Last ${selectedDays} Days)`}
              description="Track daily UTM performance trends"
              periodLabel="Day"
              loading={loadingDaily}
            />
          )}

          {/* Overall Metrics Grid */}
          {comparisonView === 'none' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                {/* Pick Up Rate */}
                <div className="bg-white p-6 rounded-lg shadow">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-gray-500">Pick Up Rate</h3>
                    <span className="text-xs text-gray-400">Picked Up / Booked</span>
                  </div>
                  <div className="text-3xl font-bold text-blue-600">
                    {pickUpRate.toFixed(1)}%
                  </div>
                  <div className="text-sm text-gray-500 mt-2">
                    {totalPickedUp} / {totalBooked} calls
                  </div>
                </div>

                {/* Show Up Rate / Confirmed */}
                <div className="bg-white p-6 rounded-lg shadow">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-gray-500">Show Up Rate</h3>
                    <span className="text-xs text-gray-400">Showed Up / Confirmed</span>
                  </div>
                  <div className="text-3xl font-bold text-green-600">
                    {showUpRateConfirmed.toFixed(1)}%
                  </div>
                  <div className="text-sm text-gray-500 mt-2">
                    {totalShowedUp} / {totalConfirmed} confirmed
                  </div>
                </div>

                {/* Show Up Rate / Booked */}
                <div className="bg-white p-6 rounded-lg shadow">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-gray-500">Show Up Rate</h3>
                    <span className="text-xs text-gray-400">Showed Up / Booked</span>
                  </div>
                  <div className="text-3xl font-bold text-green-600">
                    {showUpRateBooked.toFixed(1)}%
                  </div>
                  <div className="text-sm text-gray-500 mt-2">
                    {totalShowedUp} / {totalCalls} calls
                  </div>
                </div>

                {/* Conversion Rate / Show up */}
                <div className="bg-white p-6 rounded-lg shadow">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-gray-500">Conversion Rate</h3>
                    <span className="text-xs text-gray-400">Purchased / Show up</span>
                  </div>
                  <div className="text-3xl font-bold text-purple-600">
                    {conversionRateShowedUp.toFixed(1)}%
                  </div>
                  <div className="text-sm text-gray-500 mt-2">
                    {totalPurchased} / {totalShowedUp} Showed Up
                  </div>
                </div>

                {/* Conversion Rate / Booked */}
                <div className="bg-white p-6 rounded-lg shadow">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-gray-500">Conversion Rate</h3>
                    <span className="text-xs text-gray-400">Purchased / Booked</span>
                  </div>
                  <div className="text-3xl font-bold text-purple-600">
                    {conversionRateBooked.toFixed(1)}%
                  </div>
                  <div className="text-sm text-gray-500 mt-2">
                    {totalPurchased} / {totalCalls} calls
                  </div>
                </div>

                {/* Rescheduled */}
                <div className="bg-white p-6 rounded-lg shadow">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-gray-500">Rescheduled Calls</h3>
                    <span className="text-xs text-gray-400">Total Rescheduled</span>
                  </div>
                  <div className="text-3xl font-bold text-orange-600">
                    {totalRescheduled}
                  </div>
                  <div className="text-sm text-gray-500 mt-2">
                    {totalCalls > 0 
                      ? ((totalRescheduled / totalCalls) * 100).toFixed(1) 
                      : 0}% of total calls
                  </div>
                </div>
              </div>

              {/* UTM Source Table */}
              {(utmFilter === 'all' || utmFilter === 'source') && stats && stats.sources && stats.sources.length > 0 && (
                <div className="bg-white shadow rounded-lg overflow-hidden mb-6">
                  <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="text-lg font-medium text-gray-900">Performance by UTM Source</h3>
                    <p className="mt-1 text-sm text-gray-500">Metrics grouped by UTM source parameter</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Source
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Booked in Period
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Calls in Period
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Pick Up Rate
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Show Up Rate
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Sales
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Conversion Rate
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {stats.sources.map((source, index) => (
                          <tr key={source.source} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="text-sm font-medium text-gray-900">
                                  {source.source}
                                </div>
                                {index < 3 && (
                                  <span className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                    index === 0 ? 'bg-yellow-100 text-yellow-800' :
                                    index === 1 ? 'bg-gray-100 text-gray-800' :
                                    'bg-orange-100 text-orange-800'
                                  }`}>
                                    #{index + 1}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="text-sm text-gray-900">{source.totalBookedInPeriod}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="text-sm text-gray-900">{source.totalCallsInPeriod}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="text-sm text-gray-900">{source.pickUpRate.toFixed(1)}%</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="text-sm text-gray-900">{source.showUpRate.toFixed(1)}%</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="text-sm font-semibold text-green-600">{source.totalPurchased}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="inline-flex items-center">
                                <span className={`text-lg font-bold ${
                                  source.conversionRate >= 70 ? 'text-green-600' :
                                  source.conversionRate >= 50 ? 'text-yellow-600' :
                                  'text-red-600'
                                }`}>
                                  {source.conversionRate.toFixed(1)}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* UTM Medium Table */}
              {(utmFilter === 'all' || utmFilter === 'medium') && stats && stats.mediums && stats.mediums.length > 0 && (
                <div className="bg-white shadow rounded-lg overflow-hidden mb-6">
                  <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="text-lg font-medium text-gray-900">Performance by UTM Medium</h3>
                    <p className="mt-1 text-sm text-gray-500">Metrics grouped by UTM medium parameter</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Medium
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Booked in Period
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Calls in Period
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Pick Up Rate
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Show Up Rate
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Sales
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Conversion Rate
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {stats.mediums.map((medium, index) => (
                          <tr key={medium.medium} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="text-sm font-medium text-gray-900">
                                  {medium.medium}
                                </div>
                                {index < 3 && (
                                  <span className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                    index === 0 ? 'bg-yellow-100 text-yellow-800' :
                                    index === 1 ? 'bg-gray-100 text-gray-800' :
                                    'bg-orange-100 text-orange-800'
                                  }`}>
                                    #{index + 1}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="text-sm text-gray-900">{medium.totalBookedInPeriod}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="text-sm text-gray-900">{medium.totalCallsInPeriod}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="text-sm text-gray-900">{medium.pickUpRate.toFixed(1)}%</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="text-sm text-gray-900">{medium.showUpRate.toFixed(1)}%</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="text-sm font-semibold text-green-600">{medium.totalPurchased}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="inline-flex items-center">
                                <span className={`text-lg font-bold ${
                                  medium.conversionRate >= 70 ? 'text-green-600' :
                                  medium.conversionRate >= 50 ? 'text-yellow-600' :
                                  'text-red-600'
                                }`}>
                                  {medium.conversionRate.toFixed(1)}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* UTM Campaign Table */}
              {(utmFilter === 'all' || utmFilter === 'campaign') && stats && stats.campaigns && stats.campaigns.length > 0 && (
                <div className="bg-white shadow rounded-lg overflow-hidden mb-6">
                  <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="text-lg font-medium text-gray-900">Performance by UTM Campaign</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Metrics grouped by UTM campaign parameter ({stats.campaigns.length} campaign{stats.campaigns.length !== 1 ? 's' : ''} found)
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Campaign
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Booked in Period
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Calls in Period
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Pick Up Rate
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Show Up Rate
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Sales
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Conversion Rate
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {stats.campaigns.map((campaign, index) => (
                          <tr key={campaign.campaign} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="text-sm font-medium text-gray-900">
                                  {campaign.campaign}
                                </div>
                                {index < 3 && (
                                  <span className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                    index === 0 ? 'bg-yellow-100 text-yellow-800' :
                                    index === 1 ? 'bg-gray-100 text-gray-800' :
                                    'bg-orange-100 text-orange-800'
                                  }`}>
                                    #{index + 1}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="text-sm text-gray-900">{campaign.totalBookedInPeriod}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="text-sm text-gray-900">{campaign.totalCallsInPeriod}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="text-sm text-gray-900">{campaign.pickUpRate.toFixed(1)}%</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="text-sm text-gray-900">{campaign.showUpRate.toFixed(1)}%</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="text-sm font-semibold text-green-600">{campaign.totalPurchased}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="inline-flex items-center">
                                <span className={`text-lg font-bold ${
                                  campaign.conversionRate >= 70 ? 'text-green-600' :
                                  campaign.conversionRate >= 50 ? 'text-yellow-600' :
                                  'text-red-600'
                                }`}>
                                  {campaign.conversionRate.toFixed(1)}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* UTM Source + Medium Table */}
              {(utmFilter === 'all' || utmFilter === 'source_medium') && stats && stats.sourceMediums && stats.sourceMediums.length > 0 && (
                <div className="bg-white shadow rounded-lg overflow-hidden mb-6">
                  <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="text-lg font-medium text-gray-900">Performance by Source + Medium</h3>
                    <p className="mt-1 text-sm text-gray-500">Metrics grouped by combination of UTM source and medium</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Source + Medium
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Booked in Period
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Calls in Period
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Pick Up Rate
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Show Up Rate
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Sales
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Conversion Rate
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {stats.sourceMediums.map((item, index) => (
                          <tr key={item.key} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="text-sm font-medium text-gray-900">
                                  {item.key}
                                </div>
                                {index < 3 && (
                                  <span className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                    index === 0 ? 'bg-yellow-100 text-yellow-800' :
                                    index === 1 ? 'bg-gray-100 text-gray-800' :
                                    'bg-orange-100 text-orange-800'
                                  }`}>
                                    #{index + 1}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="text-sm text-gray-900">{item.totalBookedInPeriod}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="text-sm text-gray-900">{item.totalCallsInPeriod}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="text-sm text-gray-900">{item.pickUpRate.toFixed(1)}%</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="text-sm text-gray-900">{item.showUpRate.toFixed(1)}%</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="text-sm font-semibold text-green-600">{item.totalPurchased}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="inline-flex items-center">
                                <span className={`text-lg font-bold ${
                                  item.conversionRate >= 70 ? 'text-green-600' :
                                  item.conversionRate >= 50 ? 'text-yellow-600' :
                                  'text-red-600'
                                }`}>
                                  {item.conversionRate.toFixed(1)}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* UTM Source + Campaign Table */}
              {(utmFilter === 'all' || utmFilter === 'source_campaign') && stats && stats.sourceCampaigns && stats.sourceCampaigns.length > 0 && (
                <div className="bg-white shadow rounded-lg overflow-hidden mb-6">
                  <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="text-lg font-medium text-gray-900">Performance by Source + Campaign</h3>
                    <p className="mt-1 text-sm text-gray-500">Metrics grouped by combination of UTM source and campaign</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Source + Campaign
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Booked in Period
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Calls in Period
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Pick Up Rate
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Show Up Rate
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Sales
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Conversion Rate
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {stats.sourceCampaigns.map((item, index) => (
                          <tr key={item.key} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="text-sm font-medium text-gray-900">
                                  {item.key}
                                </div>
                                {index < 3 && (
                                  <span className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                    index === 0 ? 'bg-yellow-100 text-yellow-800' :
                                    index === 1 ? 'bg-gray-100 text-gray-800' :
                                    'bg-orange-100 text-orange-800'
                                  }`}>
                                    #{index + 1}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="text-sm text-gray-900">{item.totalBookedInPeriod}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="text-sm text-gray-900">{item.totalCallsInPeriod}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="text-sm text-gray-900">{item.pickUpRate.toFixed(1)}%</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="text-sm text-gray-900">{item.showUpRate.toFixed(1)}%</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="text-sm font-semibold text-green-600">{item.totalPurchased}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="inline-flex items-center">
                                <span className={`text-lg font-bold ${
                                  item.conversionRate >= 70 ? 'text-green-600' :
                                  item.conversionRate >= 50 ? 'text-yellow-600' :
                                  'text-red-600'
                                }`}>
                                  {item.conversionRate.toFixed(1)}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* UTM Campaign Patterns Table */}
              {(utmFilter === 'all' || utmFilter === 'campaign_pattern') && stats && stats.campaignPatterns && stats.campaignPatterns.length > 0 && (
                <div className="bg-white shadow rounded-lg overflow-hidden mb-6">
                  <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="text-lg font-medium text-gray-900">Performance by Campaign Patterns</h3>
                    <p className="mt-1 text-sm text-gray-500">Metrics grouped by campaign patterns (e.g., youtube bio, tiktok bio, etc.)</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Pattern
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Booked in Period
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Calls in Period
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Pick Up Rate
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Show Up Rate
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Sales
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Conversion Rate
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {stats.campaignPatterns.map((item, index) => (
                          <tr key={item.key} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="text-sm font-medium text-gray-900">
                                  {item.key}
                                </div>
                                {index < 3 && (
                                  <span className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                    index === 0 ? 'bg-yellow-100 text-yellow-800' :
                                    index === 1 ? 'bg-gray-100 text-gray-800' :
                                    'bg-orange-100 text-orange-800'
                                  }`}>
                                    #{index + 1}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="text-sm text-gray-900">{item.totalBookedInPeriod}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="text-sm text-gray-900">{item.totalCallsInPeriod}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="text-sm text-gray-900">{item.pickUpRate.toFixed(1)}%</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="text-sm text-gray-900">{item.showUpRate.toFixed(1)}%</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="text-sm font-semibold text-green-600">{item.totalPurchased}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="inline-flex items-center">
                                <span className={`text-lg font-bold ${
                                  item.conversionRate >= 70 ? 'text-green-600' :
                                  item.conversionRate >= 50 ? 'text-yellow-600' :
                                  'text-red-600'
                                }`}>
                                  {item.conversionRate.toFixed(1)}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

