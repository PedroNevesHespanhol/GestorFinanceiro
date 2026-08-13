import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

function askSecret(question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    stdin.setRawMode?.(true);
    stdin.resume();
    let value = '';
    stdin.setEncoding('utf8');
    stdin.on('data', (char: string) => {
      if (char === '\n' || char === '\r') {
        stdin.setRawMode?.(false);
        stdin.pause();
        process.stdout.write('\n');
        resolve(value);
      } else if (char === '') {
        process.exit();
      } else if (char === '') {
        if (value.length > 0) {
          value = value.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else {
        value += char;
        process.stdout.write('*');
      }
    });
  });
}

async function validatePluggy(clientId: string, clientSecret: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.pluggy.ai/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, clientSecret }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function main() {
  console.log('\n🚀 Gestor Financeiro — Setup Interativo\n');
  console.log('Você vai precisar das seguintes credenciais:');
  console.log('  - Firebase: Project ID, Client Email e Private Key (Service Account)');
  console.log('  - Firebase Client SDK: API Key, Auth Domain, etc.');
  console.log('  - Pluggy: Client ID e Client Secret');
  console.log('  - Google OAuth: Client ID e Client Secret\n');

  // Firebase Admin
  console.log('── Firebase Admin SDK (Service Account) ──');
  const firebaseProjectId = await ask('Firebase Project ID: ');
  const firebaseClientEmail = await ask('Firebase Client Email: ');
  const firebasePrivateKey = await ask('Firebase Private Key (cole tudo, incluindo \\n): ');

  // Firebase Client SDK
  console.log('\n── Firebase Client SDK ──');
  const firebaseApiKey = await ask('Firebase API Key: ');
  const firebaseAuthDomain = await ask('Firebase Auth Domain (ex: projeto.firebaseapp.com): ');
  const firebaseStorageBucket = await ask('Firebase Storage Bucket (ex: projeto.appspot.com): ');
  const firebaseMessagingSenderId = await ask('Firebase Messaging Sender ID: ');
  const firebaseAppId = await ask('Firebase App ID: ');

  // Pluggy
  console.log('\n── Pluggy ──');
  const pluggyClientId = await ask('Pluggy Client ID: ');
  const pluggyClientSecret = await askSecret('Pluggy Client Secret: ');
  const pluggyWebhookSecret = await askSecret('Pluggy Webhook Secret (segredo que você define e registra na Pluggy como custom header X-Webhook-Secret; obrigatório em produção) [deixe vazio para pular]: ');

  // Google OAuth
  console.log('\n── Google OAuth ──');
  const googleClientId = await ask('Google Client ID: ');
  const googleClientSecret = await askSecret('Google Client Secret: ');

  // Webhook URL
  console.log('\n── URLs ──');
  const webhookBaseUrl = await ask('Backend URL (para webhooks, ex: https://seu-backend.com) [http://localhost:3001]: ');
  const corsOrigin = await ask('Frontend URL (para CORS) [http://localhost:3000]: ');

  rl.close();

  console.log('\n🔍 Validando credenciais...');

  // Validar Pluggy
  process.stdout.write('  Pluggy... ');
  const pluggyValid = await validatePluggy(pluggyClientId, pluggyClientSecret);
  if (pluggyValid) {
    console.log('✅');
  } else {
    console.log('⚠️  Não foi possível validar (verifique as credenciais depois)');
  }

  // Gerar .env.local no backend
  const backendEnv = [
    `FIREBASE_PROJECT_ID=${firebaseProjectId}`,
    `FIREBASE_CLIENT_EMAIL=${firebaseClientEmail}`,
    `FIREBASE_PRIVATE_KEY="${firebasePrivateKey.replace(/\\n/g, '\\n')}"`,
    `PLUGGY_CLIENT_ID=${pluggyClientId}`,
    `PLUGGY_CLIENT_SECRET=${pluggyClientSecret}`,
    `PLUGGY_WEBHOOK_SECRET=${pluggyWebhookSecret}`,
    `GOOGLE_CLIENT_ID=${googleClientId}`,
    `GOOGLE_CLIENT_SECRET=${googleClientSecret}`,
    `WEBHOOK_BASE_URL=${webhookBaseUrl || 'http://localhost:3001'}`,
    `PORT=3001`,
    `CORS_ORIGIN=${corsOrigin || 'http://localhost:3000'}`,
  ].join('\n');

  // Gerar .env.local no frontend
  const frontendEnv = [
    `NEXT_PUBLIC_FIREBASE_API_KEY=${firebaseApiKey}`,
    `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${firebaseAuthDomain}`,
    `NEXT_PUBLIC_FIREBASE_PROJECT_ID=${firebaseProjectId}`,
    `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=${firebaseStorageBucket}`,
    `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=${firebaseMessagingSenderId}`,
    `NEXT_PUBLIC_FIREBASE_APP_ID=${firebaseAppId}`,
    `NEXT_PUBLIC_API_URL=${webhookBaseUrl || 'http://localhost:3001'}`,
  ].join('\n');

  const backendEnvPath = path.join(__dirname, 'backend', '.env.local');
  const frontendEnvPath = path.join(__dirname, 'frontend', '.env.local');

  fs.mkdirSync(path.join(__dirname, 'backend'), { recursive: true });
  fs.mkdirSync(path.join(__dirname, 'frontend'), { recursive: true });

  fs.writeFileSync(backendEnvPath, backendEnv);
  fs.writeFileSync(frontendEnvPath, frontendEnv);

  console.log('\n✅ Setup concluído com sucesso!\n');
  console.log(`  📄 backend/.env.local gerado`);
  console.log(`  📄 frontend/.env.local gerado\n`);
  console.log('Próximos passos:');
  console.log('  1. npm run install:all');
  console.log('  2. npm run init:firebase   # Inicializa coleções no Firestore');
  console.log('  3. npm run dev             # Inicia backend + frontend\n');

  if (!pluggyValid) {
    console.log('⚠️  Lembre-se de verificar suas credenciais Pluggy em dashboard.pluggy.ai\n');
  }
}

main().catch((err) => {
  console.error('❌ Erro durante setup:', err);
  rl.close();
  process.exit(1);
});
