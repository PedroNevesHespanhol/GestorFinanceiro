import { defineConfig } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * E2E full-stack:
 *  - Emuladores Firebase (Auth :9099, Firestore :8090) — nenhum dado real é tocado
 *  - Backend Express real na porta 4001 (apontado para os emuladores)
 *  - Frontend Next.js real na porta 4000 (Auth via emulador, API → :4001)
 *
 * Portas dedicadas (4000/4001) para não conflitar com servidores de dev (3000/3001).
 */

const root = path.resolve(__dirname, '..');

const AUTH_EMULATOR = '127.0.0.1:9099';
const FIRESTORE_EMULATOR = '127.0.0.1:8090';
const FRONTEND_URL = 'http://localhost:4000';
const BACKEND_URL = 'http://localhost:4001';

function readEnvVar(file: string, key: string): string | undefined {
  try {
    const content = fs.readFileSync(file, 'utf8');
    const match = content.match(new RegExp(`^${key}=(.*)$`, 'm'));
    return match?.[1]?.trim().replace(/^"(.*)"$/, '$1');
  } catch {
    return undefined;
  }
}

// O projectId do emulador precisa bater com o do frontend (aud do token) e o do
// backend (verifyIdToken). Lê do .env.local do frontend; fallback para um id demo.
const projectId =
  readEnvVar(path.join(root, 'frontend', '.env.local'), 'NEXT_PUBLIC_FIREBASE_PROJECT_ID') ??
  'demo-gestor-financeiro';

// Disponibiliza para os helpers (seed via firebase-admin no processo de teste)
process.env.E2E_FIREBASE_PROJECT_ID = projectId;
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_EMULATOR;
process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_EMULATOR;

const baseEnv = process.env as Record<string, string>;

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [['list']],
  use: {
    baseURL: FRONTEND_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: `npx firebase emulators:start --only auth,firestore --project ${projectId}`,
      url: `http://${FIRESTORE_EMULATOR}/`,
      cwd: root,
      reuseExistingServer: true,
      timeout: 180_000,
    },
    {
      command: 'npx ts-node src/index.ts',
      url: `${BACKEND_URL}/health`,
      cwd: path.join(root, 'backend'),
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        ...baseEnv,
        PORT: '4001',
        CORS_ORIGIN: FRONTEND_URL,
        FIREBASE_AUTH_EMULATOR_HOST: AUTH_EMULATOR,
        FIRESTORE_EMULATOR_HOST: FIRESTORE_EMULATOR,
      },
    },
    {
      command: 'npx next dev -p 4000',
      url: `${FRONTEND_URL}/login`,
      cwd: path.join(root, 'frontend'),
      reuseExistingServer: true,
      timeout: 180_000,
      env: {
        ...baseEnv,
        NEXT_PUBLIC_API_URL: BACKEND_URL,
        NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST: AUTH_EMULATOR,
      },
    },
  ],
});
