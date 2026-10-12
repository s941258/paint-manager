const https = require('https');

function fixJson(text) {
  // 移除 markdown
  text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  // 找最外層 {}
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON found');
  text = text.slice(start, end + 1);
  // 移除控制字元
  text = text.replace(/[\x00-\x1F\x7F]/g, ' ');
  // 修復常見問題：移除 trailing commas
  text = text.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
  // 修復單引號
  text = text.replace(/'/g, '"');
  return text;
}

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { prompt, inventory } = JSON.parse(event.body);

    const inv = inventory.split('\n')
      .filter(l => !l.includes('qty:0'))
      .slice(0, 50)
      .join('\n');

    const requestBody = JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 800,
      system: '你是鋼彈模型上色專家。只輸出合法 JSON，絕對不要有說明文字、markdown、換行符號。格式：{"steps":[{"step":1,"title":"補土打底","method":"噴塗","paints":[{"part":"全身","name":"灰補土","code":"P-03","role":"補土","note":""}]}]}。每個 paints 項目的所有值必須是單行字串，不可包含雙引號或特殊字元。',
      messages: [{ role: 'user', content: '模型：' + prompt + '\n庫存：\n' + inv }]
    });

    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 9000);
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
          catch(e) { reject(new Error('API error: ' + data.slice(0,100))); }
        });
      });
      req.on('error', e => { clearTimeout(timer); reject(e); });
      req.write(requestBody);
      req.end();
    });

    let text = result.content?.[0]?.text || '{}';
    text = fixJson(text);

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch(e) {
      // 最後手段：回傳空結果但不報錯
      parsed = { steps: [], parseError: e.message };
    }

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
