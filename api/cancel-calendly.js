// API endpoint to cancel a Calendly event
const CALENDLY_PAT = 'eyJraWQiOiIxY2UxZTEzNjE3ZGNmNzY2YjNjZWJjY2Y4ZGM1YmFmYThhNjVlNjg0MDIzZjdjMzJiZTgzNDliMjM4MDEzNWI0IiwidHlwIjoiUEFUIiwiYWxnIjoiRVMyNTYifQ.eyJpc3MiOiJodHRwczovL2F1dGguY2FsZW5kbHkuY29tIiwiaWF0IjoxNzU5MTQyODUwLCJqdGkiOiIyNTQxMTBjNC1iMzQ5LTQzMzQtODdhOS0xY2FlYWRhMmVjYTEiLCJ1c2VyX3V1aWQiOiIzZWQyOTYzNC1iYzY5LTQ4MjYtOGU2Yy1mNzJjMWEzZWIxMzgifQ.nB3bY9P-R8eezA0_Rk8QtAfo-3Hq8QqEASfLhCYJ8xIiiouBrGOLtT-MGyg7Xqmw0Y7VX-RHQBQxklpYAAtGFQ';
const BASE_URL = 'https://api.calendly.com';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { eventUri } = req.body;

  if (!eventUri) {
    return res.status(400).json({ error: 'Missing required field: eventUri' });
  }

  try {
    // Extract event UUID from event URI
    // Format: https://api.calendly.com/scheduled_events/{event_uuid}
    const eventMatch = eventUri.match(/\/scheduled_events\/([^/]+)/);
    if (!eventMatch) {
      return res.status(400).json({ error: 'Invalid event URI format' });
    }

    const eventUuid = eventMatch[1];

    // Cancel the event directly
    const response = await fetch(`${BASE_URL}/scheduled_events/${eventUuid}/cancellation`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CALENDLY_PAT}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Calendly API error: ${response.status} ${error}`);
    }

    const data = await response.json();
    return res.status(200).json({ success: true, data });

  } catch (error) {
    console.error('Error canceling Calendly event:', error);
    return res.status(500).json({ error: error.message });
  }
}

