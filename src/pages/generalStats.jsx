import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';
import { getCountryFromPhone } from '../utils/phoneNumberParser';
import ComparisonTable from './components/ComparisonTable';
import PeriodSelector from './components/PeriodSelector';
import { ViewNotesModal } from './components/Modal';
import { parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import * as DateHelpers from '../utils/dateHelpers';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { fetchPurchases as fetchKajabiPurchases, fetchOffer, fetchCustomer as fetchKajabiCustomer, fetchTransaction, listCustomers, listOffers, fetchTransactions } from '../lib/kajabiApi';
import LinkKajabiCustomerModal from './components/LinkKajabiCustomerModal';
import { getSpecialOfferKajabiIds } from '../lib/specialOffers';

// Helper function to parse date string as UTC (matches SQL date_trunc behavior)
function parseDateAsUTC(dateString) {
  // If no timezone indicator, append 'Z' to force UTC parsing
  const hasTimezone = dateString.includes('Z') || dateString.match(/[+-]\d{2}:?\d{2}$/);
  const isoString = hasTimezone ? dateString : dateString + 'Z';
  return parseISO(isoString);
}

// Mock function - replace with your actual Supabase fetch
// Dates are normalized to DEFAULT_TIMEZONE for consistent filtering
async function fetchStatsData(startDate, endDate) {
  const totalStart = performance.now();
  const log = (label, start) => {
    const ms = (performance.now() - start).toFixed(0);
    console.log(`[generalStats] ${label} took ${ms}ms`);
  };

  // Parse dates as UTC if they don't have timezone indicators (matches SQL date_trunc behavior)
  const startDateObj = parseDateAsUTC(startDate);
  const endDateObj = parseDateAsUTC(endDate);
  
  let startUTC, endUTC;
  
  if (DateHelpers.DEFAULT_TIMEZONE === 'UTC') {
    // For UTC, set start to beginning of UTC day and end to end of UTC day
    startUTC = new Date(startDateObj);
    startUTC.setUTCHours(0, 0, 0, 0);
    endUTC = new Date(endDateObj);
    endUTC.setUTCHours(23, 59, 59, 999);
  } else {
    // Normalize to timezone and convert back to UTC for database queries
    const startDateNormalized = DateHelpers.normalizeToTimezone(startDateObj, DateHelpers.DEFAULT_TIMEZONE);
    const endDateNormalized = DateHelpers.normalizeToTimezone(endDateObj, DateHelpers.DEFAULT_TIMEZONE);
    
    // Get start and end of day in normalized timezone, then convert to UTC
    const startOfDayNormalized = new Date(startDateNormalized);
    startOfDayNormalized.setHours(0, 0, 0, 0);
    const endOfDayNormalized = new Date(endDateNormalized);
    endOfDayNormalized.setHours(23, 59, 59, 999);
    
    // Convert normalized dates back to UTC for database queries
    startUTC = DateHelpers.fromZonedTime(startOfDayNormalized, DateHelpers.DEFAULT_TIMEZONE);
    endUTC = DateHelpers.fromZonedTime(endOfDayNormalized, DateHelpers.DEFAULT_TIMEZONE);
  }
  
  // Fetch 1: Get calls booked in the date range for main metrics
  const stepBooked = performance.now();
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
      setters (id, name),
      closers (id, name),
      leads (phone, medium)
    `)
    .gte('call_date', startUTC.toISOString())
    .lte('call_date', isNaN(endUTC) ? null : endUTC.toISOString());
  log('1. Supabase booked calls', stepBooked);

  if (bookedError) {
    console.error('Error fetching booked calls:', bookedError);
    return null;
  }

  // Fetch 2: Get all purchases from outcome_log in the date range for analysis
  // IMPORTANT: Purchases are filtered by purchase_date from outcome_log, not call_date from calls table
  // Use the same function as purchase log view to ensure consistency
  const stepPurchases = performance.now();
  const purchasedCalls = await fetchPurchasesForDateRange(startDate, endDate);
  log('2. fetchPurchasesForDateRange (outcome_log)', stepPurchases);
  
  if (!purchasedCalls) {
    console.error('Error fetching purchased calls');
    return null;
  }

  // Fetch bookings made in period with source breakdown (incl. is_reschedule for chart)
  const stepBookings = performance.now();
  const { data: bookingsData, error: bookingsError } = await supabase
    .from('calls')
    .select(`
      picked_up,
      book_date,
      source_type,
      is_reschedule,
      phone,
      setters (id, name),
      leads (phone, medium)
    `)
    .gte('book_date', startUTC.toISOString())
    .lte('book_date', endUTC.toISOString());
  log('3. Supabase bookings (book_date)', stepBookings);

  if (bookingsError) {
    console.error('Error fetching bookings made in period:', bookingsError);
    return null;
  }

  const stepInMemory = performance.now();
  const bookingsMadeinPeriod = bookingsData?.length || 0;
  const totalPickedUpFromBookings = bookingsData?.filter(b => b.picked_up === true).length || 0;

  
  // Calculate bookings by source (exclude rescheduled from organic/ads counts)
  const bookingsBySource = {
    organic: { total: 0, pickedUp: 0 },
    ads: { total: 0, pickedUp: 0 }
  };
  
  bookingsData?.forEach(booking => {
    const isReschedule = booking.is_reschedule === true || booking.is_reschedule === 'true';
    if (isReschedule) return;
    const source = booking.source_type || 'organic';
    const isAds = source.toLowerCase().includes('ad') || source.toLowerCase().includes('ads');
    const sourceKey = isAds ? 'ads' : 'organic';
    
    bookingsBySource[sourceKey].total++;
    if (booking.picked_up === true) {
      bookingsBySource[sourceKey].pickedUp++;
    }
  });

  // Booked calls per day for chart (by book_date, organic / ads / rescheduled)
  const tz = DateHelpers.DEFAULT_TIMEZONE;
  const dayBuckets = {};
  const addToBucket = (dayKey, key) => {
    if (!dayBuckets[dayKey]) dayBuckets[dayKey] = { organic: 0, ads: 0, rescheduled: 0 };
    dayBuckets[dayKey][key]++;
  };
  bookingsData?.forEach(booking => {
    if (!booking.book_date) return;
    const dayKey = formatInTimeZone(parseISO(booking.book_date.includes('Z') ? booking.book_date : booking.book_date + 'Z'), tz, 'yyyy-MM-dd');
    const isReschedule = booking.is_reschedule === true || booking.is_reschedule === 'true';
    if (isReschedule) {
      addToBucket(dayKey, 'rescheduled');
    } else {
      const source = booking.source_type || 'organic';
      const isAds = source.toLowerCase().includes('ad') || source.toLowerCase().includes('ads');
      addToBucket(dayKey, isAds ? 'ads' : 'organic');
    }
  });
  const allDays = [];
  const cursor = new Date(startUTC);
  while (cursor <= endUTC) {
    const dayKey = formatInTimeZone(cursor, tz, 'yyyy-MM-dd');
    allDays.push(dayKey);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  const bookingsPerDay = allDays.map(date => {
    const b = dayBuckets[date] || { organic: 0, ads: 0, rescheduled: 0 };
    return {
      date,
      organic: b.organic,
      ads: b.ads,
      rescheduled: b.rescheduled,
      total: b.organic + b.ads + b.rescheduled,
    };
  });

  // Use booked calls for main analysis
  const calls = bookedCalls;

  // Filter out rescheduled leads
  const rescheduledLeadIds = new Set(
    calls.filter(c => c.is_reschedule === true).map(c => c.lead_id)
  );

  const filteredCalls = calls.filter(call => {
    const keep = call.is_reschedule === true || !rescheduledLeadIds.has(call.lead_id);
    return keep;
  });


// Calculate totals
const totalBooked = filteredCalls.length;
const totalPickedUp = filteredCalls.filter(c => c.picked_up === true).length;
const totalShowedUp = filteredCalls.filter(c => c.showed_up === true).length;
const totalConfirmed = filteredCalls.filter(c => c.confirmed === true).length;
// DQ (Don't Qualify) = picked up = yes and confirmed = no
const totalDQ = filteredCalls.filter(c => c.picked_up === true && c.confirmed !== true).length;
const dqRate = totalPickedUp > 0 ? (totalDQ / totalPickedUp) * 100 : 0;

// Use purchased calls count for total purchases (already filtered by date)
// Both filteredCalls and purchasedCalls are filtered using UTC-normalized date ranges
// This ensures conversion rate calculations are consistent with UTC timezone
const totalPurchased = purchasedCalls.length;
  
  // Group by closer - count show-ups and purchases
  // IMPORTANT: Both show-ups (from call_date) and purchases (from purchase_date) 
  // are filtered using the same UTC-normalized date ranges to ensure accurate conversion rates
  const closerStats = {};
  
  // Count show-ups from calls filtered by UTC-normalized call_date range
  filteredCalls.forEach(call => {
    if (call.closers) {
      const closerId = call.closers.id;
      if (!closerStats[closerId]) {
        closerStats[closerId] = {
          id: closerId,
          name: call.closers.name,
          showedUp: 0,
          purchased: 0
        };
      }
      // Count show-ups - call_date is already in UTC and filtered by UTC-normalized range
      if (call.showed_up) closerStats[closerId].showedUp++;
    }
  });

  // Count purchases from purchased calls filtered by UTC-normalized purchase_date range
  // IMPORTANT: Initialize closerStats for closers who have purchases but no showed up calls
  // IMPORTANT: Match closerStats.jsx logic - count 'yes' outcomes and refunds with clawback < 100%
  purchasedCalls.forEach(call => {
    if (call.closers) {
      const closerId = call.closers.id;
      
      // Filter purchases: count 'yes' outcomes, and refunds only if clawback < 100%
      let shouldCount = false;
      if (call.outcome === 'yes') {
        shouldCount = true;
      } else if (call.outcome === 'refund') {
        const clawbackPercentage = call.clawback ?? 100;
        if (clawbackPercentage < 100) {
          shouldCount = true; // Only count partial refunds (clawback < 100%)
        }
      }
      
      if (shouldCount) {
        if (!closerStats[closerId]) {
          closerStats[closerId] = {
            id: closerId,
            name: call.closers.name,
            showedUp: 0,
            purchased: 0
          };
        }
        // Count purchases - purchase_date is already in UTC and filtered by UTC-normalized range
        closerStats[closerId].purchased++;
      }
    }
  });
  
  // Conversion rate = purchases / showUps
  // Both counts are based on UTC-normalized date filtering, ensuring accurate conversion rates

  // Group by setter - calculate pick up rate and show up rate
  const setterStats = {};
  
  // First, track bookings made in period by setter
  bookingsData?.forEach(booking => {
    if (booking.setters) {
      const setterId = booking.setters.id;
      if (!setterStats[setterId]) {
        setterStats[setterId] = {
          id: setterId,
          name: booking.setters.name,
          totalBooked: 0,
          totalPickedUp: 0,
          bookingsMadeInPeriod: 0,
          pickedUpFromBookings: 0,
          totalShowedUp: 0,
          totalConfirmed: 0,
          totalPurchased: 0
        };
      }
      setterStats[setterId].bookingsMadeInPeriod++;
      if (booking.picked_up === true) {
        setterStats[setterId].pickedUpFromBookings++;
      }
    }
  });
  
  // Then, track calls for show up and confirmed metrics
  filteredCalls.forEach(call => {
    if (call.setters) {
      const setterId = call.setters.id;
      if (!setterStats[setterId]) {
        setterStats[setterId] = {
          id: setterId,
          name: call.setters.name,
          totalBooked: 0,
          totalPickedUp: 0,
          bookingsMadeInPeriod: 0,
          pickedUpFromBookings: 0,
          totalShowedUp: 0,
          totalConfirmed: 0,
          totalPurchased: 0
        };
      }
      setterStats[setterId].totalBooked++;
      if (call.picked_up === true) setterStats[setterId].totalPickedUp++;
      if (call.showed_up === true) setterStats[setterId].totalShowedUp++;
      if (call.confirmed === true) setterStats[setterId].totalConfirmed++;
    }
  });

  // Add purchases from purchased calls
  // IMPORTANT: Initialize setterStats for setters who have purchases but no booked calls
  purchasedCalls.forEach(call => {
    if (call.setters) {
      const setterId = call.setters.id;
      if (!setterStats[setterId]) {
        setterStats[setterId] = {
          id: setterId,
          name: call.setters.name,
          totalBooked: 0,
          totalPickedUp: 0,
          totalShowedUp: 0,
          totalConfirmed: 0,
          totalPurchased: 0
        };
      }
      setterStats[setterId].totalPurchased++;
    }
  });

  // Calculate rates for each setter
  Object.values(setterStats).forEach(setter => {
    setter.pickUpRate = setter.bookingsMadeInPeriod > 0 
      ? (setter.pickedUpFromBookings / setter.bookingsMadeInPeriod) * 100 
      : 0;
    setter.showUpRate = setter.totalConfirmed > 0 ? (setter.totalShowedUp / setter.totalConfirmed) * 100 : 0;
  });

  // Group by country - use booked calls for activity metrics, purchased calls for sales
  const countryStats = {};
  // console.log('Booked calls for country analysis:', filteredCalls.length);
  // console.log('Purchased calls for country analysis:', purchasedCalls.length);
  
  // First, track bookings made in period by country
  bookingsData?.forEach(booking => {
    const phoneNumber = booking.phone;
    const country = getCountryFromPhone(phoneNumber);
    
    if (!countryStats[country]) {
      countryStats[country] = {
        country: country,
        totalBooked: 0,
        totalPickedUp: 0,
        bookingsMadeInPeriod: 0,
        pickedUpFromBookings: 0,
        totalShowedUp: 0,
        totalConfirmed: 0,
        totalPurchased: 0,
        pickUpRate: 0,
        showUpRate: 0,
        conversionRate: 0
      };
    }
    
    countryStats[country].bookingsMadeInPeriod++;
    if (booking.picked_up === true) {
      countryStats[country].pickedUpFromBookings++;
    }
  });
  
  // Process booked calls for activity metrics (showed up, confirmed)
  filteredCalls.forEach(call => {
    const phoneNumber = call.phone;
    const country = getCountryFromPhone(phoneNumber);
    
    if (!countryStats[country]) {
      countryStats[country] = {
        country: country,
        totalBooked: 0,
        totalPickedUp: 0,
        bookingsMadeInPeriod: 0,
        pickedUpFromBookings: 0,
        totalShowedUp: 0,
        totalConfirmed: 0,
        totalPurchased: 0,
        pickUpRate: 0,
        showUpRate: 0,
        conversionRate: 0
      };
    }
    
    // Count activity from booked calls
    countryStats[country].totalBooked++;
    if (call.picked_up) countryStats[country].totalPickedUp++;
    if (call.showed_up) countryStats[country].totalShowedUp++;
    if (call.confirmed) countryStats[country].totalConfirmed++;
  });

  // Process purchased calls for sales metrics
  purchasedCalls.forEach(call => {
    const phoneNumber = call.phone;
    const country = getCountryFromPhone(phoneNumber);
    
    if (!countryStats[country]) {
      countryStats[country] = {
        country: country,
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
    
    // Count purchases (these are already filtered by date at database level)
    countryStats[country].totalPurchased++;
  });

  // Calculate rates for each country
  Object.values(countryStats).forEach(country => {
    country.pickUpRate = country.bookingsMadeInPeriod > 0 
      ? (country.pickedUpFromBookings / country.bookingsMadeInPeriod) * 100 
      : 0;
    country.showUpRate = country.totalBooked > 0 ? (country.totalShowedUp / country.totalBooked) * 100 : 0;
    country.conversionRate = country.totalShowedUp > 0 ? (country.totalPurchased / country.totalShowedUp) * 100 : 0;
  });

  // Sort countries by total purchased (sales)
  const sortedCountries = Object.values(countryStats).sort((a, b) => b.totalPurchased - a.totalPurchased);
  
  // console.log('Country statistics:', sortedCountries);

  // Group by source (Ads vs Organic)
  const sourceStats = {
    ads: {
      totalBooked: 0,
      totalPickedUp: 0,
      bookingsMadeInPeriod: 0,
      pickedUpFromBookings: 0,
      totalShowedUp: 0,
      totalConfirmed: 0,
      totalPurchased: 0,
      totalRescheduled: 0
    },
    organic: {
      totalBooked: 0,
      totalPickedUp: 0,
      bookingsMadeInPeriod: 0,
      pickedUpFromBookings: 0,
      totalShowedUp: 0,
      totalConfirmed: 0,
      totalPurchased: 0,
      totalRescheduled: 0
    }
  };

  // Populate sourceStats with bookings made in period
  sourceStats.ads.bookingsMadeInPeriod = bookingsBySource.ads.total;
  sourceStats.ads.pickedUpFromBookings = bookingsBySource.ads.pickedUp;
  sourceStats.organic.bookingsMadeInPeriod = bookingsBySource.organic.total;
  sourceStats.organic.pickedUpFromBookings = bookingsBySource.organic.pickedUp;

  // Process booked calls for source metrics (for show up, confirmed, rescheduled)
  filteredCalls.forEach(call => {
    const source = call.source_type || 'organic';
    const isAds = source.toLowerCase().includes('ad') || source.toLowerCase().includes('ads');
    const sourceKey = isAds ? 'ads' : 'organic';
    
    sourceStats[sourceKey].totalBooked++;
    if (call.picked_up) sourceStats[sourceKey].totalPickedUp++;
    if (call.showed_up) sourceStats[sourceKey].totalShowedUp++;
    if (call.confirmed) sourceStats[sourceKey].totalConfirmed++;
    if (call.is_reschedule) sourceStats[sourceKey].totalRescheduled++;
  });

  // Process purchased calls for source metrics
  purchasedCalls.forEach(call => {
    const source = call.source_type || 'organic';
    const isAds = source.toLowerCase().includes('ad') || source.toLowerCase().includes('ads');
    const sourceKey = isAds ? 'ads' : 'organic';
    
    sourceStats[sourceKey].totalPurchased++;
  });

  // Calculate rates for each source
  Object.values(sourceStats).forEach(source => {
    source.pickUpRate = source.bookingsMadeInPeriod > 0 
      ? (source.pickedUpFromBookings / source.bookingsMadeInPeriod) * 100 
      : 0;
    source.showUpRate = source.totalBooked > 0 ? (source.totalShowedUp / source.totalConfirmed) * 100 : 0;
    source.conversionRate = source.totalShowedUp > 0 ? (source.totalPurchased / source.totalShowedUp) * 100 : 0;
  });

  // Group by medium (TikTok, Instagram, other) for ads only
  const mediumStats = {
    tiktok: {
      totalBooked: 0,
      totalPickedUp: 0,
      bookingsMadeInPeriod: 0,
      pickedUpFromBookings: 0,
      totalShowedUp: 0,
      totalConfirmed: 0,
      totalPurchased: 0,
      totalRescheduled: 0
    },
    instagram: {
      totalBooked: 0,
      totalPickedUp: 0,
      bookingsMadeInPeriod: 0,
      pickedUpFromBookings: 0,
      totalShowedUp: 0,
      totalConfirmed: 0,
      totalPurchased: 0,
      totalRescheduled: 0
    },
    other: {
      totalBooked: 0,
      totalPickedUp: 0,
      bookingsMadeInPeriod: 0,
      pickedUpFromBookings: 0,
      totalShowedUp: 0,
      totalConfirmed: 0,
      totalPurchased: 0,
      totalRescheduled: 0
    }
  };

  // First, track bookings made in period for ads by medium
  bookingsData?.forEach(booking => {
    const source = booking.source_type || 'organic';
    const isAds = source.toLowerCase().includes('ad') || source.toLowerCase().includes('ads');
    
    if (isAds) {
      const medium = booking.leads?.medium?.toLowerCase();
      let mediumKey = 'other';
      
      if (medium === 'tiktok') {
        mediumKey = 'tiktok';
      } else if (medium === 'instagram') {
        mediumKey = 'instagram';
      }
      
      mediumStats[mediumKey].bookingsMadeInPeriod++;
      if (booking.picked_up === true) {
        mediumStats[mediumKey].pickedUpFromBookings++;
      }
    }
  });

  // Process only ads calls for medium metrics (for show up, confirmed, rescheduled)
  filteredCalls.forEach(call => {
    const source = call.source_type || 'organic';
    const isAds = source.toLowerCase().includes('ad') || source.toLowerCase().includes('ads');
    
    if (isAds) {
      const medium = call.leads?.medium?.toLowerCase();
      let mediumKey = 'other';
      
      if (medium === 'tiktok') {
        mediumKey = 'tiktok';
      } else if (medium === 'instagram') {
        mediumKey = 'instagram';
      }
      
      mediumStats[mediumKey].totalBooked++;
      if (call.picked_up) mediumStats[mediumKey].totalPickedUp++;
      if (call.showed_up) mediumStats[mediumKey].totalShowedUp++;
      if (call.confirmed) mediumStats[mediumKey].totalConfirmed++;
      if (call.is_reschedule) mediumStats[mediumKey].totalRescheduled++;
    }
  });

  // Process purchased calls for medium metrics
  purchasedCalls.forEach(call => {
    const source = call.source_type || 'organic';
    const isAds = source.toLowerCase().includes('ad') || source.toLowerCase().includes('ads');
    
    if (isAds) {
      const medium = call.leads?.medium?.toLowerCase();
      let mediumKey = 'other';
      
      if (medium === 'tiktok') {
        mediumKey = 'tiktok';
      } else if (medium === 'instagram') {
        mediumKey = 'instagram';
      }
      
      mediumStats[mediumKey].totalPurchased++;
    }
  });

  // Calculate rates for each medium
  Object.values(mediumStats).forEach(medium => {
    medium.pickUpRate = medium.bookingsMadeInPeriod > 0 
      ? (medium.pickedUpFromBookings / medium.bookingsMadeInPeriod) * 100 
      : 0;
    medium.showUpRate = medium.totalBooked > 0 ? (medium.totalShowedUp / medium.totalConfirmed) * 100 : 0;
    medium.conversionRate = medium.totalShowedUp > 0 ? (medium.totalPurchased / medium.totalShowedUp) * 100 : 0;
  });

  log('4. In-memory processing (closer/setter/country/source/medium stats)', stepInMemory);
  console.log(`[generalStats] TOTAL fetchStatsData took ${(performance.now() - totalStart).toFixed(0)}ms`);

  return {
    bookingsMadeinPeriod,
    bookingsBySource,
    bookingsPerDay,
    totalBooked,
    totalPickedUp,
    totalPickedUpFromBookings,
    totalShowedUp,
    totalConfirmed,
    totalDQ,
    dqRate,
    totalPurchased,
    totalRescheduled: filteredCalls.filter(c => c.is_reschedule).length,
    closers: Object.values(closerStats),
    setters: Object.values(setterStats),
    countries: sortedCountries,
    sourceStats,
    mediumStats
  };
}

// New function to fetch weekly stats for comparison - optimized with parallel requests
async function fetchWeeklyStats() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  
  // Build all week date ranges first
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
  
  // Fetch all weeks in parallel
  const weekPromises = weekRanges.map(({ startDateStr, endDateStr }) => 
    fetchStatsData(startDateStr, endDateStr)
  );
  
  const weekResults = await Promise.all(weekPromises);
  
  // Process results
  const weeksData = [];
  for (let i = 0; i < weekResults.length; i++) {
    const weekStats = weekResults[i];
    const { startDateStr, endDateStr } = weekRanges[i];
    
    if (weekStats) {
      const pickUpRate = weekStats.bookingsMadeinPeriod > 0 ? (weekStats.totalPickedUpFromBookings / weekStats.bookingsMadeinPeriod) * 100 : 0;
      const showUpRateConfirmed = weekStats.totalConfirmed > 0 ? (weekStats.totalShowedUp / weekStats.totalConfirmed) * 100 : 0;
      const showUpRateBooked = weekStats.totalBooked > 0 ? (weekStats.totalShowedUp / weekStats.totalBooked) * 100 : 0;
      const conversionRateShowedUp = weekStats.totalShowedUp > 0 ? (weekStats.totalPurchased / weekStats.totalShowedUp) * 100 : 0;
      const conversionRateBooked = weekStats.totalBooked > 0 ? (weekStats.totalPurchased / weekStats.totalBooked) * 100 : 0;
      const confirmationRate = weekStats.totalBooked > 0 ? (weekStats.totalConfirmed / weekStats.totalBooked) * 100 : 0;
      
      // Extract conversion rates for organic and ads
      const organicConversionRate = weekStats.sourceStats?.organic?.conversionRate || 0;
      const adsConversionRate = weekStats.sourceStats?.ads?.conversionRate || 0;
      
      weeksData.unshift({
        weekStart: startDateStr,
        weekEnd: endDateStr,
        weekLabel: `${startDateStr} to ${endDateStr}`,
        ...weekStats,
        pickUpRate,
        showUpRateConfirmed,
        showUpRateBooked,
        conversionRateShowedUp,
        conversionRateBooked,
        confirmationRate,
        organicConversionRate,
        adsConversionRate
      });
    }
  }
  
  return weeksData.reverse();
}

// Fetch monthly stats for comparison
async function fetchMonthlyStats() {
  const now = new Date();
  
  // Determine start year and month (July = month 6, 0-indexed)
  let startYear = now.getFullYear();
  let startMonth = 6; // July (0-indexed, so 6 = July)
  
  // If current month is before July, start from July of previous year
  if (now.getMonth() < 6) {
    startYear = now.getFullYear() - 1;
  }
  
  // Calculate number of months from July to current month
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  let totalMonths;
  
  if (currentYear === startYear) {
    // Same year: from July (6) to current month
    totalMonths = currentMonth - 6 + 1;
  } else {
    // Different year: from July of startYear to current month of currentYear
    totalMonths = (12 - 6) + currentMonth + 1; // Months from July to Dec + months from Jan to current
  }
  
  // Build all month date ranges from July to current month
  const monthRanges = [];
  for (let i = 0; i < totalMonths; i++) {
    const year = startYear + Math.floor((startMonth + i) / 12);
    const month = (startMonth + i) % 12;
    
    // Start of the month
    const monthStart = new Date(year, month, 1, 0, 0, 0, 0);
    
    // End of the month (last millisecond of last day)
    const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
    
    const startDateStr = monthStart.toISOString();
    const endDateStr = monthEnd.toISOString();
    const monthLabel = monthStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    
    monthRanges.push({ startDateStr, endDateStr, monthLabel });
  }
  
  // Fetch all months in parallel
  const monthPromises = monthRanges.map(({ startDateStr, endDateStr }) => 
    fetchStatsData(startDateStr, endDateStr)
  );
  
  const monthResults = await Promise.all(monthPromises);
  
  // Process results
  const monthsData = monthResults.map((monthStats, i) => {
    const { startDateStr, endDateStr, monthLabel } = monthRanges[i];
    
    if (!monthStats) return null;
    
    const pickUpRate = monthStats.bookingsMadeinPeriod > 0 
      ? (monthStats.totalPickedUpFromBookings / monthStats.bookingsMadeinPeriod) * 100 
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
    const confirmationRate = monthStats.totalBooked > 0 
      ? (monthStats.totalConfirmed / monthStats.totalBooked) * 100 
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
      conversionRateBooked,
      confirmationRate
    };
  }).filter(Boolean).reverse();
  
  return monthsData;
}

// Fetch daily stats for comparison
async function fetchDailyStats(numDays = 30) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  
  // Build all day date ranges first
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
  
  // Fetch all days in parallel
  const dayPromises = dayRanges.map(({ startDateStr, endDateStr }) => 
    fetchStatsData(startDateStr, endDateStr)
  );
  
  const dayResults = await Promise.all(dayPromises);
  
  // Process results
  const daysData = [];
  for (let i = 0; i < dayResults.length; i++) {
    const dayStats = dayResults[i];
    const { startDateStr, endDateStr, dayLabel } = dayRanges[i];
    
    if (dayStats) {
      const pickUpRate = dayStats.bookingsMadeinPeriod > 0 ? (dayStats.totalPickedUpFromBookings / dayStats.bookingsMadeinPeriod) * 100 : 0;
      const showUpRateConfirmed = dayStats.totalConfirmed > 0 ? (dayStats.totalShowedUp / dayStats.totalConfirmed) * 100 : 0;
      const showUpRateBooked = dayStats.totalBooked > 0 ? (dayStats.totalShowedUp / dayStats.totalBooked) * 100 : 0;
      const conversionRateShowedUp = dayStats.totalShowedUp > 0 ? (dayStats.totalPurchased / dayStats.totalShowedUp) * 100 : 0;
      const conversionRateBooked = dayStats.totalBooked > 0 ? (dayStats.totalPurchased / dayStats.totalBooked) * 100 : 0;
      const confirmationRate = dayStats.totalBooked > 0 ? (dayStats.totalConfirmed / dayStats.totalBooked) * 100 : 0;
      
      daysData.unshift({
        dayStart: startDateStr,
        dayEnd: endDateStr,
        periodLabel: dayLabel,
        ...dayStats,
        pickUpRate,
        showUpRateConfirmed,
        showUpRateBooked,
        conversionRateShowedUp,
        conversionRateBooked,
        confirmationRate
      });
    }
  }
  
  return daysData.reverse();
}

// Fetch purchases for date range
// IMPORTANT: This function filters purchases by purchase_date from outcome_log table
// All purchase counts in general stats use this function to ensure consistency
// Dates are normalized to DEFAULT_TIMEZONE for consistent filtering
async function fetchPurchasesForDateRange(startDate, endDate) {
  const t0 = performance.now();

  // Parse dates as UTC if they don't have timezone indicators (matches SQL date_trunc behavior)
  const startDateObj = parseDateAsUTC(startDate);
  const endDateObj = parseDateAsUTC(endDate);
  
  let startUTC, endUTC;
  
  if (DateHelpers.DEFAULT_TIMEZONE === 'UTC') {
    // For UTC, set start to beginning of UTC day and end to end of UTC day
    startUTC = new Date(startDateObj);
    startUTC.setUTCHours(0, 0, 0, 0);
    endUTC = new Date(endDateObj);
    endUTC.setUTCHours(23, 59, 59, 999);
  } else {
    // Normalize to timezone and convert back to UTC for database queries
    const startDateNormalized = DateHelpers.normalizeToTimezone(startDateObj, DateHelpers.DEFAULT_TIMEZONE);
    const endDateNormalized = DateHelpers.normalizeToTimezone(endDateObj, DateHelpers.DEFAULT_TIMEZONE);
    
    // Get start and end of day in normalized timezone, then convert to UTC
    const startOfDayNormalized = new Date(startDateNormalized);
    startOfDayNormalized.setHours(0, 0, 0, 0);
    const endOfDayNormalized = new Date(endDateNormalized);
    endOfDayNormalized.setHours(23, 59, 59, 999);
    
    // Convert normalized dates back to UTC for database queries
    startUTC = DateHelpers.fromZonedTime(startOfDayNormalized, DateHelpers.DEFAULT_TIMEZONE);
    endUTC = DateHelpers.fromZonedTime(endOfDayNormalized, DateHelpers.DEFAULT_TIMEZONE);
  }

  const tQuery = performance.now();
  let query = supabase
    .from('outcome_log')
    .select(`
      *,
      calls!inner!closer_notes_call_id_fkey (
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
    .gte('purchase_date', startUTC.toISOString())
    .lte('purchase_date', endUTC.toISOString())
    .order('purchase_date', { ascending: false });

  const { data: outcomeLogs, error } = await query;
  console.log(`[generalStats] fetchPurchasesForDateRange: outcome_log query took ${(performance.now() - tQuery).toFixed(0)}ms`);

  if (error) {
    console.error('Error fetching purchases:', error);
    return [];
  }

  const tTransform = performance.now();
  // First, deduplicate outcome_log entries by call_id BEFORE transforming
  // If multiple outcome_log entries exist for the same call_id, keep only the most recent one
  const outcomeLogsByCallId = new Map();
  
  (outcomeLogs || []).forEach(outcomeLog => {
    // Must have a valid call
    if (!outcomeLog.calls || !outcomeLog.calls.id) return;
    
    const callId = outcomeLog.calls.id;
    const existing = outcomeLogsByCallId.get(callId);
    
    // If no existing entry, or this outcome_log_id is newer, keep this one
    if (!existing || outcomeLog.id > existing.id) {
      outcomeLogsByCallId.set(callId, outcomeLog);
    }
  });
  
  // Transform the deduplicated outcome_log entries to match the expected lead format
  // IMPORTANT: Include clawback field to filter refunds correctly (same logic as closerStats.jsx)
  const purchases = Array.from(outcomeLogsByCallId.values())
    .map(outcomeLog => ({
      ...outcomeLog.calls,
      leads: outcomeLog.calls.leads,
      outcome_log_id: outcomeLog.id,
      purchase_date: outcomeLog.purchase_date,
      outcome: outcomeLog.outcome,
      clawback: outcomeLog.clawback,
      commission: outcomeLog.paid_second_installment ? outcomeLog.commission * 2 : outcomeLog.commission,
      offer_id: outcomeLog.offer_id,
      offer_name: outcomeLog.offers?.name || null,
      discount: outcomeLog.discount,
      purchased_at: outcomeLog.purchase_date,
      purchased: true
    }));

  console.log(`[generalStats] fetchPurchasesForDateRange: dedupe+transform took ${(performance.now() - tTransform).toFixed(0)}ms, total took ${(performance.now() - t0).toFixed(0)}ms`);
  return purchases;
}

// Fetch pure Kajabi purchases for date range (no CRM data). Returns { purchases, lockInKajabiId, payoffKajabiId }.
async function fetchKajabiPurchasesForDateRange(startDate, endDate) {
  const totalStart = performance.now();
  const logStep = (label, start) => console.log(`[generalStats] fetchKajabiPurchasesForDateRange: ${label} took ${(performance.now() - start).toFixed(0)}ms`);

  const { lockInKajabiId, payoffKajabiId } = await getSpecialOfferKajabiIds();


  const startDateObj = parseDateAsUTC(startDate);
  const endDateObj = parseDateAsUTC(endDate);
  let startUTC, endUTC;
  if (DateHelpers.DEFAULT_TIMEZONE === 'UTC') {
    startUTC = new Date(startDateObj);
    startUTC.setUTCHours(0, 0, 0, 0);
    endUTC = new Date(endDateObj);
    endUTC.setUTCHours(23, 59, 59, 999);
  } else {
    const startDateNormalized = DateHelpers.normalizeToTimezone(startDateObj, DateHelpers.DEFAULT_TIMEZONE);
    const endDateNormalized = DateHelpers.normalizeToTimezone(endDateObj, DateHelpers.DEFAULT_TIMEZONE);
    const startOfDayNormalized = new Date(startDateNormalized);
    startOfDayNormalized.setHours(0, 0, 0, 0);
    const endOfDayNormalized = new Date(endDateNormalized);
    endOfDayNormalized.setHours(23, 59, 59, 999);
    startUTC = DateHelpers.fromZonedTime(startOfDayNormalized, DateHelpers.DEFAULT_TIMEZONE);
    endUTC = DateHelpers.fromZonedTime(endOfDayNormalized, DateHelpers.DEFAULT_TIMEZONE);
  }

  const createdAtGt = startUTC.toISOString();
  const createdAtLt = new Date(endUTC.getTime() + 1).toISOString();

  const stepPaginate = performance.now();
  const allInRange = [];
  let page = 1;
  const perPage = 200;
  let hasMore = true;
  while (hasMore) {
    const result = await fetchKajabiPurchases({
      page,
      perPage,
      sort: '-created_at',
      createdAtGt,
      createdAtLt,
    });
    const data = result.data || [];
    if (data.length === 0) break;
    allInRange.push(...data);
    hasMore = data.length >= perPage;
    if (hasMore) page++;
    if (page > 50) break;
  }
  logStep('Kajabi pagination (pages: ' + page + ')', stepPaginate);

  if (allInRange.length === 0) {
    console.log(`[generalStats] fetchKajabiPurchasesForDateRange: TOTAL took ${(performance.now() - totalStart).toFixed(0)}ms (no purchases in range)`);
    return { purchases: [], lockInKajabiId, payoffKajabiId };
  }

  const customerIds = [...new Set(allInRange.map((p) => p.relationships?.customer?.data?.id).filter(Boolean))].map(String);
  const kajabiOfferIds = [...new Set(allInRange.map((p) => p.relationships?.offer?.data?.id).filter(Boolean))];

  // 1 list fetch for offers; then fetch individually any we need that weren't in the list.
  const stepOffers = performance.now();
  const kajabiOfferMap = {};
  const { data: offersList } = await listOffers({ page: 1, perPage: 100 });
  (offersList || []).forEach((o) => {
    if (o?.id) kajabiOfferMap[String(o.id)] = o.internal_title ?? o.id;
  });
  const missingOfferIds = kajabiOfferIds.filter((id) => !kajabiOfferMap[String(id)]);
  if (missingOfferIds.length > 0) {
    const results = await Promise.all(missingOfferIds.map((id) => fetchOffer(id).catch(() => null)));
    missingOfferIds.forEach((id, i) => {
      const offer = results[i];
      if (offer) kajabiOfferMap[String(id)] = offer.internal_title ?? offer.id;
      else kajabiOfferMap[String(id)] = id;
    });
  }
  logStep('offers', stepOffers);

  // 1 list fetch for customers; then fetch individually any we need that weren't in the list.
  const stepCustomers = performance.now();
  const kajabiCustomerById = {};
  const { data: customersList } = await listCustomers({ page: 1, perPage: 500, sort: '-created_at' });
  (customersList || []).forEach((c) => {
    if (c?.id) kajabiCustomerById[String(c.id)] = { name: c.name ?? null, email: c.email ?? null, contact_id: c.contact_id ?? null };
  });
  const missingCustomerIds = customerIds.filter((cid) => !kajabiCustomerById[String(cid)]);
  if (missingCustomerIds.length > 0) {
    const results = await Promise.all(missingCustomerIds.map((cid) => fetchKajabiCustomer(cid).catch(() => ({ name: null, email: null, contact_id: null }))));
    missingCustomerIds.forEach((cid, i) => {
      const c = results[i];
      if (c) kajabiCustomerById[String(cid)] = { name: c.name ?? null, email: c.email ?? null, contact_id: c.contact_id ?? null };
    });
  }
  logStep('customers missing ' + missingCustomerIds.length, stepCustomers);

  // Amount paid: 1 list fetch for transactions; then fetch individually any we need that weren't in the list.
  const stepTx = performance.now();
  const purchaseToTxIds = {};
  const allTxIds = new Set();
  for (const p of allInRange) {
    const list = p.relationships?.transactions?.data ?? [];
    const ids = list.map((t) => t.id).filter(Boolean);
    if (ids.length) {
      purchaseToTxIds[p.id] = ids;
      ids.forEach((id) => allTxIds.add(id));
    }
  }
  const txById = {};
  const { data: txList } = await fetchTransactions({ page: 1, perPage: 200, sort: '-created_at' });
  (txList || []).forEach((t) => {
    if (!t?.id) return;
    const attrs = t.attributes || {};
    txById[String(t.id)] = {
      amount_in_cents: attrs.amount_in_cents != null ? Number(attrs.amount_in_cents) : null,
      currency: attrs.currency || 'USD',
    };
  });
  const txIdArray = [...allTxIds];
  const missingTxIds = txIdArray.filter((id) => !txById[String(id)]);
  if (missingTxIds.length > 0) {
    const results = await Promise.all(missingTxIds.map((id) => fetchTransaction(id)));
    missingTxIds.forEach((id, i) => {
      const t = results[i];
      if (t) txById[String(id)] = { amount_in_cents: t.amount_in_cents, currency: t.currency || 'USD' };
    });
  }
  logStep('transactions', stepTx);
  const amountPaidByPurchaseId = {};
  for (const [purchaseId, ids] of Object.entries(purchaseToTxIds)) {
    const firstId = ids && ids[0];
    const t = firstId ? txById[firstId] : null;
    amountPaidByPurchaseId[purchaseId] = t && t.amount_in_cents != null
      ? { amount_in_cents: t.amount_in_cents, currency: t.currency || 'USD' }
      : { amount_in_cents: 0, currency: 'USD' };
  }

  // For each purchase: get outcome_log row where kajabi_purchase_id = purchase id (closer, setter, lead from that call).
  const stepOutcome = performance.now();
  const purchaseIds = allInRange.map((p) => String(p.id));
  // Override how a purchase is treated (Purchase / Lock-in / Payoff). Table: purchase_treatment_override (kajabi_purchase_id text primary key, treatment text not null, check treatment in ('purchase','lock_in','payoff'))
  const treatmentOverrideByPurchaseId = {};
  if (purchaseIds.length > 0) {
    const { data: overrideRows } = await supabase
      .from('purchase_treatment_override')
      .select('kajabi_purchase_id, treatment')
      .in('kajabi_purchase_id', purchaseIds);
    if (overrideRows && overrideRows.length) {
      overrideRows.forEach((r) => {
        const id = r.kajabi_purchase_id != null ? String(r.kajabi_purchase_id) : null;
        if (id && ['purchase', 'lock_in', 'payoff'].includes(r.treatment)) {
          treatmentOverrideByPurchaseId[id] = r.treatment;
        }
      });
    }
  }
  const outcomeLogByPurchaseId = {};
  if (purchaseIds.length > 0) {
    const { data: outcomeRows } = await supabase
      .from('outcome_log')
      .select('id, outcome, purchase_date, closer_id, setter_id, call_id, kajabi_purchase_id, kajabi_payoff_id, PIF, closers(id, name), setters(id, name), calls!closer_notes_call_id_fkey(lead_id)')
      .or('kajabi_purchase_id.in.(' + purchaseIds.join(',') + '),kajabi_payoff_id.in.(' + purchaseIds.join(',') + ')');
    console.log('outcomeRows', outcomeRows);
    if (outcomeRows && outcomeRows.length) {
      outcomeRows.forEach((row) => {
        const pid = row.kajabi_purchase_id != null ? String(row.kajabi_purchase_id) : null;
        const pid2 = row.kajabi_payoff_id != null ? String(row.kajabi_payoff_id) : null;

        if (!pid) return;
        outcomeLogByPurchaseId[pid] = {
          outcome_log_id: row.id,
          outcome: row.outcome,
          purchase_date: row.purchase_date,
          closer_id: row.closer_id ?? row.closers?.id ?? null,
          closer_name: row.closers?.name ?? '—',
          setter_id: row.setter_id ?? row.setters?.id ?? null,
          setter_name: row.setters?.name ?? '—',
          lead_id: row.calls?.lead_id ?? null,
          PIF: row.PIF
        };

        if (pid2) outcomeLogByPurchaseId[pid2] = outcomeLogByPurchaseId[pid];

      });
    }
  }
  logStep('outcome_log by purchase_id', stepOutcome);

  // Lead id by Kajabi customer_id (from leads table). When customer is linked to a lead but purchase isn't,
  // we still have lead_id so we show the lead link and only "link purchase" is needed (not "link customer").
  const stepLeads = performance.now();
  const leadIdByCustomerId = {};
  if (customerIds.length > 0) {
    try {
      const { data: leadRows, error: leadErr } = await supabase
        .from('leads')
        .select('id, customer_id')
        .in('customer_id', customerIds);
      if (!leadErr && leadRows && leadRows.length) {
        leadRows.forEach((r) => {
          const cid = r.customer_id != null ? String(r.customer_id) : null;
          if (cid) leadIdByCustomerId[cid] = r.id;
        });
      }
    } catch (_) {
      // If leads fetch fails, continue with empty map so purchases still show
    }
  }
  logStep('leads by customer_id', stepLeads);

  const formatAmount = (cents, currency = 'USD') => {
    if (cents == null) return '—';
    const value = (cents / 100).toFixed(2);
    return currency === 'USD' ? `$${value}` : `${value} ${currency}`;
  };

  const purchases = allInRange.map((p) => {
    const customerId = p.relationships?.customer?.data?.id; 
    const kajabiOfferId = p.relationships?.offer?.data?.id;
    const attrs = p.attributes || {};
    const createdAt = attrs.created_at;
    const customer = customerId ? kajabiCustomerById[String(customerId)] : null;
    const offerName = kajabiOfferId ? (kajabiOfferMap[kajabiOfferId] ?? kajabiOfferId) : null;
    const paid = amountPaidByPurchaseId[p.id];
    const amount_in_cents = paid ? paid.amount_in_cents : attrs.amount_in_cents;
    const currency = paid ? paid.currency : (attrs.currency || 'USD');
    const outcomeRow = outcomeLogByPurchaseId[String(p.id)];
    const closer_id = outcomeRow?.closer_id ?? null;
    const closer_name = outcomeRow ? outcomeRow.closer_name : 'x';
    const setter_id = outcomeRow?.setter_id ?? null;
    const setter_name = outcomeRow ? outcomeRow.setter_name : 'x';
    // From outcome_log when linked; else from leads.customer_id so "customer linked, purchase not linked" shows lead link only
    const lead_id = outcomeRow?.lead_id ?? (customerId ? leadIdByCustomerId[String(customerId)] : null) ?? null;
    const treatment_override = treatmentOverrideByPurchaseId[String(p.id)] ?? null;
    let isLinkedToOutcome;
    if (treatment_override === 'lock_in') {
      isLinkedToOutcome = true;
    } else if (treatment_override === 'payoff') {
      isLinkedToOutcome = outcomeRow?.PIF === true;
    } else if (treatment_override === 'purchase') {
      isLinkedToOutcome = outcomeRow?.outcome === 'yes';
    } else {
      isLinkedToOutcome = outcomeRow?.outcome === 'yes' || (lockInKajabiId && String(kajabiOfferId) === String(lockInKajabiId)) || (payoffKajabiId && String(kajabiOfferId) === String(payoffKajabiId) && outcomeRow?.PIF === true);
    }
    return {
      _rowKey: p.id,
      purchase_id: p.id,
      customer_id: customerId,
      contact_id: customer?.contact_id ?? null,
      name: customer?.name ?? '—',
      email: customer?.email ?? '—',
      purchase_date: createdAt,
      offer_id: kajabiOfferId,
      offer_name: offerName ?? '—',
      amount_in_cents,
      currency,
      amount_formatted: formatAmount(amount_in_cents, currency),
      closer_id,
      closer_name,
      setter_id,
      setter_name,
      lead_id: lead_id ?? null,
      treatment_override,
      isLinkedToOutcome
    };
  });

  purchases.sort((a, b) => new Date(b.purchase_date) - new Date(a.purchase_date));
  console.log(`[generalStats] fetchKajabiPurchasesForDateRange: TOTAL took ${(performance.now() - totalStart).toFixed(0)}ms`);
  return { purchases, lockInKajabiId, payoffKajabiId };
}

// Pure Kajabi purchase row (no CRM fields). lead_id comes from outcome_log or leads.customer_id;
// when customer is linked but purchase not linked we show lead link (only link purchase needed).
function KajabiPurchaseRow({ row, onOpenLinkModal, onContextMenu }) {
  const navigate = useNavigate();
  const nameContent = row.name || '—';
  const emailContent = row.email || '—';
  const hasCustomerNoLead = row.customer_id != null && row.lead_id == null;
  const unlinkedEmoji = ' 🔗';
  const nameEl = row.lead_id != null ? (
    <a
      href={`/lead/${row.lead_id}`}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.button === 1) return;
        e.preventDefault();
        navigate(`/lead/${row.lead_id}`);
      }}
      style={{ color: '#111827', textDecoration: 'none', fontWeight: '600', cursor: 'pointer' }}
    >
      {nameContent}
    </a>
  ) : hasCustomerNoLead && onOpenLinkModal ? (
    <button
      type="button"
      onClick={() => onOpenLinkModal({ customerId: row.customer_id, name: row.name ?? '—', email: row.email ?? '—' })}
      style={{ color: '#111827', textDecoration: 'none', fontWeight: '600', cursor: 'pointer', background: 'none', border: 'none', padding: 0, font: 'inherit' }}
    >
      {nameContent}{unlinkedEmoji}
    </button>
  ) : row.contact_id ? (
    <a
      href={`https://app.kajabi.com/admin/contacts/${encodeURIComponent(row.contact_id)}`}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: '#111827', textDecoration: 'none', fontWeight: '600' }}
    >
      {nameContent}
    </a>
  ) : (
    nameContent
  );
  const emailEl = row.lead_id != null ? (
    <a
      href={`/lead/${row.lead_id}`}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.button === 1) return;
        e.preventDefault();
        navigate(`/lead/${row.lead_id}`);
      }}
      style={{ color: '#6b7280', textDecoration: 'none', cursor: 'pointer' }}
    >
      {emailContent}
    </a>
  ) : hasCustomerNoLead && onOpenLinkModal ? (
    <button
      type="button"
      onClick={() => onOpenLinkModal({ customerId: row.customer_id, name: row.name ?? '—', email: row.email ?? '—' })}
      style={{ color: '#6b7280', textDecoration: 'none', cursor: 'pointer', background: 'none', border: 'none', padding: 0, font: 'inherit' }}
    >
      {emailContent}{unlinkedEmoji}
    </button>
  ) : row.contact_id ? (
    <a
      href={`https://app.kajabi.com/admin/contacts/${encodeURIComponent(row.contact_id)}`}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: '#6b7280', textDecoration: 'none' }}
    >
      {emailContent}
    </a>
  ) : (
    <a
      style={{ color: '#6b7280', textDecoration: 'none' }}
      href={`https://app.kajabi.com/admin/sites/2147813413/contacts?page=1&search=${encodeURIComponent(row.email || '')}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      {emailContent}
    </a>
  );
  return (
    <div
      role="row"
      style={{
        display: 'grid',
        gridTemplateColumns: '2fr 2fr 1.5fr 1.5fr 1fr 1.2fr 1.2fr',
        gap: '16px',
        alignItems: 'center',
        padding: '12px 16px',
        backgroundColor: row.isLinkedToOutcome ? 'white' : '#fff7ed',
        borderBottom: '1px solid #e5e7eb',
        fontSize: '14px',
        transition: 'background-color 0.2s'
      }}
      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = row.isLinkedToOutcome ? '#f9fafb' : '#ffedd5'; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = row.isLinkedToOutcome ? 'white' : '#fff7ed'; }}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu?.(e, row);
      }}
    >
      <div style={{ fontWeight: '600', color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {nameEl}
      </div>
      <div style={{ color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {emailEl}
      </div>
      <div style={{ fontSize: '13px', color: '#6b7280' }}>
        {row.purchase_date ? DateHelpers.formatTimeWithRelative(row.purchase_date) : '—'}
      </div>
      <div style={{ fontSize: '13px', color: '#111827', fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {row.offer_name || '—'}
      </div>
      <div style={{ fontSize: '13px', color: '#111827', fontWeight: '500' }}>
        {row.amount_formatted || '—'}
      </div>
      <div style={{ fontSize: '13px', color: row.closer_name === 'x' ? '#9ca3af' : '#111827', fontWeight: '500' }}>
        {row.closer_id != null ? (
          <a
            href={`/closer-stats/${row.closer_id}`}
            onClick={(e) => { e.preventDefault(); navigate(`/closer-stats/${row.closer_id}`); }}
            style={{ color: 'inherit', textDecoration: 'none', cursor: 'pointer' }}
          >
            {row.closer_name ?? 'x'}
          </a>
        ) : (
          (row.closer_name ?? 'x')
        )}
      </div>
      <div style={{ fontSize: '13px', color: row.setter_name === 'x' ? '#9ca3af' : '#111827', fontWeight: '500' }}>
        {row.setter_id != null ? (
          <a
            href={`/stats/${row.setter_id}`}
            onClick={(e) => { e.preventDefault(); navigate(`/stats/${row.setter_id}`); }}
            style={{ color: 'inherit', textDecoration: 'none', cursor: 'pointer' }}
          >
            {row.setter_name ?? 'x'}
          </a>
        ) : (
          (row.setter_name ?? 'x')
        )}
      </div>
    </div>
  );
}

export default function StatsDashboard() {
  const formatDateLocal = (date) => {
    // Format as YYYY-MM-DDTHH:mm:ss (local time, without timezone specifier)
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
    const dayOfWeek = today.getDay(); // 0 (Sunday) to 6 (Saturday)
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Monday as start of week
    const monday = new Date(today);
    monday.setDate(today.getDate() + diff);
    monday.setHours(0, 0, 0, 0);

    // Format as YYYY-MM-DD in local timezone
    return formatDateLocal(monday);
  };

  const navigate = useNavigate();

  const getCurrentMonthKey = () => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  };

  const getInitialMonthRange = () => {
    const monthKey = getCurrentMonthKey();
    const [y, m] = monthKey.split('-').map(Number);
    const monthDate = new Date(Date.UTC(y, m - 1, 15));
    const range = DateHelpers.getMonthRangeInTimezone(monthDate, DateHelpers.DEFAULT_TIMEZONE);
    if (range) return { start: range.startDate.toISOString(), end: range.endDate.toISOString() };
    const monday = getStartOfWeek();
    return { start: monday, end: `${new Date().toISOString().slice(0, 10)}T23:59:59.999Z` };
  };

  const initialRange = getInitialMonthRange();
  const [startDate, setStartDate] = useState(initialRange.start);

  const getTodayLocal = () => {
    const today = new Date();
    today.setHours(23, 59, 59, 999); // Set to end of the day
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const hours = String(today.getHours()).padStart(2, '0');
    const minutes = String(today.getMinutes()).padStart(2, '0');
    const seconds = String(today.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
  };

  /** Get start/end dates for a range preset. Returns { start, end } in local format. */
  const getRangePresetDates = (preset) => {
    const today = new Date();
    const endOfToday = new Date(today);
    endOfToday.setHours(23, 59, 59, 999);
    if (!preset) return null;
    if (preset === 'last7') {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      return { start: formatDateLocal(start), end: formatDateLocal(endOfToday) };
    }
    if (preset === 'last14') {
      const start = new Date(today);
      start.setDate(start.getDate() - 13);
      start.setHours(0, 0, 0, 0);
      return { start: formatDateLocal(start), end: formatDateLocal(endOfToday) };
    }
    if (preset === 'last30') {
      const start = new Date(today);
      start.setDate(start.getDate() - 29);
      start.setHours(0, 0, 0, 0);
      return { start: formatDateLocal(start), end: formatDateLocal(endOfToday) };
    }
    if (preset === 'last90') {
      const start = new Date(today);
      start.setDate(start.getDate() - 89);
      start.setHours(0, 0, 0, 0);
      return { start: formatDateLocal(start), end: formatDateLocal(endOfToday) };
    }
    if (preset === 'currentMonth') {
      const monthDate = new Date(today.getFullYear(), today.getMonth(), 15);
      const range = DateHelpers.getMonthRangeInTimezone(monthDate, DateHelpers.DEFAULT_TIMEZONE);
      if (range) return { start: range.startDate.toISOString(), end: range.endDate.toISOString() };
    }
    if (preset === 'previousMonth') {
      const prev = new Date(today.getFullYear(), today.getMonth() - 1, 15);
      const range = DateHelpers.getMonthRangeInTimezone(prev, DateHelpers.DEFAULT_TIMEZONE);
      if (range) return { start: range.startDate.toISOString(), end: range.endDate.toISOString() };
    }
    if (preset === 'thisWeek') {
      return { start: getStartOfWeek(), end: getTodayLocal() };
    }
    if (preset === 'lastWeek') {
      const monday = new Date(today);
      const dayOfWeek = monday.getDay();
      const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      monday.setDate(monday.getDate() + diff - 7);
      monday.setHours(0, 0, 0, 0);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);
      return { start: formatDateLocal(monday), end: formatDateLocal(sunday) };
    }
    return null;
  };

  const [endDate, setEndDate] = useState(initialRange.end);
  const [rangePreset, setRangePreset] = useState('currentMonth'); // '' = custom
  const [comparisonView, setComparisonView] = useState('none'); // 'none', 'weekly', 'monthly', 'daily'
  const [selectedDays, setSelectedDays] = useState(30); // For daily comparison
  const [weeklyStats, setWeeklyStats] = useState([]);
  const [monthlyStats, setMonthlyStats] = useState([]);
  const [dailyStats, setDailyStats] = useState([]);
  const [loadingWeekly, setLoadingWeekly] = useState(false);
  const [loadingMonthly, setLoadingMonthly] = useState(false);
  const [loadingDaily, setLoadingDaily] = useState(false);
  const [sourceFilter, setSourceFilter] = useState('all'); // 'all', 'ads', 'organic'
  const [viewMode, setViewMode] = useState('stats'); // 'stats' or 'purchases'
  const [purchases, setPurchases] = useState([]);
  const [specialOfferIds, setSpecialOfferIds] = useState({ lockInKajabiId: null, payoffKajabiId: null });
  const [purchasesLoading, setPurchasesLoading] = useState(false);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkModalCustomer, setLinkModalCustomer] = useState(null);
  const [setterMap, setSetterMap] = useState({});
  const [closerMap, setCloserMap] = useState({});
  const [purchaseLogTab, setPurchaseLogTab] = useState('purchases'); // 'purchases' | 'lockins' | 'payoffs'
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthKey);
  const [purchaseLogCloserFilter, setPurchaseLogCloserFilter] = useState('');
  const [purchaseLogSetterFilter, setPurchaseLogSetterFilter] = useState('');
  const [hideReschedulesInChart, setHideReschedulesInChart] = useState(false);
  const [purchaseContextMenu, setPurchaseContextMenu] = useState(null); // { x, y, row }

  // Generate list of available months (previous 6 months including current)
  const generateAvailableMonths = () => {
    const months = [];
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    
    // Generate last 6 months (including current month)
    for (let i = 0; i < 6; i++) {
      const date = new Date(currentYear, currentMonth - i, 1);
      const year = date.getFullYear();
      const month = date.getMonth();
      const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
      const monthLabel = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      months.push({ value: monthKey, label: monthLabel });
    }
    
    return months; // Most recent first
  };

  const availableMonths = generateAvailableMonths();

  // Handler for month selection
  const handleMonthSelect = (monthKey) => {
    if (!monthKey) {
      setSelectedMonth(null);
      return;
    }
    setRangePreset('');
    setSelectedMonth(monthKey);
    
    // Parse month and create date in UTC
    const [year, monthNum] = monthKey.split('-');
    const monthDate = new Date(Date.UTC(parseInt(year), parseInt(monthNum) - 1, 15));
    
    // Get month range using date helpers
    const monthRange = DateHelpers.getMonthRangeInTimezone(monthDate, DateHelpers.DEFAULT_TIMEZONE);
    
    if (monthRange) {
      const newStartDate = monthRange.startDate.toISOString();
      const newEndDate = monthRange.endDate.toISOString();
      setStartDate(newStartDate);
      setEndDate(newEndDate);
      loadStats(newStartDate, newEndDate);
    }
  };

  const parseDateLocal = (dateString) => {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day, 0, 0, 0, 0);
  };

  const goToPreviousWeek = () => {
    // Parse the current start date as a local date
    const currentStart = new Date(startDate);
    const dayOfWeek = currentStart.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    currentStart.setDate(currentStart.getDate() + diff);
    
    // Go back 7 days to previous Monday
    currentStart.setDate(currentStart.getDate() - 7);
    
    // End date is 6 days after start (Sunday)
    const newEnd = new Date(currentStart);
    newEnd.setDate(currentStart.getDate() + 6);
    newEnd.setHours(23, 59, 59, 999);
    
    setSelectedMonth(null); // Clear month selection when navigating weeks
    setRangePreset('');
    setStartDate(formatDateLocal(currentStart));
    setEndDate(formatDateLocal(newEnd));
  };

  const goToNextWeek = () => {
    // Parse the current start date as a local date
    const currentStart = new Date(startDate);
    const dayOfWeek = currentStart.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    currentStart.setDate(currentStart.getDate() + diff);
    
    // Go forward 7 days to next Monday
    currentStart.setDate(currentStart.getDate() + 7);
    
    // End date is 6 days after start (Sunday)
    const newEnd = new Date(currentStart);
    newEnd.setDate(currentStart.getDate() + 6);
    newEnd.setHours(23, 59, 59, 999);
    
    setSelectedMonth(null); // Clear month selection when navigating weeks
    setRangePreset('');
    setStartDate(formatDateLocal(currentStart));
    setEndDate(formatDateLocal(newEnd));
  };

  const goToCurrentWeek = () => {
    setSelectedMonth(null);
    setRangePreset('thisWeek');
    setStartDate(getStartOfWeek());
    setEndDate(getTodayLocal());
  };




  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load stats on initial mount only
  useEffect(() => {
    const loadInitialStats = async () => {
    setLoading(true);
    const data = await fetchStatsData(startDate, endDate);
      setStats(data);
      setLoading(false);
    };
    loadInitialStats();
  }, []);

  const loadStats = async (customStartDate = null, customEndDate = null) => {
    setLoading(true);
    const start = customStartDate || startDate;
    const end = customEndDate || endDate;
    const data = await fetchStatsData(start, end);
    setStats(data);
    setLoading(false);
  };

  const loadWeeklyStats = async () => {
    setLoadingWeekly(true);
    const data = await fetchWeeklyStats();
    setWeeklyStats(data);
    setLoadingWeekly(false);
  };

  const loadMonthlyStats = async () => {
    setLoadingMonthly(true);
    const data = await fetchMonthlyStats();
    setMonthlyStats(data);
    setLoadingMonthly(false);
  };

  const loadDailyStats = async () => {
    setLoadingDaily(true);
    const data = await fetchDailyStats(selectedDays);
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

  const [settersList, setSettersList] = useState([]);
  const [closersList, setClosersList] = useState([]);

  // Fetch setters and closers maps
  useEffect(() => {
    const fetchMaps = async () => {
      const { data: settersData } = await supabase
        .from('setters')
        .select('id, name')
        .eq('active', true)
        .order('name');
      if (settersData) {
        const setterMapObj = {};
        settersData.forEach(s => { setterMapObj[s.id] = s.name; });
        setSetterMap(setterMapObj);
        setSettersList(settersData);
      }

      const { data: closersData } = await supabase
        .from('closers')
        .select('id, name')
        .eq('active', true)
        .order('name');
      if (closersData) {
        const closerMapObj = {};
        closersData.forEach(c => { closerMapObj[c.id] = c.name; });
        setCloserMap(closerMapObj);
        setClosersList(closersData);
      }
    };
    fetchMaps();
  }, []);

  // Fetch purchases when view mode changes or date range changes (purchase log = Kajabi only)
  useEffect(() => {
    if (viewMode === 'purchases' && comparisonView === 'none') {
      const loadPurchases = async () => {
        setPurchasesLoading(true);
        try {
          const result = await fetchKajabiPurchasesForDateRange(startDate, endDate);
          setPurchases(result.purchases);
          setSpecialOfferIds({ lockInKajabiId: result.lockInKajabiId, payoffKajabiId: result.payoffKajabiId });
        } catch (e) {
          console.error('Error loading Kajabi purchases:', e);
          setPurchases([]);
        }
        setPurchasesLoading(false);
      };
      loadPurchases();
    }
  }, [viewMode, startDate, endDate, comparisonView]);

  const refetchPurchases = useCallback(async () => {
    setPurchasesLoading(true);
    try {
      const result = await fetchKajabiPurchasesForDateRange(startDate, endDate);
      setPurchases(result.purchases);
      setSpecialOfferIds({ lockInKajabiId: result.lockInKajabiId, payoffKajabiId: result.payoffKajabiId });
    } catch (e) {
      console.error('Error refetching Kajabi purchases:', e);
    }
    setPurchasesLoading(false);
  }, [startDate, endDate]);

  // Close purchase context menu on outside click
  useEffect(() => {
    if (!purchaseContextMenu) return;
    const close = () => setPurchaseContextMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [purchaseContextMenu]);

  // Removed full-page loading - now shows loading indicator in metrics area instead

  // Calculate metrics only if we have stats and not in comparison view
  let pickUpRate = 0, showUpRateConfirmed = 0, showUpRateBooked = 0, conversionRateShowedUp = 0, conversionRateBooked = 0, dqRate = 0;
  let totalBooked, totalPickedUp, totalPickedUpFromBookings, totalShowedUp, totalConfirmed, totalDQ, totalPurchased, totalRescheduled, totalBookedInPeriod;
  
  if (stats && comparisonView === 'none') {
    // Filter by source if not 'all'
    if (sourceFilter !== 'all' && stats.sourceStats && stats.sourceStats[sourceFilter]) {
      const filtered = stats.sourceStats[sourceFilter];
      pickUpRate = filtered.pickUpRate || 0;
      showUpRateConfirmed = filtered.showUpRate || 0;
      showUpRateBooked = filtered.showUpRate || 0;
      conversionRateShowedUp = filtered.conversionRate || 0;
      conversionRateBooked = filtered.totalBooked > 0 ? (filtered.totalPurchased / filtered.totalBooked) * 100 : 0;
      totalBooked = filtered.totalBooked;
      totalBookedInPeriod = filtered.bookingsMadeInPeriod;
      totalPickedUp = filtered.totalPickedUp;
      totalPickedUpFromBookings = filtered.pickedUpFromBookings;
      totalShowedUp = filtered.totalShowedUp;
      totalConfirmed = filtered.totalConfirmed;
      totalDQ = (filtered.totalPickedUp ?? 0) - (filtered.totalConfirmed ?? 0);
      dqRate = (filtered.totalPickedUp ?? 0) > 0 ? (totalDQ / filtered.totalPickedUp) * 100 : 0;
      totalPurchased = filtered.totalPurchased;
      totalRescheduled = 0; // Not tracked by source
    } else {
      pickUpRate = stats.bookingsMadeinPeriod > 0 ? (stats.totalPickedUpFromBookings / stats.bookingsMadeinPeriod) * 100 : 0;
      showUpRateConfirmed = stats.totalConfirmed > 0 ? (stats.totalShowedUp / stats.totalConfirmed) * 100 : 0;
      showUpRateBooked = stats.totalBooked > 0 ? (stats.totalShowedUp / stats.totalBooked) * 100 : 0;
      conversionRateShowedUp = stats.totalShowedUp > 0 ? (stats.totalPurchased / stats.totalShowedUp) * 100 : 0;
      conversionRateBooked = stats.totalBooked > 0 ? (stats.totalPurchased / stats.totalBooked) * 100 : 0;
      totalBooked = stats.totalBooked;
      totalBookedInPeriod = stats.bookingsMadeinPeriod;
      totalPickedUp = stats.totalPickedUp;
      totalPickedUpFromBookings = stats.totalPickedUpFromBookings;
      totalShowedUp = stats.totalShowedUp;
      totalConfirmed = stats.totalConfirmed;
      totalDQ = stats.totalDQ ?? 0;
      dqRate = stats.dqRate ?? 0;
      totalPurchased = stats.totalPurchased;
      totalRescheduled = stats.totalRescheduled;
    }
  }




  return (
    <div className="min-h-screen bg-gray-50 p-8" >
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-3xl font-bold text-gray-900">Sales Performance Dashboard</h1>
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

           {/* View Mode Toggle - Only show if not in comparison view */}
           {comparisonView === 'none' && (
            <div className="flex gap-2 mb-4">
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
            </div>
           )}

           {/* Source Filter - Only show if not in comparison view and in stats mode */}
           {comparisonView === 'none' && viewMode === 'stats' && stats && stats.sourceStats && (
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setSourceFilter('all')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  sourceFilter === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                All Sources
              </button>
              <button
                onClick={() => setSourceFilter('ads')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  sourceFilter === 'ads'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Ads ({stats.sourceStats.ads.totalBooked})
              </button>
              <button
                onClick={() => setSourceFilter('organic')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  sourceFilter === 'organic'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Organic ({stats.sourceStats.organic.totalBooked})
              </button>
            </div>
           )}
           
           {/* Navigation Buttons - Only show if not in comparison view */}
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
          
          {/* Date Range Filters - Only show if not in comparison view */}
          {comparisonView === 'none' && (
          <div className="bg-white p-6 rounded-lg shadow mb-6">
            {/* Month selector + Range preset in same row */}
            <div className="flex gap-4 mb-4 flex-wrap items-end">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Month (Quick Filter)
                </label>
                <select
                  value={selectedMonth || ''}
                  onChange={(e) => handleMonthSelect(e.target.value || null)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">-- Select a month --</option>
                  {availableMonths.map((month) => (
                    <option key={month.value} value={month.value}>
                      {month.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Quick range
                </label>
                <select
                  value={rangePreset}
                  onChange={(e) => {
                    const preset = e.target.value;
                    setRangePreset(preset);
                    const range = getRangePresetDates(preset);
                    if (range) {
                      setSelectedMonth(null);
                      setStartDate(range.start);
                      setEndDate(range.end);
                      loadStats(range.start, range.end);
                    }
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Custom range</option>
                  <option value="last7">Last 7 days</option>
                  <option value="last14">Last 14 days</option>
                  <option value="last30">Last 30 days</option>
                  <option value="last90">Last 90 days</option>
                  <option value="thisWeek">This week (Mon–today)</option>
                  <option value="lastWeek">Last week</option>
                  <option value="currentMonth">Current month</option>
                  <option value="previousMonth">Previous month</option>
                </select>
              </div>
            </div>
            
            <div className="flex gap-6 items-end">
              <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Start Date: {startDate} (UTC)
                  </label>
                <input
                  type="date"
                  value={startDate.split('T')[0]}
                  onChange={(e) => {
                    const newStartDate = e.target.value + 'T00:00:00';
                    setStartDate(newStartDate);
                    setSelectedMonth(null);
                    setRangePreset('');
                    loadStats(newStartDate, endDate);
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  End Date: {endDate} (UTC)
                </label>
                <input
                  type="date"
                  value={endDate.split('T')[0]}
                  onChange={(e) => {
                    const newEndDate = e.target.value + 'T23:59:59';
                    setEndDate(newEndDate);
                    setSelectedMonth(null);
                    setRangePreset('');
                    loadStats(startDate, newEndDate);
                  }}
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
            description="Track performance trends over time"
            periodLabel="Week"
            loading={loadingWeekly}
          />
        )}

        {comparisonView === 'monthly' && (
          <ComparisonTable
            data={monthlyStats}
            title="Monthly Comparison (Since July)"
            description="Track monthly performance trends"
            periodLabel="Month"
            loading={loadingMonthly}
          />
        )}

        {comparisonView === 'daily' && (
          <ComparisonTable
            data={dailyStats}
            title={`Daily Comparison (Last ${selectedDays} Days)`}
            description="Track daily performance trends"
            periodLabel="Day"
            loading={loadingDaily}
          />
        )}

        {/* Purchase Log View - Kajabi only, with Purchases / Lock-ins / Payoffs tabs */}
        {comparisonView === 'none' && viewMode === 'purchases' && (() => {
          const { lockInKajabiId, payoffKajabiId } = specialOfferIds;
          const lockInPurchases = purchases.filter((p) =>
            p.treatment_override === 'lock_in' || (!p.treatment_override && lockInKajabiId && String(p.offer_id) === String(lockInKajabiId))
          );
          const payoffPurchases = purchases.filter((p) =>
            p.treatment_override === 'payoff' || (!p.treatment_override && payoffKajabiId && String(p.offer_id) === String(payoffKajabiId))
          );
          const mainPurchases = purchases.filter((p) =>
            p.treatment_override === 'purchase' || (!p.treatment_override && (!lockInKajabiId || String(p.offer_id) !== String(lockInKajabiId)) && (!payoffKajabiId || String(p.offer_id) !== String(payoffKajabiId)))
          );
          const tabPurchases = purchaseLogTab === 'lockins' ? lockInPurchases : purchaseLogTab === 'payoffs' ? payoffPurchases : mainPurchases;
          const filteredTabPurchases = tabPurchases.filter(
            (row) =>
              (!purchaseLogCloserFilter || row.closer_name === purchaseLogCloserFilter) &&
              (!purchaseLogSetterFilter || row.setter_name === purchaseLogSetterFilter)
          );
          const handleTreatmentOverride = async (treatment) => {
            const row = purchaseContextMenu?.row;
            if (!row?.purchase_id) return;
            const id = String(row.purchase_id);
            try {
              if (treatment == null) {
                await supabase.from('purchase_treatment_override').delete().eq('kajabi_purchase_id', id);
              } else {
                await supabase.from('purchase_treatment_override').upsert({ kajabi_purchase_id: id, treatment }, { onConflict: 'kajabi_purchase_id' });
              }
              await refetchPurchases();
            } catch (e) {
              console.error('Failed to save purchase treatment override:', e);
            }
            setPurchaseContextMenu(null);
          };

          return (
            <>
            <div className="bg-white rounded-lg shadow">
              <div className="p-4 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">Purchase Log (Kajabi)</h2>
                <div className="flex flex-wrap items-center gap-4 mt-3">
                  <div className="flex gap-1 border-b border-gray-200">
                    <button
                      type="button"
                      onClick={() => setPurchaseLogTab('purchases')}
                      className={`px-4 py-2 text-sm font-medium rounded-t border border-b-0 -mb-px ${
                        purchaseLogTab === 'purchases' ? 'bg-white border-gray-300 text-gray-900' : 'bg-gray-100 border-transparent text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      Purchases
                    </button>
                    <button
                      type="button"
                      onClick={() => setPurchaseLogTab('lockins')}
                      className={`px-4 py-2 text-sm font-medium rounded-t border border-b-0 -mb-px ${
                        purchaseLogTab === 'lockins' ? 'bg-white border-gray-300 text-gray-900' : 'bg-gray-100 border-transparent text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      Lock-ins
                    </button>
                    <button
                      type="button"
                      onClick={() => setPurchaseLogTab('payoffs')}
                      className={`px-4 py-2 text-sm font-medium rounded-t border border-b-0 -mb-px ${
                        purchaseLogTab === 'payoffs' ? 'bg-white border-gray-300 text-gray-900' : 'bg-gray-100 border-transparent text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      Payoffs
                    </button>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <span>Closer:</span>
                    <select
                      value={purchaseLogCloserFilter}
                      onChange={(e) => setPurchaseLogCloserFilter(e.target.value)}
                      className="px-3 py-1.5 border border-gray-300 rounded-md bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-w-[120px]"
                    >
                      <option value="">All</option>
                      {(closersList || []).map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <span>Setter:</span>
                    <select
                      value={purchaseLogSetterFilter}
                      onChange={(e) => setPurchaseLogSetterFilter(e.target.value)}
                      className="px-3 py-1.5 border border-gray-300 rounded-md bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-w-[120px]"
                    >
                      <option value="">All</option>
                      {(settersList || []).map((s) => (
                        <option key={s.id} value={s.name}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="text-sm text-gray-500">
                    {filteredTabPurchases.length} purchase{filteredTabPurchases.length !== 1 ? 's' : ''} in this tab
                    {(purchaseLogCloserFilter || purchaseLogSetterFilter) && ` (filtered)`}
                  </p>
                </div>
              </div>
              {purchasesLoading ? (
                <div className="p-8 text-center text-gray-500">Loading purchases...</div>
              ) : filteredTabPurchases.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  {purchases.length === 0
                    ? 'No Kajabi purchases found for this date range.'
                    : tabPurchases.length === 0
                      ? `No ${purchaseLogTab === 'lockins' ? 'lock-ins' : purchaseLogTab === 'payoffs' ? 'payoffs' : 'other purchases'} in this date range.`
                      : 'No purchases match the selected closer/setter filters.'}
                </div>
              ) : (
                <div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 2fr 1.5fr 1.5fr 1fr 1.2fr 1.2fr',
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
                    <div>Name</div>
                    <div>Email</div>
                    <div>Purchase Date</div>
                    <div>Offer</div>
                    <div>Amount</div>
                    <div>Closer</div>
                    <div>Setter</div>
                  </div>
                  {filteredTabPurchases.map((row) => (
                    <KajabiPurchaseRow
                      key={row._rowKey}
                      row={row}
                      onOpenLinkModal={(customer) => {
                        setLinkModalCustomer(customer);
                        setLinkModalOpen(true);
                      }}
                      onContextMenu={(e, r) => setPurchaseContextMenu({ x: e.clientX, y: e.clientY, row: r })}
                    />
                  ))}
                </div>
              )}
            </div>
            {purchaseContextMenu && (
              <div
                className="bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[180px] z-[9999]"
                style={{ position: 'fixed', left: purchaseContextMenu.x, top: purchaseContextMenu.y }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  onClick={() => handleTreatmentOverride('purchase')}
                >
                  Treat as Purchase
                </button>
                <button
                  type="button"
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  onClick={() => handleTreatmentOverride('lock_in')}
                >
                  Treat as Lock-in
                </button>
                <button
                  type="button"
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  onClick={() => handleTreatmentOverride('payoff')}
                >
                  Treat as Payoff
                </button>
                {purchaseContextMenu.row?.treatment_override && (
                  <button
                    type="button"
                    className="w-full text-left px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 border-t border-gray-100"
                    onClick={() => handleTreatmentOverride(null)}
                  >
                    Clear override
                  </button>
                )}
              </div>
            )}
          </>
          );
        })()}

        {/* Overall Metrics Grid - Only show if not in comparison view and in stats mode */}
        {comparisonView === 'none' && viewMode === 'stats' && (
        <div className="relative">
          {loading && (
            <div className="absolute inset-0 bg-gray-50 bg-opacity-75 flex items-center justify-center z-10 rounded-lg" style={{ minHeight: '400px' }}>
              <div className="text-lg text-gray-600 font-medium">Loading metrics...</div>
            </div>
          )}
        {/* Booked calls per day (organic / ads / rescheduled) */}
        {stats?.bookingsPerDay?.length > 0 && (
          <div className="bg-white p-6 rounded-lg shadow mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Booked calls per day</h2>
              <button
                type="button"
                onClick={() => setHideReschedulesInChart((v) => !v)}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                  hideReschedulesInChart
                    ? 'bg-amber-100 text-amber-800 border-amber-300'
                    : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'
                }`}
              >
                {hideReschedulesInChart ? 'Show reschedules' : 'Hide reschedules'}
              </button>
            </div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={
                    hideReschedulesInChart
                      ? stats.bookingsPerDay.map((row) => ({
                          date: row.date,
                          organic: row.organic,
                          ads: row.ads,
                          rescheduled: 0,
                          total: row.organic + row.ads,
                        }))
                      : stats.bookingsPerDay
                  }
                  margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => (v ? v.slice(5) : '')}
                  />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length || !label) return null;
                      const row = payload[0]?.payload;
                      if (!row) return null;
                      const total = hideReschedulesInChart ? row.organic + row.ads : row.total;
                      return (
                        <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-sm">
                          <div className="font-medium text-gray-900 mb-1">{label}</div>
                          <div className="text-green-600">Organic: {row.organic}</div>
                          <div className="text-blue-600">Ads: {row.ads}</div>
                          {!hideReschedulesInChart && (
                            <div className="text-amber-600">Rescheduled: {row.rescheduled}</div>
                          )}
                          <div className="text-gray-700 border-t border-gray-100 mt-1 pt-1">
                            {hideReschedulesInChart
                              ? `Total (excl. rescheduled): ${total}`
                              : `Total: ${total}`}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Legend />
                  <Bar dataKey="organic" name="Organic" stackId="booked" fill="#22c55e" />
                  <Bar dataKey="ads" name="Ads" stackId="booked" fill="#3b82f6" />
                  {!hideReschedulesInChart && (
                    <Bar dataKey="rescheduled" name="Rescheduled" stackId="booked" fill="#f59e0b" />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {/* Pick Up Rate */}
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-500">Pick Up Rate</h3>
              <span className="text-xs text-gray-400">Picked Up / Booked in Period</span>
            </div>
            <div className="text-3xl font-bold text-blue-600">
              {pickUpRate.toFixed(1)}%
            </div>
            <div className="text-sm text-gray-500 mt-2">
              {totalPickedUpFromBookings || 0} / {totalBookedInPeriod || 0} bookings
            </div>
            {sourceFilter === 'all' && stats && stats.sourceStats && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="flex justify-between text-xs">
                  <div className="text-blue-600">
                    Ads: {stats.sourceStats.ads.pickUpRate.toFixed(1)}%
                  </div>
                  <div className="text-green-600">
                    Organic: {stats.sourceStats.organic.pickUpRate.toFixed(1)}%
                  </div>
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <div>{stats.sourceStats.ads.pickedUpFromBookings}/{stats.sourceStats.ads.bookingsMadeInPeriod}</div>
                  <div>{stats.sourceStats.organic.pickedUpFromBookings}/{stats.sourceStats.organic.bookingsMadeInPeriod}</div>
                </div>
              </div>
            )}
            {sourceFilter === 'ads' && stats && stats.mediumStats && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="flex justify-between text-xs">
                  <div className="text-purple-600">
                    TikTok: {stats.mediumStats.tiktok.pickUpRate.toFixed(1)}%
                  </div>
                  <div className="text-pink-600">
                    Instagram: {stats.mediumStats.instagram.pickUpRate.toFixed(1)}%
                  </div>
                  <div className="text-gray-600">
                    Other: {stats.mediumStats.other.pickUpRate.toFixed(1)}%
                  </div>
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <div>{stats.mediumStats.tiktok.pickedUpFromBookings}/{stats.mediumStats.tiktok.bookingsMadeInPeriod}</div>
                  <div>{stats.mediumStats.instagram.pickedUpFromBookings}/{stats.mediumStats.instagram.bookingsMadeInPeriod}</div>
                  <div>{stats.mediumStats.other.pickedUpFromBookings}/{stats.mediumStats.other.bookingsMadeInPeriod}</div>
                </div>
              </div>
            )}
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
            {sourceFilter === 'all' && stats && stats.sourceStats && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="flex justify-between text-xs">
                  <div className="text-blue-600">
                    Ads: {stats.sourceStats.ads.showUpRate.toFixed(1)}%
                  </div>
                  <div className="text-green-600">
                    Organic: {stats.sourceStats.organic.showUpRate.toFixed(1)}%
                  </div>
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <div>{stats.sourceStats.ads.totalShowedUp}/{stats.sourceStats.ads.totalConfirmed}</div>
                  <div>{stats.sourceStats.organic.totalShowedUp}/{stats.sourceStats.organic.totalConfirmed}</div>
                </div>
              </div>
            )}
            {sourceFilter === 'ads' && stats && stats.mediumStats && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="flex justify-between text-xs">
                  <div className="text-purple-600">
                    TikTok: {stats.mediumStats.tiktok.showUpRate.toFixed(1)}%
                  </div>
                  <div className="text-pink-600">
                    Instagram: {stats.mediumStats.instagram.showUpRate.toFixed(1)}%
                  </div>
                  <div className="text-gray-600">
                    Other: {stats.mediumStats.other.showUpRate.toFixed(1)}%
                  </div>
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <div>{stats.mediumStats.tiktok.totalShowedUp}/{stats.mediumStats.tiktok.totalConfirmed}</div>
                  <div>{stats.mediumStats.instagram.totalShowedUp}/{stats.mediumStats.instagram.totalConfirmed}</div>
                  <div>{stats.mediumStats.other.totalShowedUp}/{stats.mediumStats.other.totalConfirmed}</div>
                </div>
              </div>
            )}
          </div>

          {/* DQ Rate (Don't Qualify): picked up = yes, confirmed = no */}
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-500">DQ Rate</h3>
              <span className="text-xs text-gray-400">Don't qualify (picked up, not confirmed)</span>
            </div>
            <div className="text-3xl font-bold text-amber-600">
              {(dqRate ?? 0).toFixed(1)}%
            </div>
            <div className="text-sm text-gray-500 mt-2">
              {totalDQ ?? 0} / {totalPickedUp ?? 0} picked up
            </div>
            {sourceFilter === 'all' && stats && stats.sourceStats && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="flex justify-between text-xs">
                  <div className="text-blue-600">
                    Ads: {stats.sourceStats.ads?.totalPickedUp > 0
                      ? (((stats.sourceStats.ads.totalPickedUp - (stats.sourceStats.ads.totalConfirmed ?? 0)) / stats.sourceStats.ads.totalPickedUp) * 100).toFixed(1)
                      : '0'}%
                  </div>
                  <div className="text-green-600">
                    Organic: {stats.sourceStats.organic?.totalPickedUp > 0
                      ? (((stats.sourceStats.organic.totalPickedUp - (stats.sourceStats.organic.totalConfirmed ?? 0)) / stats.sourceStats.organic.totalPickedUp) * 100).toFixed(1)
                      : '0'}%
                  </div>
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <div>{(stats.sourceStats.ads?.totalPickedUp ?? 0) - (stats.sourceStats.ads?.totalConfirmed ?? 0)}/{stats.sourceStats.ads?.totalPickedUp ?? 0}</div>
                  <div>{(stats.sourceStats.organic?.totalPickedUp ?? 0) - (stats.sourceStats.organic?.totalConfirmed ?? 0)}/{stats.sourceStats.organic?.totalPickedUp ?? 0}</div>
                </div>
              </div>
            )}
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
              {totalShowedUp} / {totalBooked} calls
            </div>
            {sourceFilter === 'all' && stats && stats.sourceStats && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="flex justify-between text-xs">
                  <div className="text-blue-600">
                    Ads: {stats.sourceStats.ads.showUpRate.toFixed(1)}%
                  </div>
                  <div className="text-green-600">
                    Organic: {stats.sourceStats.organic.showUpRate.toFixed(1)}%
                  </div>
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <div>{stats.sourceStats.ads.totalShowedUp}/{stats.sourceStats.ads.totalBooked}</div>
                  <div>{stats.sourceStats.organic.totalShowedUp}/{stats.sourceStats.organic.totalBooked}</div>
                </div>
              </div>
            )}
            {sourceFilter === 'ads' && stats && stats.mediumStats && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="flex justify-between text-xs">
                  <div className="text-purple-600">
                    TikTok: {stats.mediumStats.tiktok.showUpRate.toFixed(1)}%
                  </div>
                  <div className="text-pink-600">
                    Instagram: {stats.mediumStats.instagram.showUpRate.toFixed(1)}%
                  </div>
                  <div className="text-gray-600">
                    Other: {stats.mediumStats.other.showUpRate.toFixed(1)}%
                  </div>
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <div>{stats.mediumStats.tiktok.totalShowedUp}/{stats.mediumStats.tiktok.totalBooked}</div>
                  <div>{stats.mediumStats.instagram.totalShowedUp}/{stats.mediumStats.instagram.totalBooked}</div>
                  <div>{stats.mediumStats.other.totalShowedUp}/{stats.mediumStats.other.totalBooked}</div>
                </div>
              </div>
            )}
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
            {sourceFilter === 'all' && stats && stats.sourceStats && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="flex justify-between text-xs">
                  <div className="text-blue-600">
                    Ads: {stats.sourceStats.ads.conversionRate.toFixed(1)}%
                  </div>
                  <div className="text-green-600">
                    Organic: {stats.sourceStats.organic.conversionRate.toFixed(1)}%
                  </div>
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <div>{stats.sourceStats.ads.totalPurchased}/{stats.sourceStats.ads.totalShowedUp}</div>
                  <div>{stats.sourceStats.organic.totalPurchased}/{stats.sourceStats.organic.totalShowedUp}</div>
                </div>
              </div>
            )}
            {sourceFilter === 'ads' && stats && stats.mediumStats && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="flex justify-between text-xs">
                  <div className="text-purple-600">
                    TikTok: {stats.mediumStats.tiktok.conversionRate.toFixed(1)}%
                  </div>
                  <div className="text-pink-600">
                    Instagram: {stats.mediumStats.instagram.conversionRate.toFixed(1)}%
                  </div>
                  <div className="text-gray-600">
                    Other: {stats.mediumStats.other.conversionRate.toFixed(1)}%
                  </div>
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <div>{stats.mediumStats.tiktok.totalPurchased}/{stats.mediumStats.tiktok.totalShowedUp}</div>
                  <div>{stats.mediumStats.instagram.totalPurchased}/{stats.mediumStats.instagram.totalShowedUp}</div>
                  <div>{stats.mediumStats.other.totalPurchased}/{stats.mediumStats.other.totalShowedUp}</div>
                </div>
              </div>
            )}
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
              {totalPurchased} / {totalBooked} calls
            </div>
            {sourceFilter === 'all' && stats && stats.sourceStats && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="flex justify-between text-xs">
                  <div className="text-blue-600">
                    Ads: {stats.sourceStats.ads.totalBooked > 0 ? ((stats.sourceStats.ads.totalPurchased / stats.sourceStats.ads.totalBooked) * 100).toFixed(1) : 0}%
                  </div>
                  <div className="text-green-600">
                    Organic: {stats.sourceStats.organic.totalBooked > 0 ? ((stats.sourceStats.organic.totalPurchased / stats.sourceStats.organic.totalBooked) * 100).toFixed(1) : 0}%
                  </div>
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <div>{stats.sourceStats.ads.totalPurchased}/{stats.sourceStats.ads.totalBooked}</div>
                  <div>{stats.sourceStats.organic.totalPurchased}/{stats.sourceStats.organic.totalBooked}</div>
                </div>
              </div>
            )}
            {sourceFilter === 'ads' && stats && stats.mediumStats && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="flex justify-between text-xs">
                  <div className="text-purple-600">
                    TikTok: {stats.mediumStats.tiktok.totalBooked > 0 ? ((stats.mediumStats.tiktok.totalPurchased / stats.mediumStats.tiktok.totalBooked) * 100).toFixed(1) : 0}%
                  </div>
                  <div className="text-pink-600">
                    Instagram: {stats.mediumStats.instagram.totalBooked > 0 ? ((stats.mediumStats.instagram.totalPurchased / stats.mediumStats.instagram.totalBooked) * 100).toFixed(1) : 0}%
                  </div>
                  <div className="text-gray-600">
                    Other: {stats.mediumStats.other.totalBooked > 0 ? ((stats.mediumStats.other.totalPurchased / stats.mediumStats.other.totalBooked) * 100).toFixed(1) : 0}%
                  </div>
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <div>{stats.mediumStats.tiktok.totalPurchased}/{stats.mediumStats.tiktok.totalBooked}</div>
                  <div>{stats.mediumStats.instagram.totalPurchased}/{stats.mediumStats.instagram.totalBooked}</div>
                  <div>{stats.mediumStats.other.totalPurchased}/{stats.mediumStats.other.totalBooked}</div>
                </div>
              </div>
            )}
          </div>

          {/* Rescheduleds */}
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-500">Rescheduled Calls</h3>
              <span className="text-xs text-gray-400">Total Rescheduled</span>
            </div>
            <div className="text-3xl font-bold text-orange-600">
              {totalRescheduled}
            </div>
            <div className="text-sm text-gray-500 mt-2">
              {totalBooked > 0 
                ? ((totalRescheduled / totalBooked) * 100).toFixed(1) 
                : 0}% of total calls
            </div>
            {sourceFilter === 'all' && stats && stats.sourceStats && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="flex justify-between text-xs">
                  <div className="text-blue-600">
                    Ads: {stats.sourceStats.ads.totalBooked > 0 ? ((stats.sourceStats.ads.totalRescheduled) / stats.sourceStats.ads.totalBooked * 100).toFixed(1) : 0}%
                  </div>
                  <div className="text-green-600">
                    Organic: {stats.sourceStats.organic.totalBooked > 0 ? ((stats.sourceStats.organic.totalRescheduled) / stats.sourceStats.organic.totalBooked * 100).toFixed(1) : 0}%
                  </div>
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <div>{stats.sourceStats.ads.totalRescheduled}/{stats.sourceStats.ads.totalBooked}</div>
                  <div>{stats.sourceStats.organic.totalRescheduled}/{stats.sourceStats.organic.totalBooked}</div>
                </div>
              </div>
            )}
            {sourceFilter === 'ads' && stats && stats.mediumStats && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="flex justify-between text-xs">
                  <div className="text-purple-600">
                    TikTok: {stats.mediumStats.tiktok.totalBooked > 0 ? ((stats.mediumStats.tiktok.totalRescheduled) / stats.mediumStats.tiktok.totalBooked * 100).toFixed(1) : 0}%
                  </div>
                  <div className="text-pink-600">
                    Instagram: {stats.mediumStats.instagram.totalBooked > 0 ? ((stats.mediumStats.instagram.totalRescheduled) / stats.mediumStats.instagram.totalBooked * 100).toFixed(1) : 0}%
                  </div>
                  <div className="text-gray-600">
                    Other: {stats.mediumStats.other.totalBooked > 0 ? ((stats.mediumStats.other.totalRescheduled) / stats.mediumStats.other.totalBooked * 100).toFixed(1) : 0}%
                  </div>
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <div>{stats.mediumStats.tiktok.totalRescheduled}/{stats.mediumStats.tiktok.totalBooked}</div>
                  <div>{stats.mediumStats.instagram.totalRescheduled}/{stats.mediumStats.instagram.totalBooked}</div>
                  <div>{stats.mediumStats.other.totalRescheduled}/{stats.mediumStats.other.totalBooked}</div>
                </div>
              </div>
            )}
          </div>

          {/* Total Calls Summary */}
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-6 rounded-lg shadow text-white">
            <h3 className="text-sm font-medium mb-2 opacity-90">Total Calls</h3>
            <div className="text-3xl font-bold">{totalShowedUp}</div>
            <div className="text-sm mt-2 opacity-90">
              {totalPurchased} closed deals
            </div>
            {sourceFilter === 'all' && stats && stats.sourceStats && (
              <div className="mt-3 pt-3 border-t border-white/20">
                <div className="flex justify-between text-xs opacity-90">
                  <div>
                    Ads: {stats.sourceStats.ads.totalShowedUp}
                  </div>
                  <div>
                    Organic: {stats.sourceStats.organic.totalShowedUp}
                  </div>
                </div>
                <div className="flex justify-between text-xs opacity-70 mt-1">
                  <div>{stats.sourceStats.ads.totalPurchased} deals</div>
                  <div>{stats.sourceStats.organic.totalPurchased} deals</div>
                </div>
              </div>
            )}
            {sourceFilter === 'ads' && stats && stats.mediumStats && (
              <div className="mt-3 pt-3 border-t border-white/20">
                <div className="flex justify-between text-xs opacity-90">
                  <div>
                    TikTok: {stats.mediumStats.tiktok.totalShowedUp}
                  </div>
                  <div>
                    Instagram: {stats.mediumStats.instagram.totalShowedUp}
                  </div>
                  <div>
                    Other: {stats.mediumStats.other.totalShowedUp}
                  </div>
                </div>
                <div className="flex justify-between text-xs opacity-70 mt-1">
                  <div>{stats.mediumStats.tiktok.totalPurchased} deals</div>
                  <div>{stats.mediumStats.instagram.totalPurchased} deals</div>
                  <div>{stats.mediumStats.other.totalPurchased} deals</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Conversion Rate by Closer */}
        {/* IMPORTANT: Conversion rates are calculated using UTC-normalized date ranges
            Show-ups are counted from calls filtered by UTC call_date
            Purchases are counted from outcome_log filtered by UTC purchase_date
            This ensures accurate conversion rates consistent with UTC timezone */}
        {stats && stats.closers && stats.closers.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-900">Conversion Rate by Closer</h2>
            <p className="text-sm text-gray-500 mt-1">Purchased / Showed Up per closer (UTC-normalized)</p>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Closer
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Showed up
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Purchased
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Conversion Rate
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {stats.closers.map((closer) => {
                  const conversionRate = closer.showedUp > 0 
                    ? (closer.purchased / closer.showedUp) * 100 
                    : 0;
                  
                  return (
                    <tr key={closer.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900" onClick={() => navigate(`/closer-stats/${closer.id}`)} onMouseEnter={(e) => e.currentTarget.style.cursor = 'pointer'}>{closer.name} </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="text-sm text-gray-900">{closer.showedUp}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="text-sm font-semibold text-green-600">{closer.purchased}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="inline-flex items-center">
                          <span className={`text-lg font-bold ${
                            conversionRate >= 70 ? 'text-green-600' :
                            conversionRate >= 50 ? 'text-yellow-600' :
                            'text-red-600'
                          }`}>
                            {conversionRate.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        )}

        {/* Setter Stats - Pick Up Rate and Show Up Rate */}
        {stats && stats.setters && stats.setters.length > 0 && (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">Setter Performance</h2>
              <p className="text-sm text-gray-500 mt-1">Pick Up Rate and Show Up Rate per setter</p>
            </div>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Setter
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Booked
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Picked Up
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Pick Up Rate
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Confirmed
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Showed Up
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Show Up Rate
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Purchases
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {stats.setters.map((setter) => {
                    return (
                      <tr key={setter.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900" onClick={() => navigate(`/setter/${setter.id}`)} onMouseEnter={(e) => e.currentTarget.style.cursor = 'pointer'}>
                            {setter.name}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <div className="text-sm text-gray-900">{setter.totalBooked}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <div className="text-sm text-gray-900">{setter.totalPickedUp}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <div className="inline-flex items-center">
                            <span className={`text-lg font-bold ${
                              setter.pickUpRate >= 70 ? 'text-green-600' :
                              setter.pickUpRate >= 50 ? 'text-yellow-600' :
                              'text-red-600'
                            }`}>
                              {setter.pickUpRate.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <div className="text-sm text-gray-900">{setter.totalConfirmed}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <div className="text-sm text-gray-900">{setter.totalShowedUp}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <div className="inline-flex items-center">
                            <span className={`text-lg font-bold ${
                              setter.showUpRate >= 70 ? 'text-green-600' :
                              setter.showUpRate >= 50 ? 'text-yellow-600' :
                              'text-red-600'
                            }`}>
                              {setter.showUpRate.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <div className="text-sm font-semibold text-gray-900">{setter.totalPurchased || 0}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

          {/* Country Sales Table */}
          {stats && stats.countries && stats.countries.length > 0 && (
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Sales by Country</h3>
              <p className="mt-1 text-sm text-gray-500">Performance metrics grouped by phone number country</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Country
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total Booked
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
                  {stats.countries.map((country, index) => (
                    <tr key={country.country} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="text-sm font-medium text-gray-900">
                            {country.country}
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
                        <div className="text-sm text-gray-900">{country.totalBooked}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="text-sm text-gray-900">{country.pickUpRate.toFixed(1)}%</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="text-sm text-gray-900">{country.showUpRate.toFixed(1)}%</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="text-sm font-semibold text-green-600">{country.totalPurchased}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="inline-flex items-center">
                          <span className={`text-lg font-bold ${
                            country.conversionRate >= 70 ? 'text-green-600' :
                            country.conversionRate >= 50 ? 'text-yellow-600' :
                            'text-red-600'
                          }`}>
                            {country.conversionRate.toFixed(1)}%
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
        </div>
        )}
      </div>
    </div>
    {linkModalOpen && linkModalCustomer && (
      <LinkKajabiCustomerModal
        open={linkModalOpen}
        customer={linkModalCustomer}
        onClose={() => {
          setLinkModalOpen(false);
          setLinkModalCustomer(null);
        }}
        onLinked={async () => {
          setPurchasesLoading(true);
          try {
            const result = await fetchKajabiPurchasesForDateRange(startDate, endDate);
            setPurchases(result.purchases);
            setSpecialOfferIds({ lockInKajabiId: result.lockInKajabiId, payoffKajabiId: result.payoffKajabiId });
          } catch (e) {
            console.error('Error refetching Kajabi purchases:', e);
          }
          setPurchasesLoading(false);
        }}
      />
    )}
  </div>
  );
}