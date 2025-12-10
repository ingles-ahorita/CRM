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

// Import and use the manychat API handler
import manychatHandler from './api/manychat.js';

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

// API routes
app.post('/api/manychat', adaptVercelHandler(manychatHandler));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`🚀 Local API server running on http://localhost:${PORT}`);
  console.log(`📡 API endpoint: http://localhost:${PORT}/api/manychat`);
});

