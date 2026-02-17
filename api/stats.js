export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
  const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!REDIS_URL || !REDIS_TOKEN) {
    return res.status(500).json({ error: 'Redis not configured' });
  }

  try {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    // Fetch all stats in one pipeline
    const pipeline = [
      ['GET', 'scans:total'],
      ['GET', `scans:daily:${today}`],
      ['GET', `scans:daily:${yesterday}`],
      ['LRANGE', 'scans:recent', '0', '19'],
      ['GET', 'scans:country:US'],
      ['GET', 'scans:country:GB'],
      ['GET', 'scans:country:CA'],
      ['GET', 'scans:country:AU'],
      ['GET', 'scans:country:DE']
    ];

    const response = await fetch(`${REDIS_URL}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(pipeline)
    });

    const results = await response.json();

    const totalScans = parseInt(results[0]?.result) || 0;
    const todayScans = parseInt(results[1]?.result) || 0;
    const yesterdayScans = parseInt(results[2]?.result) || 0;
    const recentScans = (results[3]?.result || []).map(s => {
      try { return JSON.parse(s); } catch { return null; }
    }).filter(Boolean);

    const countries = {
      US: parseInt(results[4]?.result) || 0,
      GB: parseInt(results[5]?.result) || 0,
      CA: parseInt(results[6]?.result) || 0,
      AU: parseInt(results[7]?.result) || 0,
      DE: parseInt(results[8]?.result) || 0
    };

    return res.status(200).json({
      totalScans,
      todayScans,
      yesterdayScans,
      countries,
      recentScans
    });

  } catch (error) {
    console.error('Stats error:', error);
    return res.status(500).json({ error: 'Failed to fetch stats' });
  }
}
