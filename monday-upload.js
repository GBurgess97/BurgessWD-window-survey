// netlify/functions/monday-upload.js
// Proxies file uploads to Monday.com API server-side, avoiding CORS

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const token = process.env.MONDAY_TOKEN;
  if (!token) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'MONDAY_TOKEN environment variable not set in Netlify' })
    };
  }

  try {
    // The body comes in as base64 encoded multipart data
    const body = JSON.parse(event.body);
    const { itemId, columnId, fileName, fileBase64 } = body;

    // Convert base64 back to binary
    const fileBuffer = Buffer.from(fileBase64, 'base64');

    // Build multipart form data manually
    const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
    const query = `mutation add_file($file: File!) { add_file_to_column(item_id: ${itemId}, column_id: "${columnId}", file: $file) { id } }`;

    const parts = [
      `--${boundary}\r\nContent-Disposition: form-data; name="query"\r\n\r\n${query}`,
      `--${boundary}\r\nContent-Disposition: form-data; name="variables[file]"; filename="${fileName}"\r\nContent-Type: application/pdf\r\n\r\n`,
    ];

    const header = Buffer.from(parts[0] + '\r\n' + parts[1]);
    const footer = Buffer.from(`\r\n--${boundary}--`);
    const multipartBody = Buffer.concat([header, fileBuffer, footer]);

    const response = await fetch('https://api.monday.com/v2/file', {
      method: 'POST',
      headers: {
        'Authorization': token,
        'API-Version': '2024-01',
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': multipartBody.length
      },
      body: multipartBody
    });

    const data = await response.json();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(data)
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
