const HOLDED_BASE = 'https://api.holded.com';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Holded-Key',
};

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname + url.search;

    const apiKey = request.headers.get('X-Holded-Key');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Missing X-Holded-Key header' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const response = await fetch(`${HOLDED_BASE}${path}`, {
      method: 'GET',
      headers: {
        key: apiKey,
        'Accept': 'application/json',
      },
    });

    const body = await response.text();
    const contentType = response.headers.get('Content-Type') || '';

    // Holded returns HTML when auth fails — detect and return a proper JSON error
    if (contentType.includes('text/html')) {
      return new Response(JSON.stringify({ error: 'Invalid API key or unauthorized' }), {
        status: 401,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    return new Response(body, {
      status: response.status,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': contentType || 'application/json',
      },
    });
  },
};
