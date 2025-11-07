export default async function handler(req, res) {
    // Only accept POST requests
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  
    try {
      const webhookData = req.body;
      
      console.log('Received Calendly webhook:', JSON.stringify(webhookData, null, 2));
      
      // Extract event type and payload
      const { event, payload } = webhookData;

      console.log('Event:', event);
      console.log('Payload:', payload);
      
      // Handle different event types
      if (event === 'invitee.created') {
        await handleNewBooking(payload);
      } else if (event === 'invitee.canceled') {
        await handleCancellation(payload);
      } else if (event === 'invitee_no_show.created') {
        await handleNoShow(payload);
      }
      
      // Always return 200 to acknowledge receipt
      return res.status(200).json({ received: true });
      
    } catch (error) {
      console.error('Webhook processing error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
  
  async function handleNewBooking(payload) {
    console.log('New booking:', payload);
    

    
    // Add other integrations here
  await notifyDiscord(payload);
  }
  
  async function handleCancellation(payload) {
    console.log('Cancellation:', payload);
    // Handle cancellation logic
  }
  
  async function handleNoShow(payload) {
    console.log('No show:', payload);
    // Handle no-show logic
  }
  
  async function sendToManyChat(data) {
    // We'll fill this in next - what data do you send to ManyChat currently?
  }

async function notifyDiscord(payload) {
  const DISCORD_WEBHOOK_URL = 'https://discord-notifiactions.floral-rain-cd3c.workers.dev/';

  const inviteeName = payload?.name || 'Unknown name';
  const event = payload?.event || {};


  const inviteeEmail = invitee.email || 'Unknown email';
  const eventName = payload?.event || 'Unknown event';
  const startTime = event.start_time || payload?.scheduled_event?.start_time;

  const messageLines = [
    `👤 ${inviteeName}`,
    `✉️ ${inviteeEmail}`,
    `🕒 ${startTime}`
  ];

  if (startTime) {
    messageLines.push(`🕒 Starts at: ${startTime}`);
  }

  const body = {
    message: messageLines.join('\n'),
    userId: '447184380939599880'
  };

  try {
    const response = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Discord notification failed: ${response.status} ${text}`);
    }

    console.log('Discord notification sent successfully');
  } catch (error) {
    console.error('Error sending Discord notification:', error);
  }
}