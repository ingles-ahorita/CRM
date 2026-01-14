export default async function handler(req, res) {
  // Zoom recordings webhook endpoint
  // TODO: Implement webhook logic
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  console.log('Zoom webhook received:', req.body);

  return res.status(200).json({ 
    message: 'Webhook received',
    received: true
  });
}
