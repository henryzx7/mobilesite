require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const https = require('https');
const axios = require('axios');
const QRCode = require('qrcode');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');

const app = express();
const PORT = Number(process.env.PORT || 3000);

const PRODUCT_PRICE = Number(process.env.PRODUCT_PRICE || 14.90).toFixed(2);
const PRODUCT_DOWNLOAD_URL = process.env.PRODUCT_DOWNLOAD_URL || 'https://drive.google.com/file/d/1fgTe0VI7MHdPE67wos_H-vkPLJiFXzIi/view';
const APP_SECRET = process.env.APP_SECRET;
const IS_SANDBOX = String(process.env.EFI_SANDBOX || 'true').toLowerCase() === 'true';
const EFI_BASE_URL = IS_SANDBOX
  ? 'https://pix-h.api.efipay.com.br'
  : 'https://pix.api.efipay.com.br';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"]
    }
  }
}));
app.use(express.json({ limit: '50kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const checkoutLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false
});

let tokenCache = { accessToken: null, expiresAt: 0 };
let httpsAgent = null;

function ensureConfig() {
  const required = [
    'EFI_CLIENT_ID',
    'EFI_CLIENT_SECRET',
    'EFI_CERT_PATH',
    'EFI_PIX_KEY',
    'APP_SECRET'
  ];

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    const error = new Error(`Configuração ausente: ${missing.join(', ')}`);
    error.code = 'MISSING_CONFIG';
    throw error;
  }

  const certPath = path.resolve(__dirname, process.env.EFI_CERT_PATH);
  if (!fs.existsSync(certPath)) {
    const error = new Error(`Certificado P12 não encontrado em ${certPath}`);
    error.code = 'CERT_NOT_FOUND';
    throw error;
  }

  if (!httpsAgent) {
    httpsAgent = new https.Agent({
      pfx: fs.readFileSync(certPath),
      passphrase: process.env.EFI_CERT_PASSPHRASE || undefined,
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2'
    });
  }
}

async function getAccessToken() {
  ensureConfig();

  if (tokenCache.accessToken && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.accessToken;
  }

  const basic = Buffer.from(
    `${process.env.EFI_CLIENT_ID}:${process.env.EFI_CLIENT_SECRET}`
  ).toString('base64');

  const response = await axios.post(
    `${EFI_BASE_URL}/oauth/token`,
    { grant_type: 'client_credentials' },
    {
      httpsAgent,
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/json',
        'Accept-Encoding': 'identity'
      },
      timeout: 20_000
    }
  );

  tokenCache = {
    accessToken: response.data.access_token,
    expiresAt: Date.now() + (Number(response.data.expires_in || 3600) * 1000)
  };

  return tokenCache.accessToken;
}

async function efiRequest(method, route, data) {
  const accessToken = await getAccessToken();

  const response = await axios({
    method,
    url: `${EFI_BASE_URL}${route}`,
    data,
    httpsAgent,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept-Encoding': 'identity'
    },
    timeout: 20_000
  });

  return response.data;
}

function signOrder(txid) {
  const expiresAt = Date.now() + 60 * 60 * 1000;
  const payload = `${txid}.${expiresAt}`;
  const signature = crypto
    .createHmac('sha256', APP_SECRET)
    .update(payload)
    .digest('hex');

  return Buffer.from(`${payload}.${signature}`).toString('base64url');
}

function verifyOrderToken(token) {
  if (!APP_SECRET || !token) return null;

  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const parts = decoded.split('.');
    if (parts.length !== 3) return null;

    const [txid, expiresAtRaw, signature] = parts;
    const expiresAt = Number(expiresAtRaw);
    if (!txid || !Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;

    const expected = crypto
      .createHmac('sha256', APP_SECRET)
      .update(`${txid}.${expiresAt}`)
      .digest('hex');

    const sigBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    if (sigBuffer.length !== expectedBuffer.length) return null;
    if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) return null;

    return { txid, expiresAt };
  } catch {
    return null;
  }
}

function safeEfiError(error) {
  const status = error.response?.status || 500;
  const detail = error.response?.data?.detail
    || error.response?.data?.mensagem
    || error.response?.data?.title
    || error.message;

  console.error('Efí/API error:', status, error.response?.data || error.message);
  return { status, detail };
}

app.post('/api/payment', checkoutLimiter, async (req, res) => {
  try {
    ensureConfig();

    const body = {
      calendario: { expiracao: 1800 },
      valor: { original: PRODUCT_PRICE },
      chave: process.env.EFI_PIX_KEY,
      solicitacaoPagador: 'Ebook Segredos para Conquistar o Amor Depois dos 50'
    };

    const charge = await efiRequest('POST', '/v2/cob', body);

    if (!charge.txid || !charge.pixCopiaECola) {
      throw new Error('A Efí não retornou txid/pixCopiaECola para a cobrança.');
    }

    const qrCodeImage = await QRCode.toDataURL(charge.pixCopiaECola, {
      margin: 1,
      width: 320,
      errorCorrectionLevel: 'M'
    });

    const orderToken = signOrder(charge.txid);

    res.status(201).json({
      ok: true,
      orderToken,
      txid: charge.txid,
      amount: PRODUCT_PRICE,
      pixCopyPaste: charge.pixCopiaECola,
      qrCodeImage,
      expiresIn: Number(charge.calendario?.expiracao || 1800)
    });
  } catch (error) {
    const efiError = safeEfiError(error);
    const isConfig = ['MISSING_CONFIG', 'CERT_NOT_FOUND'].includes(error.code);

    res.status(isConfig ? 503 : Math.min(Math.max(efiError.status, 400), 599)).json({
      ok: false,
      message: isConfig
        ? 'O checkout ainda precisa das credenciais/certificado da Efí no servidor.'
        : 'Não foi possível gerar o Pix agora.',
      detail: process.env.NODE_ENV === 'development' ? efiError.detail : undefined
    });
  }
});

app.get('/api/payment/:orderToken/status', checkoutLimiter, async (req, res) => {
  try {
    const order = verifyOrderToken(req.params.orderToken);
    if (!order) {
      return res.status(400).json({ ok: false, message: 'Pedido inválido ou expirado.' });
    }

    const charge = await efiRequest('GET', `/v2/cob/${encodeURIComponent(order.txid)}`);
    const amountMatches = String(charge.valor?.original) === PRODUCT_PRICE;
    const keyMatches = String(charge.chave) === String(process.env.EFI_PIX_KEY);
    const paid = charge.status === 'CONCLUIDA' && amountMatches && keyMatches;

    if (!paid) {
      return res.json({
        ok: true,
        paid: false,
        status: charge.status || 'ATIVA'
      });
    }

    return res.json({
      ok: true,
      paid: true,
      status: charge.status,
      downloadUrl: PRODUCT_DOWNLOAD_URL
    });
  } catch (error) {
    const efiError = safeEfiError(error);
    return res.status(502).json({
      ok: false,
      message: 'Não foi possível consultar o pagamento agora.',
      detail: process.env.NODE_ENV === 'development' ? efiError.detail : undefined
    });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, environment: IS_SANDBOX ? 'sandbox' : 'production' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Site disponível em http://localhost:${PORT}`);
  console.log(`Efí: ${IS_SANDBOX ? 'homologação' : 'produção'}`);
});
