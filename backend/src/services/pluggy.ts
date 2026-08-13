import { PluggyClient } from 'pluggy-sdk';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

if (!process.env.PLUGGY_CLIENT_ID || !process.env.PLUGGY_CLIENT_SECRET) {
  throw new Error(
    'Missing Pluggy environment variables: PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET'
  );
}

export const pluggyClient = new PluggyClient({
  clientId: process.env.PLUGGY_CLIENT_ID,
  clientSecret: process.env.PLUGGY_CLIENT_SECRET,
});

export interface CreateConnectTokenParams {
  clientUserId: string;
  webhookUrl?: string;
}

export async function createConnectToken(
  params: CreateConnectTokenParams
): Promise<string> {
  const result = await pluggyClient.createConnectToken(undefined, {
    clientUserId: params.clientUserId,
    ...(params.webhookUrl ? { webhookUrl: params.webhookUrl } : {}),
  });
  return result.accessToken;
}
