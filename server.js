import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3000;

// Enable CORS
app.use(cors());
app.use(express.json());

// Lazy import handlers to avoid loading issues with missing env vars
let manychatHandler, cancelCalendlyHandler, currentSetterHandler, calendlyWebhookHandler;

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
      query: req.query
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
    console.log(`   - GET  http://localhost:${PORT}/api/test (test endpoint)`);
    console.log(`\n💡 Make sure Vite dev server (port 5173) proxies /api/* to this server`);
  });
}).catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});

