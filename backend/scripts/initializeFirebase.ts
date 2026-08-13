import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local'), override: true });

import * as admin from 'firebase-admin';

async function main(): Promise<void> {
  console.log('🔥 Initializing Firebase connection...');

  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (
    !process.env.FIREBASE_PROJECT_ID ||
    !process.env.FIREBASE_CLIENT_EMAIL ||
    !privateKey
  ) {
    console.error(
      '❌ Missing Firebase environment variables.\n' +
        'Please set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in your .env file.'
    );
    process.exit(1);
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey,
      }),
    });
  }

  const db = admin.firestore();

  try {
    console.log('📡 Testing Firestore connectivity...');

    // Write a test document
    const testRef = db.collection('_setup_test').doc('ping');
    await testRef.set({
      timestamp: admin.firestore.Timestamp.now(),
      message: 'GestorFinanceiro setup test',
    });

    // Read it back
    const snap = await testRef.get();
    if (!snap.exists) {
      throw new Error('Test document was not found after write');
    }

    // Clean up
    await testRef.delete();

    console.log('✅ Setup concluído com sucesso');
    console.log(`   Project: ${process.env.FIREBASE_PROJECT_ID}`);
    console.log('   Firestore read/write verified');
  } catch (err) {
    console.error('❌ Firebase connectivity test failed:', err);
    process.exit(1);
  }

  process.exit(0);
}

main();
