const https = require('https');

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { model, steps } = JSON.parse(event.body);

    // 把漆料規劃摘要給 AI 生成說明
    const stepsSummary = steps.map(function(s) {
      const paints = (s.paints||[]).map(function(p) {
        return p.part + '用' + p.name + '(' + p.code + ')';
      }).join('、');
      return s.step + '. ' + s.title + '：' + paints;
    }).join('\n');

    const requestBody = JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 1000,
      system: '你是鋼彈模型上色專家。根據上色規劃，為每個步驟寫施工說明。只輸出合法 JSON，不要有任何說明文字或 markdown。格式：{"guide":[{"step":1,"title":"步驟名稱","tip":"施工要點（1-2句，繁體中文）","caution":"注意事項（1句，可空）"}]}。所有字串不能有換行或特殊字元。',
      messages: [{ role: 'user', content: '模型：' + model + '\n\n上色規劃：\n' + stepsSummary + '\n\n請為每個步驟寫施工說明，輸出 JSON：' }]
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
          catch(e) { reject(new Error('API error')); }
        });
      });
      req.on('error', (e) => { clearTimeout(timer); reject(e); });
      req.write(requestBody);
      req.end();
    });

    let text = result.content?.[0]?.text || '{}';
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('No JSON');
    text = text.slice(start, end + 1);
    text = text.replace(/[\x00-\x1F\x7F]/g, ' ');

    let parsed;
    try { parsed = JSON.parse(text); }
    catch(e) { parsed = { guide: [], error: e.message }; }

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
