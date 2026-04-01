import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import helmet from 'helmet';
import authRouter from './routes/authRoutes.js';
import adminRouter from './routes/adminRoutes.js';
import usersRouter from './routes/usersRoutes.js';
import libraryRouter from './routes/libraryRoutes.js';
import { API_MOUNTS } from './config/apiMounts.js';
import { initDb } from './db.js';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { setIO } from './realtime.js';
import { apiLimiter, isLocalInitRequest } from './security.js';

dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 8080;

const corsOptions = {
  origin:
    process.env.NODE_ENV === 'production'
      ? process.env.FRONTEND_URL
      : [
          'http://localhost:4000',
          'http://127.0.0.1:4000',
          'http://localhost:4001',
          'http://127.0.0.1:4001',
          'http://localhost:5173',
          'http://127.0.0.1:5173',
          'http://localhost:3000',
          'http://localhost:3001',
          'http://localhost:3002',
          'http://192.168.0.20:3000',
        ],
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
app.use(
  helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: false,
  })
);
app.use('/api', apiLimiter);

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

const io = new SocketIOServer(server, {
  cors: {
    origin:
      process.env.NODE_ENV === 'production'
        ? process.env.FRONTEND_URL
        : [
            'http://localhost:4000',
            'http://localhost:4001',
            'http://localhost:5173',
            'http://localhost:3000',
            'http://localhost:3001',
            'http://localhost:3002',
            'http://192.168.0.20:3000',
          ],
    credentials: true,
  },
});
setIO(io);

io.on('connection', (socket) => {
  socket.on('disconnect', () => {});
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Internal training server running on http://localhost:${PORT}`);
});
