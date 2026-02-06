import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import 'dotenv/config'; // Loads .env by default
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load .env.local if it exists (takes precedence)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envLocalPath = join(__dirname, '.env.local');
dotenv.config({ path: envLocalPath, override: true });

const app = express();
const PORT = 3000;

// Initialize Supabase client for database queries
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

// Trust proxy to get correct IP addresses
app.set('trust proxy', true);

// Enable CORS
app.use(cors());
app.use(express.json());

// Lazy import handlers to avoid loading issues with missing env vars
let manychatHandler, cancelCalendlyHandler, currentSetterHandler, calendlyWebhookHandler, kajabiWebhookHandler, rubenShiftToggleHandler, aiSetterHandler, storeFbclidHandler, metaConversionHandler;

async function loadHandler(handlerPath, handlerName) {
  try {
    const module = await import(handlerPath);
    return module.default;
  } catch (error) {
    console.warn(`⚠️ Handler ${handlerName} failed to load:`, error.message);
    // Return a dummy handler that returns an error
    return async (req, res) => {
      res.status(503).json({ 
        error: `${handlerName} handler not available`,
        details: 'Missing environment variables or dependencies'
      });
    };
  }
}

async function loadHandlers() {
  manychatHandler = await loadHandler('./api/manychat.js', 'manychat');
  cancelCalendlyHandler = await loadHandler('./api/cancel-calendly.js', 'cancel-calendly');
  currentSetterHandler = await loadHandler('./api/current-setter.js', 'current-setter');
  calendlyWebhookHandler = await loadHandler('./api/calendly-webhook.js', 'calendly-webhook');
  kajabiWebhookHandler = await loadHandler('./api/kajabi-webhook.js', 'kajabi-webhook');
  rubenShiftToggleHandler = await loadHandler('./api/ruben-shift-toggle.js', 'ruben-shift-toggle');
  aiSetterHandler = await loadHandler('./api/ai-setter.js', 'ai-setter');
  storeFbclidHandler = await loadHandler('./api/store-fbclid.js', 'store-fbclid');
  metaConversionHandler = await loadHandler('./api/meta-conversion.js', 'meta-conversion');
}

// Convert Vercel-style handler to Express middleware
const adaptVercelHandler = (handler) => {
  return async (req, res) => {
    // Convert Express req/res to Vercel-style handler format
    const vercelReq = {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: req.body,
      query: req.query,
      ip: req.ip,
      connection: req.connection,
      socket: req.socket
    };

    const vercelRes = {
      status: (code) => {
        res.status(code);
        return vercelRes;
      },
      json: (data) => {
        res.json(data);
      },
      end: () => {
        res.end();
      },
      setHeader: (name, value) => {
        res.setHeader(name, value);
      }
    };

    try {
      await handler(vercelReq, vercelRes);
    } catch (error) {
      console.error('Error in handler:', error);
      res.status(500).json({ error: error.message });
    }
  };
};

// Log all requests for debugging (before routes)
app.use('/api', (req, res, next) => {
  console.log(`📨 API Request: ${req.method} ${req.path}`, req.body ? { body: req.body } : '');
  next();
});

// API routes - register all API endpoints (with lazy loading)
app.post('/api/manychat', async (req, res) => {
  if (!manychatHandler) await loadHandlers();
  return adaptVercelHandler(manychatHandler)(req, res);
});

app.post('/api/cancel-calendly', async (req, res) => {
  if (!cancelCalendlyHandler) await loadHandlers();
  return adaptVercelHandler(cancelCalendlyHandler)(req, res);
});

app.get('/api/current-setter', async (req, res) => {
  if (!currentSetterHandler) await loadHandlers();
  return adaptVercelHandler(currentSetterHandler)(req, res);
});

app.post('/api/calendly-webhook', async (req, res) => {
  if (!calendlyWebhookHandler) await loadHandlers();
  return adaptVercelHandler(calendlyWebhookHandler)(req, res);
});

app.post('/api/kajabi-webhook', async (req, res) => {
  if (!kajabiWebhookHandler) await loadHandlers();
  return adaptVercelHandler(kajabiWebhookHandler)(req, res);
});

