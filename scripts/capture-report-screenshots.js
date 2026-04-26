const crypto = require('crypto');
const fs = require('fs/promises');
const http = require('http');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

const APP_URL = 'http://127.0.0.1:5173';
const API_URL = 'http://127.0.0.1:5001';
const DEBUG_PORT = 9333;
const OUT_DIR = path.resolve(__dirname, '..', 'report-screenshots');
const BRAVE_BIN = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';

function requestJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const body = options.body ? Buffer.from(options.body) : null;
    const req = http.request(
      url,
      {
        method: options.method || 'GET',
        headers: {
          ...(options.headers || {}),
          ...(body ? { 'Content-Length': body.length } : {}),
        },
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(`${url} returned ${res.statusCode}: ${raw}`));
            return;
          }

          try {
            resolve(JSON.parse(raw));
          } catch (error) {
            reject(error);
          }
        });
      }
    );
    req.on('error', reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

async function waitForJson(url, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      return await requestJson(url);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  throw lastError || new Error(`Timed out waiting for ${url}`);
}

class CdpSocket {
  constructor(wsUrl) {
    this.url = new URL(wsUrl);
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = Buffer.alloc(0);
    this.fragments = [];
  }

  connect() {
    return new Promise((resolve, reject) => {
      const key = crypto.randomBytes(16).toString('base64');
      const socket = net.connect(Number(this.url.port || 80), this.url.hostname);
      this.socket = socket;

      socket.once('connect', () => {
        socket.write(
          [
            `GET ${this.url.pathname}${this.url.search} HTTP/1.1`,
            `Host: ${this.url.host}`,
            'Upgrade: websocket',
            'Connection: Upgrade',
            `Sec-WebSocket-Key: ${key}`,
            'Sec-WebSocket-Version: 13',
            '',
            '',
          ].join('\r\n')
        );
      });

      let handshake = Buffer.alloc(0);
      const onHandshake = (chunk) => {
        handshake = Buffer.concat([handshake, chunk]);
        const marker = handshake.indexOf('\r\n\r\n');
        if (marker === -1) {
          return;
        }

        const head = handshake.slice(0, marker).toString('utf8');
        if (!head.includes('101')) {
          reject(new Error(`WebSocket handshake failed: ${head}`));
          return;
        }

        socket.off('data', onHandshake);
        socket.on('data', (data) => this.handleData(data));
        const rest = handshake.slice(marker + 4);
        if (rest.length) {
          this.handleData(rest);
        }
        resolve();
      };

      socket.on('data', onHandshake);
      socket.on('error', reject);
      socket.on('close', () => {
        for (const { reject: rejectPending } of this.pending.values()) {
          rejectPending(new Error('CDP socket closed'));
        }
        this.pending.clear();
      });
    });
  }

  handleData(data) {
    this.buffer = Buffer.concat([this.buffer, data]);

    while (this.buffer.length >= 2) {
      const first = this.buffer[0];
      const second = this.buffer[1];
      const fin = Boolean(first & 0x80);
      const opcode = first & 0x0f;
      const masked = Boolean(second & 0x80);
      let length = second & 0x7f;
      let offset = 2;

      if (length === 126) {
        if (this.buffer.length < offset + 2) return;
        length = this.buffer.readUInt16BE(offset);
        offset += 2;
      } else if (length === 127) {
        if (this.buffer.length < offset + 8) return;
        const high = this.buffer.readUInt32BE(offset);
        const low = this.buffer.readUInt32BE(offset + 4);
        length = high * 2 ** 32 + low;
        offset += 8;
      }

      let mask = null;
      if (masked) {
        if (this.buffer.length < offset + 4) return;
        mask = this.buffer.slice(offset, offset + 4);
        offset += 4;
      }

      if (this.buffer.length < offset + length) return;

      let payload = this.buffer.slice(offset, offset + length);
      this.buffer = this.buffer.slice(offset + length);

      if (mask) {
        payload = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]));
      }

      if (opcode === 8) {
        this.socket.end();
        return;
      }

      if (opcode === 1 || opcode === 0) {
        this.fragments.push(payload);
        if (!fin) {
          continue;
        }
        const text = Buffer.concat(this.fragments).toString('utf8');
        this.fragments = [];
        this.handleMessage(text);
      }
    }
  }

  handleMessage(text) {
    const message = JSON.parse(text);
    if (!message.id) {
      return;
    }

    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }
    this.pending.delete(message.id);

    if (message.error) {
      pending.reject(new Error(message.error.message || 'CDP command failed'));
    } else {
      pending.resolve(message.result);
    }
  }

  send(method, params = {}, sessionId = null) {
    const id = this.nextId++;
    const message = JSON.stringify({
      id,
      method,
      params,
      ...(sessionId ? { sessionId } : {}),
    });

    const payload = Buffer.from(message);
    const length = payload.length;
    let headerLength = 2;
    if (length >= 126 && length < 65536) {
      headerLength += 2;
    } else if (length >= 65536) {
      headerLength += 8;
    }
    headerLength += 4;

    const frame = Buffer.alloc(headerLength + length);
    frame[0] = 0x81;
    let offset = 2;
    if (length < 126) {
      frame[1] = 0x80 | length;
    } else if (length < 65536) {
      frame[1] = 0x80 | 126;
      frame.writeUInt16BE(length, offset);
      offset += 2;
    } else {
      frame[1] = 0x80 | 127;
      frame.writeUInt32BE(0, offset);
      frame.writeUInt32BE(length, offset + 4);
      offset += 8;
    }

    const mask = crypto.randomBytes(4);
    mask.copy(frame, offset);
    offset += 4;
    for (let index = 0; index < length; index += 1) {
      frame[offset + index] = payload[index] ^ mask[index % 4];
    }

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.write(frame);
    });
  }

  close() {
    if (this.socket) {
      this.socket.end();
    }
  }
}

