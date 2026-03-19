// functions/monday-file.js
// Proxies Monday.com file downloads to avoid auth issues on mobile

export async function onRequest(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(context.request.url);
  const fileUrl = url.searchParams.get('url');

  if (!fileUrl) {
    return new Response('Missing url parameter', { status: 400 });
  }

  try {
    const token = context.env.MONDAY_TOKEN;
    const response = await fetch(fileUrl, {
      headers: token ? { 'Authorization': token } : {}
    });

    if (!response.ok) {
      return new Response('Could not fetch file: ' + response.status, { status: response.status });
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const body = await response.arrayBuffer();

    return new Response(body, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      }
    });
  } catch (err) {
    return new Response('Error: ' + err.message, { status: 500 });
  }
}
