// api/subscribe.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'MyBeacon <hello@mybeacon.co>',
        to: 'cody@mybeacon.co',
        subject: 'New Beacon Scan',
        html: `<p>New scan from: <strong>${email}</strong></p>`,
      }),
    });

    if (response.ok) {
      return res.status(200).json({ success: true });
    }

    const data = await response.json();
    console.error('Resend error:', data);
    return res.status(500).json({ error: 'Failed to send' });

  } catch (err) {
    console.error('Subscribe error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
