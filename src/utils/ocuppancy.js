// Node.js version - Convert Google Apps Script to Node.js
async function getDailySlotsTotal() {
    const PAT = 'eyJraWQiOiIxY2UxZTEzNjE3ZGNmNzY2YjNjZWJjY2Y4ZGM1YmFmYThhNjVlNjg0MDIzZjdjMzJiZTgzNDliMjM4MDEzNWI0IiwidHlwIjoiUEFUIiwiYWxnIjoiRVMyNTYifQ.eyJpc3MiOiJodHRwczovL2F1dGguY2FsZW5kbHkuY29tIiwiaWF0IjoxNzU5MTQyODUwLCJqdGkiOiIyNTQxMTBjNC1iMzQ5LTQzMzQtODdhOS0xY2FlYWRhMmVjYTEiLCJ1c2VyX3V1aWQiOiIzZWQyOTYzNC1iYzY5LTQ4MjYtOGU2Yy1mNzJjMWEzZWIxMzgifQ.nB3bY9P-R8eezA0_Rk8QtAfo-3Hq8QqEASfLhCYJ8xIiiouBrGOLtT-MGyg7Xqmw0Y7VX-RHQBQxklpYAAtGFQ';
    const base = 'https://api.calendly.com';
    const TZ = 'Europe/Madrid';
    const SLOT_DURATION_MINUTES = 30; // Duration of each slot in minutes
  
    // Get organization and members
    const me = await getJson(base + '/users/me', PAT);
    const orgUri = me.resource.current_organization;
    const members = await listAllMembers(orgUri, PAT, base);
  
    const included = ["Alessandra", "Samuel", "Emiliano"];
    const users = members
      .map(m => ({
        uri: m.user.uri,
        name: m.user.name,
        timezone: m.user.timezone
      }))
      .filter(u => u.uri && included.includes(u.name));
  
    // Get current week dates
    const week = getWeekDates(TZ);
    const dayLabels = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    
    // Initialize totals array - store as object with date key
    let dailySlots = {}; // { 'YYYY-MM-DD': number of slots }

  
    // Calculate totals for each user and day
    for (const user of users) {
      const schedules = await getJson(base + '/user_availability_schedules?user=' + encodeURIComponent(user.uri), PAT);
      const schedule = pickSchedule(schedules);
  
      if (!schedule || !schedule.collection || !schedule.collection[0]) continue;
  
      const rules = schedule.collection[0].rules || [];
      const weeklyRules = rules.filter(r => r.type === 'wday');
      const dateRules = rules.filter(r => r.type === 'date_specific_hours');




    

  
      week.forEach((date, dayIndex) => {
        const dateStr = formatDate(date, TZ);
        const dowKey = dayLabels[dayIndex].toLowerCase();
  
        // Check for date-specific rules first
        const dateOverride = dateRules.find(r => r.date === dateStr);
        let intervals = [];
  
        if (dateOverride && Array.isArray(dateOverride.intervals)) {
          intervals = dateOverride.intervals;
        } else {

          // Use weekly rules
          weeklyRules.forEach(wr => {
            (wr.intervals || []).forEach(interval => {
              const days = wr.wday || [];
              if (days.includes(dowKey)) {
                intervals.push(interval);
              }

            });
          });
        }
  
        // Calculate hours and convert to slots
        const hours = sumIntervalsHours(intervals);


        // console.log(user.name, 'hours', hours, 'slots', slots, 'dateStr', dateStr);
        
        // Add slots to daily total
        if (!dailySlots[dateStr]) {
          dailySlots[dateStr] = 0;
        }
        dailySlots[dateStr] += hours;
      });

    }



  
    // Return simple format: array of { date, slots }
    return dailySlots;
  }
  
  /* ---------- Helper Functions ---------- */
  
  async function getJson(url, PAT) {
    const resp = await fetch(url, { 
      headers: { Authorization: 'Bearer ' + PAT } 
    });
    return await resp.json();
  }
  
  async function listAllMembers(orgUri, PAT, base) {
    let url = base + '/organization_memberships?organization=' + encodeURIComponent(orgUri);
    let all = [];
    
    while (url) {
      const data = await getJson(url, PAT);
      all = all.concat(data.collection || []);
      url = data.pagination?.next_page || null;
    }
    
    return all;
  }
  
  function pickSchedule(listResponse) {
    if (!listResponse?.collection?.length) return null;
    return listResponse;
  }
  
  function getWeekDates(tz) {
    const now = new Date();
    const today = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    
    // Get Monday of current week
    const dayOfWeek = today.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Monday is 1, Sunday is 0
    const monday = new Date(today);
    monday.setDate(today.getDate() + diff);
    monday.setHours(0, 0, 0, 0);

  
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      days.push(d);
    }
    
    return days;
  }
  
  function formatDate(date, tz) {
    // Format date as YYYY-MM-DD in the given timezone
    return date.toLocaleDateString('en-CA', { timeZone: tz }); // en-CA gives YYYY-MM-DD format
  }
  
  function sumIntervalsHours(intervals) {
    if (!intervals?.length) return 0;
  
    const mins = intervals
      .filter(i => i?.from && i?.to)
      .map(i => [parseHm(i.from), parseHm(i.to)])
      .filter(pair => pair[1] > pair[0])
      .sort((a, b) => a[0] - b[0]);
  
    // Merge overlapping intervals
    const merged = [];
    mins.forEach(iv => {
      if (!merged.length) {
        merged.push(iv);
      } else {
        const last = merged[merged.length - 1];
        if (iv[0] <= last[1]) {
          last[1] = Math.max(last[1], iv[1]);
        } else {
          merged.push(iv);
        }
      }
    });
  
    const totalMinutes = merged.reduce((acc, iv) => acc + (iv[1] - iv[0]), 0);
    return totalMinutes / 60;
  }
  
  function parseHm(timeString) {
    const parts = timeString.split(':').map(n => parseInt(n, 10));
    return (parts[0] || 0) * 60 + (parts[1] || 0);
  }
  
  // Export for use in Node.js
    // Export for use in Node.js
    export { getDailySlotsTotal };

    // If running directly from terminal
//     if (import.meta.url === `file://${process.argv[1]}`) {
//   getDailySlotsTotal()
//     .then(result => {
//       console.log(JSON.stringify(result, null, 2));
//     })
//     .catch(error => {
//       console.error('Error:', error);
//       process.exit(1);
//     });
// }
