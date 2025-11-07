// Basic Calendly API fetch script
// Add your URL and handle the response

import fs from 'fs';

const PAT = 'eyJraWQiOiIxY2UxZTEzNjE3ZGNmNzY2YjNjZWJjY2Y4ZGM1YmFmYThhNjVlNjg0MDIzZjdjMzJiZTgzNDliMjM4MDEzNWI0IiwidHlwIjoiUEFUIiwiYWxnIjoiRVMyNTYifQ.eyJpc3MiOiJodHRwczovL2F1dGguY2FsZW5kbHkuY29tIiwiaWF0IjoxNzU5MTQyODUwLCJqdGkiOiIyNTQxMTBjNC1iMzQ5LTQzMzQtODdhOS0xY2FlYWRhMmVjYTEiLCJ1c2VyX3V1aWQiOiIzZWQyOTYzNC1iYzY5LTQ4MjYtOGU2Yy1mNzJjMWEzZWIxMzgifQ.nB3bY9P-R8eezA0_Rk8QtAfo-3Hq8QqEASfLhCYJ8xIiiouBrGOLtT-MGyg7Xqmw0Y7VX-RHQBQxklpYAAtGFQ';
const base = 'https://api.calendly.com';
const CACHE_FILE = 'calendly-uris-cache.json';

// Basic fetch function
async function fetchCalendly(url) {
  const fullUrl = url.startsWith('http') ? url : `${base}${url}`;
  const resp = await fetch(fullUrl, {
    headers: { Authorization: `Bearer ${PAT}` }
  });
  
  if (!resp.ok) {
    const errorText = await resp.text();
    throw new Error(`API error: ${resp.status} - ${errorText}`);
  }
  
  return await resp.json();
}

// Load cached URIs from file
function loadCachedUris() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = fs.readFileSync(CACHE_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.log('No cache file found or error reading cache');
  }
  return null;
}

// Save URIs to cache file
function saveCachedUris(uris) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(uris, null, 2), 'utf8');
    console.log(`✅ Saved ${uris.length} URIs to ${CACHE_FILE}`);
  } catch (error) {
    console.error('Error saving cache:', error.message);
  }
}

// Example usage - add your URL here
async function main() {
  try {
    // Check if we have cached URIs
    const cachedUris = loadCachedUris();
    if (cachedUris && cachedUris.length > 0) {
      console.log(`📦 Loaded ${cachedUris.length} URIs from cache (${CACHE_FILE})`);
      console.log('To fetch fresh data, delete the cache file and run again.');
      return cachedUris;
    }
    
    // Add your Calendly API URL here
    const url = 'https://api.calendly.com/scheduled_events?group=https://api.calendly.com/groups/b60306c4-1b14-425c-9fed-cbb3f21f4cda&count=100'; // <-- Add your URL here
    
    console.log('Fetching from API...');
    const data = await fetchCalendly(url);
    
    // Collect all URIs from paginated results
    let allUris = [];
    let currentData = data;
    let pageCounter = 1;

    // Loop while there is a next page
    while (true) {
      if (currentData.collection && Array.isArray(currentData.collection)) {
        allUris.push(
          ...currentData.collection
            .filter(item => item.event_type === "https://api.calendly.com/event_types/393dd8d9-7dc7-4bd7-8875-a3f0a2df40ca")
            .map(item => {
                
                const match = item.uri.match(/\/scheduled_events\/([^/]+)/);
                const uuid = match ? match[1] : null;
                return uuid;
            }));
      }
      if (currentData.pagination && currentData.pagination.next_page) {
        pageCounter++;
        console.log(`Fetching page ${pageCounter}...`);
        currentData = await fetchCalendly(currentData.pagination.next_page);
      } else {
        break;
      }
    }

    console.log(`✅ Fetched ${allUris.length} URIs`);
    
    // Save to cache
    saveCachedUris(allUris);
    
    return allUris;
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Fetch invitees for a single event UUID (handles pagination)
async function fetchInviteesForEvent(uuid) {
  let url = `https://api.calendly.com/scheduled_events/${uuid}/invitees`;
  let allInvitees = [];
  
  try {
    while (url) {
      const data = await fetchCalendly(url);
      allInvitees = allInvitees.concat(data.collection || []);
      url = data.pagination?.next_page || null;
    }
    return allInvitees;
  } catch (error) {
    console.error(`Error fetching invitees for ${uuid}:`, error.message);
    return [];
  }
}

// Process all events and get invitees from cached UUIDs
async function processAllInvitees() {
  // Load UUIDs from cache file
  const uuids = loadCachedUris();
  
  if (!uuids || uuids.length === 0) {
    console.log('No UUIDs found in cache. Run main() first to fetch events.');
    return;
  }
  
  console.log(`\nProcessing ${uuids.length} events to get invitees...\n`);
  
  const allInvitees = [];
  
  for (let i = 0; i < uuids.length; i++) {
    const uuid = uuids[i];
    
    if (!uuid) continue; // Skip null/undefined UUIDs
    

      console.log(`Processing event ${i + 1}/${uuids.length}...`);
    
    const invitees = await fetchInviteesForEvent(uuid);
    
    invitees.forEach(invitee => {
      allInvitees.push({
        email: invitee.email || '',
        questions_and_answers: invitee.questions_and_answers || []
      });
    });
    
    // Small delay to avoid rate limiting
    if (i % 10 === 0 && i > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  console.log(`\n✅ Processed ${allInvitees.length} invitees`);
  console.log('\nSample data:');
  console.log(JSON.stringify(allInvitees.slice(0, 3), null, 2));
  
  // Save to file
  const outputFile = 'calendly-invitees.json';
  fs.writeFileSync(outputFile, JSON.stringify(allInvitees, null, 2), 'utf8');
  console.log(`\n✅ Saved to ${outputFile}`);
  
  return allInvitees;
}

// Run the processing
processAllInvitees();
