// api/subscribe.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { email } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }
  const API_KEY = process.env.MAILCHIMP_API_KEY;
  const AUDIENCE_ID = 'becccf7b49';
  const DC = API_KEY.split('-')[1]; // 'us3'
  const url = `https://${DC}.api.mailchimp.com/3.0/lists/${AUDIENCE_ID}/members`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `apikey ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email_address: email,
        status: 'subscribed',
        tags: ['beacon-scan'],
      }),
    });
    const data = await response.json();
    if (response.ok || data.title === 'Member Exists') {
      return res.status(200).json({ success: true });
    }
    console.error('Mailchimp error:', data);
    return res.status(500).json({ error: 'Failed to subscribe' });
  } catch (err) {
    console.error('Subscribe error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
