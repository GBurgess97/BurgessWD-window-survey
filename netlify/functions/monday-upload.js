// netlify/functions/monday-upload.js
// Proxies file uploads to Monday.com using form-data

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const token = process.env.MONDAY_TOKEN;
  if (!token) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'MONDAY_TOKEN not set' })
    };
  }

  try {
    const { itemId, columnId, fileName, fileBase64 } = JSON.parse(event.body);

    const fileBuffer = Buffer.from(fileBase64, 'base64');
    const boundary = 'X' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

    const query = `mutation add_file($file: File!) { add_file_to_column(item_id: ${itemId}, column_id: "${columnId}", file: $file) { id } }`;

    // Build multipart body
    const CRLF = '\r\n';
    const queryPart = Buffer.from(
      '--' + boundary + CRLF +
      'Content-Disposition: form-data; name="query"' + CRLF + CRLF +
      query + CRLF
    );
    const mapPart = Buffer.from(
      '--' + boundary + CRLF +
      'Content-Disposition: form-data; name="map"' + CRLF + CRLF +
      '{"file":"variables.file"}' + CRLF
    );
    const filePart = Buffer.from(
      '--' + boundary + CRLF +
      'Content-Disposition: form-data; name="file"; filename="' + fileName + '"' + CRLF +
      'Content-Type: application/pdf' + CRLF + CRLF
    );
    const endPart = Buffer.from(CRLF + '--' + boundary + '--' + CRLF);

    const body = Buffer.concat([queryPart, mapPart, filePart, fileBuffer, endPart]);

    const response = await fetch('https://api.monday.com/v2/file', {
      method: 'POST',
      headers: {
        'Authorization': token,
        'API-Version': '2024-01',
        'Content-Type': 'multipart/form-data; boundary=' + boundary,
        'Content-Length': String(body.length)
      },
      body: body
    });

    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch(e) { data = { raw: text }; }

    if (!response.ok) {
      throw new Error('Monday API returned ' + response.status + ': ' + text.slice(0, 200));
    }
    if (data.errors) {
      throw new Error(data.errors[0].message);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(data)
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message })
    };
  }
};