async function waitForCondition(client, sessionId, expression, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await client.send(
      'Runtime.evaluate',
      {
        expression,
        returnByValue: true,
      },
      sessionId
    );
    if (result.result?.value) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for expression: ${expression}`);
}

async function capture(client, sessionId, outputPath) {
  const result = await client.send(
    'Page.captureScreenshot',
    { format: 'png', fromSurface: true, captureBeyondViewport: false },
    sessionId
  );
  await fs.writeFile(outputPath, Buffer.from(result.data, 'base64'));
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const login = await requestJson(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'user@bfit.com',
      password: 'user123',
    }),
  });
  const auth = login.data;

  const brave = spawn(BRAVE_BIN, [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${path.join('/tmp', `reco-report-profile-${Date.now()}`)}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--hide-scrollbars',
    'about:blank',
  ], {
    stdio: 'ignore',
  });

  let client;
  try {
    const version = await waitForJson(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
    client = new CdpSocket(version.webSocketDebuggerUrl);
    await client.connect();

    const target = await client.send('Target.createTarget', { url: 'about:blank' });
    const attached = await client.send('Target.attachToTarget', {
      targetId: target.targetId,
      flatten: true,
    });
    const sessionId = attached.sessionId;

    await client.send('Page.enable', {}, sessionId);
    await client.send('Runtime.enable', {}, sessionId);
    await client.send(
      'Emulation.setDeviceMetricsOverride',
      {
        width: 1440,
        height: 1100,
        deviceScaleFactor: 1,
        mobile: false,
      },
      sessionId
    );

    await client.send('Page.navigate', { url: APP_URL }, sessionId);
    await waitForCondition(client, sessionId, 'document.readyState === "complete"');
    await client.send(
      'Runtime.evaluate',
      {
        expression: `
          localStorage.setItem('recommendation_model_token', ${JSON.stringify(auth.token)});
          localStorage.setItem('recommendation_model_user', ${JSON.stringify(JSON.stringify(auth.user))});
          true;
        `,
        returnByValue: true,
      },
      sessionId
    );

    await client.send('Page.navigate', { url: `${APP_URL}/dashboard` }, sessionId);
    await waitForCondition(
      client,
      sessionId,
      `document.body.innerText.includes('Daily Command Center') && document.body.innerText.includes('Calories')`
    );
    await new Promise((resolve) => setTimeout(resolve, 1600));
    await client.send('Runtime.evaluate', { expression: 'window.scrollTo(0, 0)' }, sessionId);
    await new Promise((resolve) => setTimeout(resolve, 350));
    await capture(client, sessionId, path.join(OUT_DIR, 'dashboard-main.png'));

    await client.send(
      'Runtime.evaluate',
      {
        expression: `
          const headings = [...document.querySelectorAll('h1,h2,h3,p,button,strong')];
          const target = headings.find((el) => /Eat Out|Delivery|Best Choice|Meal Decision|Suggested While Eating/i.test(el.textContent || ''));
          if (target) {
            target.scrollIntoView({ block: 'center' });
          } else {
            window.scrollTo(0, Math.floor(document.body.scrollHeight * 0.42));
          }
        `,
      },
      sessionId
    );
    await waitForCondition(
      client,
      sessionId,
      `document.body.innerText.includes('Eat Out') || document.body.innerText.includes('Best Choice for You')`
    );
    await new Promise((resolve) => setTimeout(resolve, 900));
    await capture(client, sessionId, path.join(OUT_DIR, 'recommendation-interaction.png'));

    console.log(`Captured ${path.join(OUT_DIR, 'dashboard-main.png')}`);
    console.log(`Captured ${path.join(OUT_DIR, 'recommendation-interaction.png')}`);
  } finally {
    if (client) client.close();
    brave.kill('SIGTERM');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
