import { auth } from './firebase';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function getAuthHeader(): Promise<HeadersInit> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User not authenticated');
  }
  const token = await user.getIdToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export async function apiGet<T>(path: string): Promise<T> {
  const headers = await getAuthHeader();
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'GET',
    headers,
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error ${response.status}: ${errorText}`);
  }
  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const headers = await getAuthHeader();
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error ${response.status}: ${errorText}`);
  }
  return response.json() as Promise<T>;
}

export async function apiPut<T>(path: string, body?: unknown): Promise<T> {
  const headers = await getAuthHeader();
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'PUT',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error ${response.status}: ${errorText}`);
  }
  return response.json() as Promise<T>;
}

export async function apiDelete(path: string): Promise<void> {
  const headers = await getAuthHeader();
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'DELETE',
    headers,
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error ${response.status}: ${errorText}`);
  }
}
