// functions/monday-upload.js
// Cloudflare Pages Function

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }

  if (context.request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const token = context.env.MONDAY_TOKEN;
  if (!token) {
    return new Response(JSON.stringify({ error: 'MONDAY_TOKEN not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    const { itemId, columnId, fileName, fileBase64 } = await context.request.json();
    const fileBuffer = Uint8Array.from(atob(fileBase64), c => c.charCodeAt(0));
    const boundary = 'X' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    const query = `mutation add_file($file: File!) { add_file_to_column(item_id: ${itemId}, column_id: "${columnId}", file: $file) { id } }`;
    const CRLF = '\r\n';
    const encoder = new TextEncoder();
    const queryPart = encoder.encode('--' + boundary + CRLF + 'Content-Disposition: form-data; name="query"' + CRLF + CRLF + query + CRLF);
    const mapPart = encoder.encode('--' + boundary + CRLF + 'Content-Disposition: form-data; name="map"' + CRLF + CRLF + '{"file":"variables.file"}' + CRLF);
    const filePart = encoder.encode('--' + boundary + CRLF + 'Content-Disposition: form-data; name="file"; filename="' + fileName + '"' + CRLF + 'Content-Type: application/pdf' + CRLF + CRLF);
    const endPart = encoder.encode(CRLF + '--' + boundary + '--' + CRLF);
    const totalLength = queryPart.length + mapPart.length + filePart.length + fileBuffer.length + endPart.length;
    const body = new Uint8Array(totalLength);
    let offset = 0;
    [queryPart, mapPart, filePart, fileBuffer, endPart].forEach(part => { body.set(part, offset); offset += part.length; });
    const response = await fetch('https://api.monday.com/v2/file', {
      method: 'POST',
      headers: {
        'Authorization': token,
        'API-Version': '2024-01',
        'Content-Type': 'multipart/form-data; boundary=' + boundary
      },
      body: body
    });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch(e) { data = { raw: text }; }
    if (!response.ok) throw new Error('Monday API returned ' + response.status + ': ' + text.slice(0, 200));
    if (data.errors) throw new Error(data.errors[0].message);
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
