interface Env {
  HOLDED_API_KEY: string;
}

const HOLDED_BASE = 'https://api.holded.com';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (!env.HOLDED_API_KEY) {
      return new Response(JSON.stringify({ error: 'HOLDED_API_KEY secret not configured in worker' }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const method = request.method;
    if (method !== 'GET' && method !== 'POST' && method !== 'PUT') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(request.url);
    const path = url.pathname + url.search;

    const fetchOptions: RequestInit = {
      method,
      headers: {
        key: env.HOLDED_API_KEY,
        Accept: 'application/json',
      },
    };

    if (method === 'POST' || method === 'PUT') {
      (fetchOptions.headers as Record<string, string>)['Content-Type'] = 'application/json';
      fetchOptions.body = await request.text();
    }

    const response = await fetch(`${HOLDED_BASE}${path}`, fetchOptions);

    const body = await response.text();
    const contentType = response.headers.get('Content-Type') || '';

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
