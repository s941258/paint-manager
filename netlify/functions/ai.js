const https = require('https');

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { prompt, inventory } = JSON.parse(event.body);

    // 只傳有庫存的漆料，縮短 prompt
    const inv = inventory.split('\n')
      .filter(l => !l.includes('qty:0'))
      .slice(0, 80)
      .join('\n');

    const requestBody = JSON.stringify({
      model: 'claude-haiku-5-5',
      max_tokens: 1000,
      system: '你是鋼彈模型上色專家。根據庫存幫用戶規劃上色方案，繁體中文，只用有庫存的漆料。輸出純 JSON，格式：{"steps":[{"step":1,"title":"步驟名","paints":[{"part":"部位","name":"漆料名","code":"色號","role":"主色/底色/陰影/亮面/金屬/保護漆","note":"備注"}]}]}',
      messages: [{ role: 'user', content: '模型：' + prompt + '\n庫存：\n' + inv }]
    });

    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('API timeout')), 8000);
      const req = https.request({
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(requestBody)
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          clearTimeout(timer);
          try { resolve(JSON.parse(data)); }
          catch(e) { reject(e); }
        });
      });
      req.on('error', (e) => { clearTimeout(timer); reject(e); });
      req.write(requestBody);
      req.end();
    });

    const text = result.content?.[0]?.text || '{}';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { steps: [] };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(parsed)
    };
  } catch(e) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: e.message })
    };
  }
};
