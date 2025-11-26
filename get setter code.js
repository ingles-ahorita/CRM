const https = require('https');
const url = require('url');

// First, make API call to get current setter
const apiUrl = 'https://crm.inglesahorita.com/api/current-setter';
const parsedUrl = url.parse(apiUrl);

const options = {
  hostname: parsedUrl.hostname,
  port: parsedUrl.port || 443,
  path: parsedUrl.path,
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
    'User-Agent': 'Zapier/1.0'
  }
};

const SUPABASE_URL = "https://ewutthaqmnvdxhcunbci.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV3dXR0aGFxbW52ZHhoY3VuYmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcxNDgyNjgsImV4cCI6MjA3MjcyNDI2OH0.dMQPQPJIZVnsDde2C09ZniR52eEn7zAVgpOBiMA_Qs8";
const HARDCODED_SETTER_ID = "4275aafd-d9ff-4277-8628-45f645b66b02";

// Function to fetch closer from Supabase
function fetchCloser(closerName) {
  const closerUrl = `${SUPABASE_URL}/rest/v1/closers?name=ilike.${encodeURIComponent(closerName.trim())}&select=name,id`;
  
  return fetch(closerUrl, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    }
  }).then(r => r.json());
}

// Function to fetch setter name and discord_id from Supabase by ID (for dm-setter case)
function fetchSetterDetails(setterId) {
  const setterUrl = `${SUPABASE_URL}/rest/v1/setters?id=eq.${setterId}&select=name,discord_id::text,id`;
  
  return fetch(setterUrl, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    }
  }).then(r => r.json());
}


// Start with API call
const req = https.request(options, (res) => {
  let apiData = '';
  
  res.on('data', (chunk) => {
    apiData += chunk;
  });
  
  res.on('end', () => {
    let apiResult = null;
    
    // Parse API response if successful
    if (res.statusCode === 200) {
      try {
        apiResult = JSON.parse(apiData);
      } catch (error) {
        console.log('API response parse error:', error.message);
      }
    }
    
    // Check if campaign is "dm-setter" - use hardcoded setter ID
    if (inputData.campaign === "dm-setter") {
      const closerName = inputData.Closer;
      
      Promise.all([
        fetchSetterDetails(HARDCODED_SETTER_ID),
        fetchCloser(closerName)
      ])
        .then(([setterData, closerData]) => {
          if (!setterData || setterData.length === 0) {
            callback(new Error(`Setter with ID "${HARDCODED_SETTER_ID}" not found in database`));
            return;
          }
          
          if (!closerData || closerData.length === 0) {
            callback(new Error(`Closer "${closerName}" not found in database`));
            return;
          }

          const setter = setterData[0];
          const closer = closerData[0];
          
          const result = {
            setterId: setter.id,
            setter: setter.name,
            discordId: setter.discord_id,
            closerId: closer.id,
            closerName: closer.name,
            currentDay: new Date().toLocaleDateString('en-ES', {
              weekday: 'long', 
              timeZone: 'Europe/Madrid' 
            }),
            apiData: apiResult,
            apiSuccess: res.statusCode === 200,
            apiStatusCode: res.statusCode,
            campaign: "dm-setter"
          };
          
          callback(null, result);
        })
        .catch(error => {
          callback(error);
        });
      
      return;
    }
    
    // Get setter from API response
    if (!apiResult || !apiResult.success || !apiResult.setter) {
      callback(new Error('No setter found from API'));
      return;
    }
    
    const apiSetter = apiResult.setter;
    const closerName = inputData.Closer;
    
    // Fetch only closer from Supabase (setter data comes from API)
    fetchCloser(closerName)
      .then((closerData) => {
        if (!closerData || closerData.length === 0) {
          callback(new Error(`Closer "${closerName}" not found in database`));
          return;
        }

        const closer = closerData[0];
        
        const result = {
          setterId: apiSetter.id,
          setter: apiSetter.name,
          discordId: apiSetter.discord_id,
          closerId: closer.id,
          closerName: closer.name,
          currentDay: new Date().toLocaleDateString('en-ES', {
            weekday: 'long', 
            timeZone: 'Europe/Madrid' 
          }),
          apiData: apiResult,
          apiSuccess: res.statusCode === 200,
          apiStatusCode: res.statusCode
        };
        
        callback(null, result);
      })
      .catch(error => {
        callback(error);
      });
  });
});

req.on('error', (error) => {
  // Check if campaign is "dm-setter" - use hardcoded setter ID even if API fails
  if (inputData.campaign === "dm-setter") {
    const closerName = inputData.Closer;
    
    Promise.all([
      fetchSetterDetails(HARDCODED_SETTER_ID),
      fetchCloser(closerName)
    ])
      .then(([setterData, closerData]) => {
        if (!setterData || setterData.length === 0) {
          callback(new Error(`Setter with ID "${HARDCODED_SETTER_ID}" not found in database`));
          return;
        }
        
        if (!closerData || closerData.length === 0) {
          callback(new Error(`Closer "${closerName}" not found in database`));
          return;
        }

        const setter = setterData[0];
        const closer = closerData[0];
        
        const result = {
          setterId: setter.id,
          setter: setter.name,
          discordId: setter.discord_id,
          closerId: closer.id,
          closerName: closer.name,
          currentDay: new Date().toLocaleDateString('en-ES', {
            weekday: 'long', 
            timeZone: 'Europe/Madrid' 
          }),
          apiData: null,
          apiSuccess: false,
          apiError: error.message,
          campaign: "dm-setter"
        };
        
        callback(null, result);
      })
      .catch(supabaseError => {
        callback(supabaseError);
      });
    
    return;
  }
  
  // If API fails and not dm-setter, return error
  callback(new Error(`API request failed: ${error.message}`));
});

req.end();