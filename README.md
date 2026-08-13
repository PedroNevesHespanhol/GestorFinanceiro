# Gestor Financeiro

Dashboard financeiro pessoal com Open Banking via **Pluggy**, autenticação **Google** e armazenamento **Firebase**. Conecte suas contas bancárias e cartões, sincronize transações automaticamente e acompanhe gastos fixos, receitas recorrentes e contas divididas.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| **Frontend** | Next.js 14 (App Router) · React 18 · TypeScript · Tailwind CSS · Recharts |
| **Backend** | Node.js · Express 4 · TypeScript |
| **Banco** | Firebase Firestore |
| **Auth** | Google OAuth 2.0 via Firebase Auth |
| **Open Banking** | Pluggy SDK (`pluggy-sdk`) + Pluggy Connect Widget |
| **Testes** | Jest + Supertest (backend) · Playwright + emuladores Firebase (E2E) |

O projeto é um **monorepo com npm workspaces** (`backend` e `frontend`), orquestrado pelo `package.json` da raiz.

```
GestorFinanceiro/
├── backend/          # API Express + integração Pluggy/Firebase
├── frontend/         # App Next.js (dashboard)
├── e2e/              # Testes end-to-end (Playwright)
├── setup.ts          # Setup interativo (gera os .env.local)
└── package.json      # Scripts raiz + workspaces
```

---

## 1. Pré-requisitos

- **Node.js 20+** e **npm 9+**
- Conta e credenciais nos serviços abaixo:

