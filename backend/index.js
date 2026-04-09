import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import helmet from 'helmet';
import fs from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';
import secureJsonParse from 'secure-json-parse';
import authRouter from './routes/authRoutes.js';
import adminRouter from './routes/adminRoutes.js';
import usersRouter from './routes/usersRoutes.js';
import libraryRouter from './routes/libraryRoutes.js';
import { API_MOUNTS } from './config/apiMounts.js';
import { initDb } from './db.js';
import { Server as SocketIOServer } from 'socket.io';
import { setIO } from './realtime.js';
import {
  apiLimiter,
  isLocalInitRequest,
  trustedNetworkMiddleware,
  requireBrowserOriginForMutations,
} from './security.js';

dotenv.config();

if (process.env.NODE_ENV === 'production') {
  const fe = String(process.env.FRONTEND_URL || '').trim();
  if (!fe) {
    throw new Error('FRONTEND_URL must be set when NODE_ENV=production');
  }
  try {
    new URL(fe);
  } catch {
    throw new Error('FRONTEND_URL must be a valid URL');
  }
}

const app = express();
const PORT = process.env.PORT || 8080;

if (process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
}

const devOrigins = [
  'http://localhost:4000',
  'http://127.0.0.1:4000',
  'https://localhost:4000',
  'https://127.0.0.1:4000',
  'http://localhost:4001',
  'http://127.0.0.1:4001',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://192.168.0.20:3000',
];

function productionCorsOrigin(origin, callback) {
  const fe = String(process.env.FRONTEND_URL || '')
    .trim()
    .replace(/\/$/, '');
  if (!origin) {
    return callback(null, true);
  }
  const o = origin.replace(/\/$/, '');
  if (o === fe) {
    return callback(null, true);
  }
  return callback(new Error('Not allowed by CORS'));
}

const corsOptions = {
  origin: process.env.NODE_ENV === 'production' ? productionCorsOrigin : devOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));
// Ensure Express responds to preflight requests
app.options('*', cors(corsOptions));
app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => {
  if (req.body === undefined || req.body === null) return next();
  if (Buffer.isBuffer(req.body)) return next();
  try {
    req.body = secureJsonParse.parse(JSON.stringify(req.body));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  next();
});
app.use('/api', requireBrowserOriginForMutations);
app.use(
  helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: false,
    ...(process.env.NODE_ENV === 'production'
      ? { hsts: { maxAge: 31536000, includeSubDomains: true, preload: false } }
      : {}),
  })
);
app.use('/api', apiLimiter);
app.use('/api', trustedNetworkMiddleware);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
    );
  }
  next();
});

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.use(API_MOUNTS.AUTH, authRouter);
app.use(API_MOUNTS.ADMIN, adminRouter);
app.use(API_MOUNTS.USERS, usersRouter);
app.use(API_MOUNTS.LIBRARY, libraryRouter);

// Initialize DB on demand for local development only
app.post('/api/init-db', async (_req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }
  if (!isLocalInitRequest(_req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    await initDb();
    res.json({ message: 'Database initialized' });
  } catch (err) {
    console.error('Init DB error', err);
    res.status(500).json({ error: 'Failed to initialize database' });
  }
});

app.use((err, _req, res, _next) => {
  if (err && String(err.message || '').includes('CORS')) {
    if (!res.headersSent) return res.status(403).json({ error: 'Forbidden' });
    return;
  }
  console.error('Unhandled error', err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Internal error' });
});

const socketCors = {
  origin:
    process.env.NODE_ENV === 'production'
      ? String(process.env.FRONTEND_URL || '').trim()
      : [
          'http://localhost:4000',
          'https://localhost:4000',
          'http://localhost:4001',
          'http://localhost:5173',
          'http://localhost:3000',
          'http://localhost:3001',
          'http://localhost:3002',
          'http://192.168.0.20:3000',
        ],
  credentials: true,
};

function attachRealtime(httpServer) {
  const io = new SocketIOServer(httpServer, { cors: socketCors });
  setIO(io);
  io.on('connection', (socket) => {
    socket.on('disconnect', () => {});
  });
}

function resolveTlsFilePath(p) {
  if (!p) return p;
  const s = String(p).trim();
  if (path.isAbsolute(s)) return s;
  return path.resolve(process.cwd(), s);
}

const certPath = resolveTlsFilePath(process.env.HTTPS_CERT_PATH);
const keyPath = resolveTlsFilePath(process.env.HTTPS_KEY_PATH);
if (certPath && keyPath) {
  let tlsServer;
  try {
    tlsServer = https.createServer(
      { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) },
      app
    );
  } catch (e) {
    console.error('Failed to read TLS files:', e.message);
    process.exit(1);
  }
  attachRealtime(tlsServer);
  tlsServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Internal training server running on https://localhost:${PORT}`);
  });
} else {
  const server = http.createServer(app);
  attachRealtime(server);
  if (process.env.NODE_ENV === 'production') {
    console.warn(
      'Server is HTTP-only: set HTTPS_CERT_PATH and HTTPS_KEY_PATH, or terminate TLS at a reverse proxy.'
    );
  }
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Internal training server running on http://localhost:${PORT}`);
  });
}
