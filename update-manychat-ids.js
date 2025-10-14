const SUPABASE_URL = "https://ewutthaqmnvdxhcunbci.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV3dXR0aGFxbW52ZHhoY3VuYmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcxNDgyNjgsImV4cCI6MjA3MjcyNDI2OH0.dMQPQPJIZVnsDde2C09ZniR52eEn7zAVgpOBiMA_Qs8";
const MANYCHAT_API_TOKEN = "1237190:108ada6f750c8dba23c7702931473162";

async function findAndUpdateManyChatIds() {
  // 1. Get all calls without manychat_user_id
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/calls?manychat_user_id=is.null&select=id,phone,email`,
    {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    }
  );
  
  const calls = await response.json();
  
  if (!calls || !Array.isArray(calls)) {
    console.error('Error fetching calls:', calls);
    return;
  }

  console.log(`Found ${calls.length} calls without ManyChat ID`);

  // Build array of updates
  const updates = [];
    let counter = 1;

  for (const call of calls) {
    let manychatUserId = null;

    // Try finding by phone first
    if (call.phone) {
      try {
        const phoneSearch = await fetch(
          `https://api.manychat.com/fb/subscriber/findBySystemField?phone=${encodeURIComponent(call.phone)}`,
          {
            headers: {
              'Authorization': `Bearer ${MANYCHAT_API_TOKEN}`,
              'Content-Type': 'application/json'
            }
          }
        ).then(r => r.json());

        if (phoneSearch.status === 'success' && phoneSearch.data) {
          manychatUserId = phoneSearch.data.id;
          console.log(`✓ Found by phone: ${call.phone} → ${manychatUserId}`);
        }
      } catch (error) {
        console.log(`✗ Error searching phone ${call.phone}:`, error.message);
      }
    }

    // If not found by phone, try email
    if (!manychatUserId && call.email) {
      try {
        const emailSearch = await fetch(
          `https://api.manychat.com/fb/subscriber/findBySystemField?email=${encodeURIComponent(call.email)}`,
          {
            headers: {
              'Authorization': `Bearer ${MANYCHAT_API_TOKEN}`,
              'Content-Type': 'application/json'
            }
          }
        ).then(r => r.json());

        if (emailSearch.status === 'success' && emailSearch.data) {
          manychatUserId = emailSearch.data.id;
          console.log(`${counter} Found by email: ${call.email} → ${manychatUserId}`);
        }
      } catch (error) {
        console.log(`✗ Error searching email ${call.email}:`, error.message);
      }
    }

    // Add to updates array if found
    if (manychatUserId) {
      updates.push({
        call_id: call.id,
        manychat_user_id: manychatUserId
      });
    } else {
      console.log(`✗ Not found: ${call.phone} / ${call.email}`);
    }

    console.log(`Processed ${counter} of ${calls.length}`);

    // Rate limiting - wait 200ms between requests
    await new Promise(resolve => setTimeout(resolve, 200));
    counter++;
  }

  console.log(`\n✓ Found ${updates.length} ManyChat IDs`);
  console.log('Now updating database...');

  // Batch update all at once using SQL
  if (updates.length > 0) {
    const updateCases = updates.map(u => 
      `WHEN id = '${u.call_id}' THEN ${u.manychat_user_id}`
    ).join('\n    ');
    
    const ids = updates.map(u => `'${u.call_id}'`).join(', ');

    const sql = `
      UPDATE calls
      SET manychat_user_id = CASE
        ${updateCases}
      END
      WHERE id IN (${ids});
    `;

    const updateResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/exec_sql`,
      {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: sql })
      }
    );

    if (updateResponse.ok) {
      console.log(`✓ Updated ${updates.length} calls in database!`);
    } else {
      // Fallback: update one by one if batch fails
      console.log('Batch update not available, updating individually...');
      let counter = 1;
      for (const update of updates) {
        await fetch(
          `${SUPABASE_URL}/rest/v1/calls?id=eq.${update.call_id}`,
          {
            method: 'PATCH',
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ manychat_user_id: update.manychat_user_id })
          }
        );
        console.log(`✓ Updated ${counter} of ${updates.length}`);
        counter++;
      }
      console.log(`✓ Updated ${updates.length} calls individually!`);
    }
  }

  console.log('✓ Done!');
}

findAndUpdateManyChatIds();