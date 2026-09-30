exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    var body = {};
    try { body = JSON.parse(event.body || '{}'); } catch (e) { body = {}; }
    var safe = {
      message: String(body.message || '').slice(0, 500),
      stack: String(body.stack || '').slice(0, 1500),
      url: String(body.url || '').slice(0, 300),
      lang: String(body.lang || '').slice(0, 8),
      ts: new Date().toISOString(),
    };
    console.log('[auvia-client-error]', JSON.stringify(safe));
    return {
      statusCode: 204,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: '',
    };
  } catch (e) {
    return { statusCode: 200, body: 'ok' };
  }
};
