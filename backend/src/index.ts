import * as dotenv from 'dotenv';
// .env.local vence .env (primeiro carregado ganha sem override), e variáveis
// reais de ambiente sempre vencem os arquivos — necessário para testes/CI.
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

// Config — must be imported after dotenv
import './config/firebase';

// Middleware
import { rateLimiter } from './middleware/rateLimiter';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

// Routes
import authRoutes from './routes/auth';
import accountsRoutes from './routes/accounts';
import transactionsRoutes from './routes/transactions';
import expensesRoutes from './routes/expenses';
import webhookRoutes from './routes/webhook';
import syncRoutes from './routes/sync';
import splitReimbursementsRoutes from './routes/splitReimbursements';
import planningRoutes from './routes/planning';

const app = express();

// ─── Security middleware ──────────────────────────────────────────────────────

app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  })
);

// ─── Rate limiter (all routes) ────────────────────────────────────────────────

app.use(rateLimiter);

// ─── Body parsing ─────────────────────────────────────────────────────────────
//
// Captura o raw body em req.rawBody para permitir verificação exata de
// assinatura HMAC (ex: webhook da Pluggy), já que req.body já vem parseado.

app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
    },
  })
);
app.use(express.urlencoded({ extended: false }));

// ─── Health check ─────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Public routes (no auth) ──────────────────────────────────────────────────

// Webhook MUST be public
app.use('/webhook', webhookRoutes);

// ─── Auth routes ──────────────────────────────────────────────────────────────

app.use('/auth', authRoutes);

// ─── Protected routes ─────────────────────────────────────────────────────────

app.use('/accounts', accountsRoutes);
app.use('/transactions', transactionsRoutes);
app.use('/', expensesRoutes);           // /fixed-expenses, /recurring-income
app.use('/split-reimbursements', splitReimbursementsRoutes);
app.use('/', syncRoutes);               // /pluggy/connect-token, /sync
app.use('/planning', planningRoutes);  // /planning/annual

// ─── 404 and error handlers ───────────────────────────────────────────────────

app.use(notFoundHandler);
app.use(errorHandler);

// ─── Start server ─────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? '3001', 10);

app.listen(PORT, () => {
  console.log(`GestorFinanceiro backend running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV ?? 'development'}`);
});

export default app;