app.post('/api/ruben-shift-toggle', async (req, res) => {
  if (!rubenShiftToggleHandler) await loadHandlers();
  return adaptVercelHandler(rubenShiftToggleHandler)(req, res);
});

app.post('/api/ai-setter', async (req, res) => {
  if (!aiSetterHandler) await loadHandlers();
  return adaptVercelHandler(aiSetterHandler)(req, res);
});

app.post('/api/store-fbclid', async (req, res) => {
  if (!storeFbclidHandler) await loadHandlers();
  return adaptVercelHandler(storeFbclidHandler)(req, res);
});

app.post('/api/meta-conversion', async (req, res) => {
  if (!metaConversionHandler) await loadHandlers();
  return adaptVercelHandler(metaConversionHandler)(req, res);
});

// N8N webhook proxy endpoint
app.post('/api/n8n-webhook', async (req, res) => {
  try {
    const { calendly_id, email, phone, event } = req.body;
    
    // Query fbclid_tracking table to get fbclid for this calendly_id
    let fbclid = null;
    let ip_address = null;
    if (calendly_id) {
      try {
        const { data, error } = await supabase
          .from('fbclid_tracking')
          .select('fbclid, ip_address')
          .eq('calendly_event_uri', calendly_id)
          .maybeSingle();

        if (error) {
          console.warn('⚠️ Error querying fbclid_tracking:', error.message);
        } else {
          if (data?.fbclid) {
            fbclid = data.fbclid;
            console.log('✅ Found fbclid for calendly_id:', calendly_id, 'fbclid:', fbclid);
          } else {
            console.log('ℹ️ No fbclid found for calendly_id:', calendly_id);
          }

          if (data?.ip_adress) {
            // You can assign this to a variable if you want to use it in the webhookPayload
            ip_address = data.ip_adress;
            console.log('✅ Found tracked ip_adress for calendly_id:', calendly_id, 'ip_adress:', data.ip_adress);
          } else {
            console.log('ℹ️ No tracked ip_adress found for calendly_id:', calendly_id);
          }
        }
      } catch (dbError) {
        console.warn('⚠️ Database query error:', dbError.message);
        // Continue without fbclid if query fails
      }
    }

    // Build webhook payload with fbclid if found
    const webhookPayload = {
      event: event || 'lead_confirmed',
      calendly_id,
      email,
      phone,
      ...(fbclid && { fbclid }),
      ip_address: ip_address,
    };

    const webhookUrl = 'https://inglesahorita.app.n8n.cloud/webhook/1b560f1a-d0e7-4695-a15b-6501c47aa101';
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(webhookPayload),
    });

    const data = await response.text();
    
    if (!response.ok) {
      console.error('❌ N8N webhook error:', response.status, data);
      return res.status(response.status).json({ error: 'Webhook request failed', details: data });
    }

    res.json({ success: true, data: data, fbclid_included: !!fbclid });
  } catch (error) {
    console.error('❌ Error proxying to N8N webhook:', error);
    res.status(500).json({ error: 'Failed to proxy webhook request', details: error.message });
  }
});

// Catch-all for unregistered API routes
app.use('/api/*', (req, res) => {
  console.warn(`⚠️ Unregistered API route: ${req.method} ${req.path}`);
  res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Test endpoint to verify server is working
app.get('/api/test', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'API server is running!',
    timestamp: new Date().toISOString()
  });
});

// Load handlers on startup
loadHandlers().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Local API server running on http://localhost:${PORT}`);
    console.log(`📡 API endpoints available:`);
    console.log(`   - POST http://localhost:${PORT}/api/manychat`);
    console.log(`   - POST http://localhost:${PORT}/api/cancel-calendly`);
    console.log(`   - GET  http://localhost:${PORT}/api/current-setter`);
    console.log(`   - POST http://localhost:${PORT}/api/calendly-webhook`);
    console.log(`   - POST http://localhost:${PORT}/api/kajabi-webhook`);
    console.log(`   - POST http://localhost:${PORT}/api/store-fbclid`);
    console.log(`   - POST http://localhost:${PORT}/api/meta-conversion`);
    console.log(`   - GET  http://localhost:${PORT}/api/test (test endpoint)`);
    console.log(`\n💡 Make sure Vite dev server (port 5173) proxies /api/* to this server`);
  });
}).catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});

