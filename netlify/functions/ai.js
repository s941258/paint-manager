const https = require('https');

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { prompt, inventory } = JSON.parse(event.body);

    const inv = inventory.split('\n')
      .filter(l => !l.includes('qty:0'))
      .slice(0, 60)
      .join('\n');

    const requestBody = JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 1500,
      system: '你是鋼彈模型上色專家。根據庫存幫用戶規劃上色方案。重要：只輸出合法的 JSON，不要有任何說明文字、markdown 標記或程式碼區塊。格式：{"steps":[{"step":1,"title":"步驟名","paints":[{"part":"部位","name":"漆料名","code":"色號","role":"主色","note":""}]}]}。role 只能是：主色、底色、陰影、亮面、金屬、保護漆、補土。所有字串值不能含有換行或特殊字元。',
      messages: [{ role: 'user', content: '模型：' + prompt + '\n庫存（只用這些）：\n' + inv + '\n\n請輸出 JSON：' }]
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
          catch(e) { reject(new Error('API parse error: ' + data.slice(0, 200))); }
        });
      });
      req.on('error', (e) => { clearTimeout(timer); reject(e); });
      req.write(requestBody);
      req.end();
    });

    let text = result.content?.[0]?.text || '{}';

    // 清理：移除 markdown code block
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    // 找到最外層的 JSON 物件
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('No JSON found');
    text = text.slice(start, end + 1);

    // 清理控制字元
    text = text.replace(/[\x00-\x1F\x7F]/g, ' ').replace(/\n/g, ' ');

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch(e) {
      // 回傳原始文字讓前端顯示
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ steps: [], rawText: text, error: e.message })
      };
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
