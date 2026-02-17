export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.query;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  const HIBP_API_KEY = process.env.HIBP_API_KEY;

  if (!HIBP_API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    // Fetch breaches for this email
    const breachResponse = await fetch(
      `https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(email)}?truncateResponse=false`,
      {
        headers: {
          'hibp-api-key': HIBP_API_KEY,
          'user-agent': 'MyBeacon-Privacy-Scanner'
        }
      }
    );

    let breaches = [];

    if (breachResponse.status === 200) {
      breaches = await breachResponse.json();
    } else if (breachResponse.status === 404) {
      breaches = [];
    } else if (breachResponse.status === 429) {
      return res.status(429).json({ error: 'Rate limited. Please try again in a moment.' });
    } else {
      return res.status(502).json({ error: 'Upstream API error', status: breachResponse.status });
    }

    // Process breaches into our format
    const processedBreaches = breaches.map(b => {
      const criticalData = ['Passwords', 'Credit cards', 'Social security numbers', 'Bank account numbers', 'Financial data'];
      const mediumData = ['Email addresses', 'Phone numbers', 'Physical addresses', 'Employers', 'IP addresses'];

      const hasCritical = b.DataClasses.some(d => criticalData.includes(d));
      const hasMedium = b.DataClasses.some(d => mediumData.includes(d));

      let severity = 'low';
      if (hasCritical) severity = 'high';
      else if (hasMedium) severity = 'medium';

      const date = new Date(b.BreachDate);
      const formatted = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

      return {
        name: b.Title,
        date: formatted,
        data: b.DataClasses.slice(0, 3).join(', '),
        severity: severity,
        pwnCount: b.PwnCount,
        domain: b.Domain,
        description: b.Description,
        dataClasses: b.DataClasses,
        isVerified: b.IsVerified,
        isSensitive: b.IsSensitive
      };
    });

    // Sort: high severity first, then by date
    processedBreaches.sort((a, b) => {
      const sevOrder = { high: 0, medium: 1, low: 2 };
      if (sevOrder[a.severity] !== sevOrder[b.severity]) {
        return sevOrder[a.severity] - sevOrder[b.severity];
      }
      return new Date(b.date) - new Date(a.date);
    });

    // Calculate score (300-850, lower = more exposed)
    let score = 850;
    processedBreaches.forEach(b => {
      if (b.severity === 'high') score -= 55;
      else if (b.severity === 'medium') score -= 35;
      else score -= 15;
    });
    score = Math.max(300, Math.min(850, score));

    // Calculate estimated data value
    const totalRecords = processedBreaches.reduce((sum, b) => sum + (b.pwnCount || 0), 0);
    const highCount = processedBreaches.filter(b => b.severity === 'high').length;
    const baseValue = processedBreaches.length * 180;
    const criticalBonus = highCount * 320;
    const dataValue = Math.min(baseValue + criticalBonus, 8500);

    // Estimate broker exposure
    const estimatedBrokers = Math.min(Math.round(processedBreaches.length * 3.5 + 12), 85);

    // Track scan in Upstash Redis (fire and forget)
    const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
    const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (REDIS_URL && REDIS_TOKEN) {
      const country = req.headers['x-vercel-ip-country'] || 'unknown';
      const today = new Date().toISOString().split('T')[0];
      const scanRecord = JSON.stringify({
        t: Date.now(),
        c: country,
        s: score,
        b: processedBreaches.length
      });

      // Pipeline: increment total, daily, country, store recent scan
      const pipeline = [
        ['INCR', 'scans:total'],
        ['INCR', `scans:daily:${today}`],
        ['INCR', `scans:country:${country}`],
        ['LPUSH', 'scans:recent', scanRecord],
        ['LTRIM', 'scans:recent', '0', '99']
      ];

      fetch(`${REDIS_URL}/pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${REDIS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(pipeline)
      }).catch(err => console.error('Redis error:', err));
    }

    return res.status(200).json({
      breaches: processedBreaches,
      score: score,
      stats: {
        breachCount: processedBreaches.length,
        brokerEstimate: estimatedBrokers,
        recordsFound: totalRecords,
        darkWebHits: highCount,
        dataValue: dataValue
      }
    });

  } catch (error) {
    console.error('Scan error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
