const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA_PATH = path.join(__dirname, '..', 'data', 'vault.json');
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');

const ALLOWED_TYPES = new Set(['credential', 'sshKey', 'creditCard', 'misc']);

function ensureDataFile() {
  if (!fs.existsSync(DATA_PATH)) {
    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
    fs.writeFileSync(DATA_PATH, JSON.stringify({ secrets: [] }, null, 2));
  }
}

function readVault() {
  ensureDataFile();
  const raw = fs.readFileSync(DATA_PATH, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error('Failed to parse vault file. Resetting to empty state.', error);
    const empty = { secrets: [] };
    fs.writeFileSync(DATA_PATH, JSON.stringify(empty, null, 2));
    return empty;
  }
}

function writeVault(vault) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(vault, null, 2));
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(payload));
}

function sendNotFound(res) {
  sendJson(res, 404, { message: 'Not found' });
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 1e6) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!data) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function validateSecret(body, isUpdate = false) {
  const errors = [];
  const allowedTypes = Array.from(ALLOWED_TYPES).join(', ');

  if (!isUpdate || body.type !== undefined) {
    if (!body.type || !ALLOWED_TYPES.has(body.type)) {
      errors.push(`\"type\" must be one of: ${allowedTypes}`);
    }
  }

  if (!isUpdate || body.name !== undefined) {
    if (!body.name || typeof body.name !== 'string') {
      errors.push('\"name\" is required');
    }
  }

  if (!isUpdate || body.details !== undefined) {
    if (typeof body.details !== 'object' || Array.isArray(body.details) || body.details === null) {
      errors.push('\"details\" must be an object');
    }
  }

  return errors;
}

function buildSecret(body, existing = {}) {
  const now = new Date().toISOString();
  return {
    id: existing.id || crypto.randomUUID(),
    type: body.type !== undefined ? body.type : existing.type,
    name: body.name !== undefined ? body.name : existing.name,
    details: body.details !== undefined ? body.details : existing.details,
    createdAt: existing.createdAt || now,
    updatedAt: now
  };
}

function serveStaticFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    const contentType =
      ext === '.html' ? 'text/html' :
      ext === '.css' ? 'text/css' :
      ext === '.js' ? 'application/javascript' :
      ext === '.json' ? 'application/json' :
      ext === '.ico' ? 'image/x-icon' :
      'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  if (url.pathname.startsWith('/api/secrets')) {
    ensureDataFile();
    const vault = readVault();

    if (req.method === 'GET' && url.pathname === '/api/secrets') {
      sendJson(res, 200, vault.secrets);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/secrets') {
      try {
        const body = await readRequestBody(req);
        const errors = validateSecret(body);
        if (errors.length) {
          sendJson(res, 400, { message: 'Validation failed', errors });
          return;
        }
        const secret = buildSecret(body);
        vault.secrets.push(secret);
        writeVault(vault);
        sendJson(res, 201, secret);
      } catch (error) {
        sendJson(res, 400, { message: error.message });
      }
      return;
    }

    const idMatch = url.pathname.match(/^\/api\/secrets\/(.+)$/);
    if (idMatch) {
      const secretId = idMatch[1];
      const secretIndex = vault.secrets.findIndex(secret => secret.id === secretId);

      if (secretIndex === -1) {
        sendNotFound(res);
        return;
      }

      if (req.method === 'PUT') {
        try {
          const body = await readRequestBody(req);
          const errors = validateSecret(body, true);
          if (errors.length) {
            sendJson(res, 400, { message: 'Validation failed', errors });
            return;
          }
          const updated = buildSecret(body, vault.secrets[secretIndex]);
          vault.secrets[secretIndex] = updated;
          writeVault(vault);
          sendJson(res, 200, updated);
        } catch (error) {
          sendJson(res, 400, { message: error.message });
        }
        return;
      }

      if (req.method === 'DELETE') {
        const [removed] = vault.secrets.splice(secretIndex, 1);
        writeVault(vault);
        sendJson(res, 200, removed);
        return;
      }
    }

    sendNotFound(res);
    return;
  }

  // Static file serving
  let filePath = path.join(FRONTEND_DIR, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!filePath.startsWith(FRONTEND_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      filePath = path.join(FRONTEND_DIR, 'index.html');
    }
    serveStaticFile(res, filePath);
  });
});

server.listen(PORT, () => {
  ensureDataFile();
  console.log(`Vault server running on http://localhost:${PORT}`);
});
