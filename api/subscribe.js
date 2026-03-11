// api/subscribe.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY is not set in environment variables');
    return res.status(500).json({ error: 'Email service not configured' });
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'MyBeacon <onboarding@resend.dev>',
        to: 'cmcgrat3@gmail.com',
        subject: `New Beacon Scan — ${email}`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
            <h2 style="color:#0D9488;margin-bottom:8px;">New MyBeacon Scan 🔍</h2>
            <p style="color:#4A4A5A;font-size:15px;">Someone just completed a scan:</p>
            <div style="background:#F2EDE4;border-radius:10px;padding:16px 20px;margin:16px 0;">
              <strong style="font-size:16px;color:#1A1A2E;">${email}</strong>
            </div>
            <p style="color:#8E8E9E;font-size:12px;">Sent by MyBeacon notification system</p>
          </div>
        `,
      }),
    });

    const data = await response.json();

    if (response.ok) {
      console.log('Email sent successfully to cmcgrat3@gmail.com for scan:', email);
      return res.status(200).json({ success: true });
    }

    console.error('Resend API error:', JSON.stringify(data));
    return res.status(500).json({ error: 'Failed to send', detail: data });

  } catch (err) {
    console.error('Subscribe handler error:', err.message);
    return res.status(500).json({ error: 'Server error', detail: err.message });
  }
}