| Serviço | O que criar | Onde |
|---------|-------------|------|
| **Pluggy** | `CLIENT_ID` + `CLIENT_SECRET` de desenvolvedor | [dashboard.pluggy.ai](https://dashboard.pluggy.ai) |
| **Firebase** | Projeto com **Firestore** e **Authentication** ativados | [console.firebase.google.com](https://console.firebase.google.com) |
| **Firebase Admin** | Service Account (JSON) — usado no backend | Firebase → Project Settings → Service accounts |
| **Google OAuth** | `CLIENT_ID` + `CLIENT_SECRET` (provedor Google no Firebase Auth) | [console.cloud.google.com](https://console.cloud.google.com) |

> Para **testar** sem conectar um banco real, use os conectores **sandbox** da Pluggy (o widget já vem com `includeSandbox: true`). As credenciais de teste ficam na [documentação da Pluggy](https://docs.pluggy.ai/docs/quickstart).

---

## 2. Clonar e configurar

```bash
# Clonar
git clone <URL_DO_REPOSITORIO> GestorFinanceiro
cd GestorFinanceiro

# Instalar dependências da raiz (necessário para o setup interativo)
npm install

# Setup interativo — pergunta as credenciais e gera:
#   backend/.env.local  e  frontend/.env.local
npm run setup

# Instalar dependências de todos os workspaces
npm run install:all

# Criar coleções e índices no Firestore
npm run init:firebase

# Rodar backend + frontend em paralelo
npm run dev
```

- Backend: **http://localhost:3001**
- Frontend: **http://localhost:3000**

### Alternativa: configurar os `.env` manualmente

O `npm run setup` é opcional. Você pode copiar os exemplos e preencher à mão:

```bash
cp backend/.env.example  backend/.env.local
cp frontend/.env.example frontend/.env.local
```

> ⚠️ O `setup.ts` **não** gera `PLUGGY_WEBHOOK_SECRET` nem `TRANSACTIONS_MAX_PAGE_SIZE`. Se for usar webhooks (produção), adicione `PLUGGY_WEBHOOK_SECRET` manualmente ao `backend/.env.local` (veja a seção [Pluggy](#4-configuração-do-pluggy)).

---

## 3. Variáveis de ambiente

### `backend/.env.local`

| Variável | Obrigatória | Descrição |
|----------|:-----------:|-----------|
| `FIREBASE_PROJECT_ID` | ✅ | ID do projeto Firebase |
| `FIREBASE_CLIENT_EMAIL` | ✅ | E-mail da Service Account |
| `FIREBASE_PRIVATE_KEY` | ✅ | Chave privada da Service Account (com `\n` escapados, entre aspas) |
| `PLUGGY_CLIENT_ID` | ✅ | Client ID da Pluggy |
| `PLUGGY_CLIENT_SECRET` | ✅ | Client Secret da Pluggy |
| `PLUGGY_WEBHOOK_SECRET` | ⚠️ prod | Secret para validar a assinatura HMAC-SHA256 dos webhooks |
| `GOOGLE_CLIENT_ID` | ✅ | Client ID do Google OAuth |
| `GOOGLE_CLIENT_SECRET` | ✅ | Client Secret do Google OAuth |
| `WEBHOOK_BASE_URL` | ✅ | URL pública do backend (usada para montar a webhook URL) |
| `PORT` | — | Porta do backend (padrão `3001`) |
| `CORS_ORIGIN` | — | Origem permitida no CORS (padrão `http://localhost:3000`) |
| `TRANSACTIONS_MAX_PAGE_SIZE` | — | Máx. de transações por consulta (padrão `200`) |

### `frontend/.env.local`

| Variável | Descrição |
|----------|-----------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase Client SDK — API Key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | ex: `projeto.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | ID do projeto |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | ex: `projeto.appspot.com` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Messaging Sender ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | App ID |
| `NEXT_PUBLIC_API_URL` | URL do backend (padrão `http://localhost:3001`) |

> 🔐 As credenciais **Pluggy** e a **Service Account** do Firebase ficam **somente no backend**. Nunca as coloque em variáveis `NEXT_PUBLIC_*` — tudo com esse prefixo é exposto no navegador.

---

## 4. Configuração do Pluggy

Esta é a integração central do projeto. Entenda o fluxo antes de configurar.

### 4.1. Obter credenciais

1. Acesse [dashboard.pluggy.ai](https://dashboard.pluggy.ai) e crie/entre na sua aplicação.
2. Copie o **Client ID** e o **Client Secret**.
3. Coloque em `backend/.env.local`:
   ```bash
   PLUGGY_CLIENT_ID=seu_client_id
   PLUGGY_CLIENT_SECRET=seu_client_secret
   ```

O backend valida essas credenciais na inicialização (`backend/src/services/pluggy.ts`) — se faltarem, o processo aborta com erro.

### 4.2. Como o fluxo de conexão funciona

```
Frontend                        Backend                         Pluggy
   │                               │                               │
   │  POST /pluggy/connect-token   │                               │
   ├──────────────────────────────▶  createConnectToken()          │
   │                               ├──────────────────────────────▶│
   │        { accessToken }        │        connect token          │
   │◀──────────────────────────────┤◀──────────────────────────────┤
   │                                                               │
   │  Abre o Pluggy Connect Widget (CDN) com o connectToken        │
   │  Usuário escolhe o banco e autentica ──────────────────────▶  │
   │                                                               │
   │  onSuccess(itemData)                                          │
   │  POST /pluggy/items { itemId } │                               │
   ├──────────────────────────────▶  fetchItem() + salva no        │
   │                               │  Firestore + dispara sync      │
```

1. **Connect token** — o frontend chama `POST /pluggy/connect-token` (autenticado). O backend gera um token de curta duração (~30 min) associado ao usuário (`clientUserId`).
2. **Widget** — o hook `usePluggyConnect` (`frontend/src/hooks/usePluggyConnect.ts`) carrega o **Pluggy Connect Widget** via CDN e o abre com o token. O usuário escolhe o banco e faz login diretamente na Pluggy — **nenhuma credencial bancária passa pelo nosso backend**.
3. **Registro do item** — ao concluir, o widget chama `onSuccess`, e o frontend registra a conexão via `POST /pluggy/items`. O backend busca os dados do item (`fetchItem`) e dispara a primeira sincronização.
4. **Sincronizações seguintes** — chegam via **webhook** (produção) ou pelo botão de sync manual (`POST /sync`).

### 4.3. Webhooks

Os webhooks mantêm os dados atualizados automaticamente quando a Pluggy termina de sincronizar um item.

**Endpoint:** `POST /webhook` — rota **pública** (sem autenticação), protegida por assinatura HMAC.

**Configuração:**

1. Defina `WEBHOOK_BASE_URL` no `backend/.env.local` com a **URL pública HTTPS** do backend:
   ```bash
   WEBHOOK_BASE_URL=https://seu-backend.com
   ```
2. Defina o secret de validação (obtido no painel da Pluggy):
   ```bash
   PLUGGY_WEBHOOK_SECRET=seu_webhook_secret
   ```
3. O backend só registra a webhook URL na Pluggy se `WEBHOOK_BASE_URL` começar com `https://`. A URL final registrada é `WEBHOOK_BASE_URL/webhook`.

> **Em desenvolvimento local (`http://localhost`) os webhooks NÃO são registrados.** Isso é intencional — a Pluggy não consegue chamar `localhost`. Nesse cenário, a sincronização acontece via `POST /pluggy/items` (logo após conectar) e pelo botão de **sync manual**. Para testar webhooks localmente, exponha o backend com um túnel (ex.: `ngrok http 3001`) e use a URL HTTPS gerada em `WEBHOOK_BASE_URL`.

**Segurança da assinatura** (`backend/src/routes/webhook.ts`):
- Cada requisição é validada com HMAC-SHA256 sobre o corpo bruto, comparando com o header `x-pluggy-signature`.
- Sem `PLUGGY_WEBHOOK_SECRET`: em **dev** a verificação é ignorada (com aviso no log); em **produção** (`NODE_ENV=production`) o webhook é **rejeitado** (falha fechada).

**Eventos tratados:**

| Evento | Ação |
|--------|------|
| `item/created` | Sincronização completa |
| `item/updated` | Sincronização completa |
| `item/error` | Registra erro em `syncLogs` e marca o item como `ERROR` |
| `item/waiting_user_action` | Marca o item como `WAITING_USER_ACTION` |

---

## 5. Endpoints da API

Todas as rotas (exceto `/health`, `/auth/google` e `/webhook`) exigem `Authorization: Bearer <Firebase ID Token>`.

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET`  | `/health` | Health check (público) |
| `POST` | `/auth/google` | Cria/atualiza usuário a partir do ID token do Firebase |
| `GET`  | `/auth/me` | Perfil do usuário autenticado |
| `POST` | `/pluggy/connect-token` | Gera connect token da Pluggy |
| `POST` | `/pluggy/items` | Registra um item conectado e dispara sync |
| `POST` | `/webhook` | Recebe eventos da Pluggy (público, HMAC) |
| `POST` | `/sync` | Sincronização manual de todos os itens do usuário |
| `GET`  | `/sync/logs` | Últimos 50 registros de sincronização |
| `GET`  | `/accounts` | Contas e cartões |
| `GET`/`POST`/`PUT`/`DELETE` | `/transactions` | Transações |
| `*`    | `/fixed-expenses`, `/recurring-income` | Gastos fixos e receitas recorrentes |
| `*`    | `/split-reimbursements` | Contas divididas / reembolsos |
| `GET`  | `/planning/annual` | Planejamento anual |

---

## 6. Firestore

### Schema

```
users/{userId}
├── pluggyItems/          ← Conexões bancárias (por banco/conector)
├── accounts/             ← Contas e cartões sincronizados via Pluggy
├── transactions/         ← Transações (deduplicadas por pluggyTransactionId)
├── fixedExpenses/        ← Gastos fixos mensais (dados do usuário)
├── recurringIncome/      ← Receitas recorrentes (dados do usuário)
├── splitReimbursements/  ← Contas divididas (dados do usuário)
└── syncLogs/             ← Histórico de sincronizações
```

### Regras de segurança

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth.uid == userId;
    }
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth.uid == userId;
    }
  }
}
```

---

## 7. Testes

### Backend (unitário/integração)

```bash
# Todos os testes
npm test --workspace=backend

# Com cobertura
npm run test:coverage --workspace=backend
```

### End-to-end (Playwright + emuladores Firebase)

Requer a suíte de emuladores do Firebase (portas 4000/4001/8090/9099).

```bash
npm run test:e2e
```

---

## 8. Deploy

### Backend

```bash
cd backend
npm run build      # gera dist/
npm start          # node dist/src/index.js
```

Publique em Railway, Fly.io, Render, etc. Configure **todas** as variáveis de `backend/.env.example` no ambiente de produção.

### Frontend

```bash
cd frontend
npm run build
npm start
```

Publique na Vercel, Netlify, etc. Configure as variáveis `NEXT_PUBLIC_*` de `frontend/.env.example`.

### Checklist de produção

- [ ] `WEBHOOK_BASE_URL` aponta para a URL HTTPS de produção do backend
- [ ] `PLUGGY_WEBHOOK_SECRET` configurado (webhook é rejeitado sem ele em produção)
- [ ] `NODE_ENV=production` no backend
- [ ] `CORS_ORIGIN` aponta para o domínio do frontend
- [ ] `NEXT_PUBLIC_API_URL` aponta para o backend de produção
- [ ] Domínio do frontend autorizado no Firebase Auth
