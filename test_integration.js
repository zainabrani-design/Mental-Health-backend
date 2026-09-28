const http = require('http');

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(d) });
        } catch (e) {
          resolve({ status: res.statusCode, data: d });
        }
      });
    }).on('error', reject);
  });
}

function post(url, body) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const req = http.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(d) });
        } catch (e) {
          resolve({ status: res.statusCode, data: d });
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function run() {
  console.log('--- Testing Weekly Moods ---');
  const m = await get('http://localhost:5000/api/mood/weekly/1782283242043');
  console.log('Weekly moods status:', m.status);
  console.log('Weekly moods count:', m.data.data ? m.data.data.length : 'N/A');
  if (m.data.data) {
    m.data.data.forEach(item => {
      console.log(`- [${item.displayLabel}] ${item.mood} ${item.emoji} (intensity ${item.intensity}) source: ${item.source} | feeling: "${item.feeling || ''}"`);
    });
  }

  console.log('\n--- Testing Prayer API ---');
  const initialPrayer = await get('http://localhost:5000/api/prayer/1782283242043');
  console.log('Get initial prayer status:', initialPrayer.status, initialPrayer.data.data);

  const saveRes = await post('http://localhost:5000/api/prayer', {
    userId: '1782283242043',
    fajr: true,
    dhuhr: true,
    asr: true,
    maghrib: false,
    isha: false
  });
  console.log('Save prayer status:', saveRes.status, saveRes.data.data);

  const weeklyPrayer = await get('http://localhost:5000/api/prayer/weekly/1782283242043');
  console.log('Weekly prayer stats length:', weeklyPrayer.data.data.length);
  console.log('Today prayer count:', weeklyPrayer.data.data[weeklyPrayer.data.data.length - 1]);
}

run().catch(console.error);
