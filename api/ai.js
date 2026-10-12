export const config = { runtime: 'nodejs' };

const https = require('https');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { prompt, inventory } = req.body;

    const inv = inventory.split('\n')
      .filter(l => !l.includes('qty:0'))
      .slice(0, 50)
      .join('\n');

    const requestBody = JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 800,
      system: '你是鋼彈模型上色專家。只輸出合法 JSON，絕對不要有說明文字、markdown、換行符號。格式：{"steps":[{"step":1,"title":"補土打底","method":"噴塗","paints":[{"part":"全身","name":"灰補土","code":"P-03","role":"補土","note":""}]}]}。每個值必須是單行字串，不可包含雙引號或特殊字元。',
      messages: [{ role: 'user', content: '模型：' + prompt + '\n庫存：\n' + inv }]
    });

    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 9000);
      const req2 = https.request({
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(requestBody)
        }
      }, (r) => {
        let data = '';
        r.on('data', chunk => data += chunk);
        r.on('end', () => {
          clearTimeout(timer);
          try { resolve(JSON.parse(data)); }
          catch(e) { reject(new Error('API error')); }
        });
      });
      req2.on('error', e => { clearTimeout(timer); reject(e); });
      req2.write(requestBody);
      req2.end();
    });

    let text = result.content?.[0]?.text || '{}';
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('No JSON');
    text = text.slice(start, end + 1);
    text = text.replace(/[\x00-\x1F\x7F]/g, ' ');
    text = text.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');

    let parsed;
    try { parsed = JSON.parse(text); }
    catch(e) { parsed = { steps: [], error: e.message }; }

    return res.status(200).json(parsed);
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
