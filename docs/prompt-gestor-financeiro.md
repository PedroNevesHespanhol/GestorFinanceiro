# 📝 PROMPT FINAL - Gestor Financeiro com Pluggy + Google Auth + Firebase

Copie e cole no Claude Code:

```

## 🎯 PROJETO: Gestor Financeiro com Pluggy + Google Auth + Firebase

### STACK CONFIRMADA:
- Frontend: Next.js 14+ (App Router) + TypeScript + React
- Backend: Node.js + Express + TypeScript
- Database: Firebase Firestore (NoSQL)
- Auth: Google OAuth 2.0 + Firebase Auth
- External API: Pluggy SDK (agregador de Open Banking)

### INTEGRAÇÕES CRÍTICAS:
1. **Pluggy SDK** para sincronizar:
   - Contas bancárias (checking, savings)
   - Cartões de crédito (saldo, limite disponível)
   - Transações (últimos 90 dias com categorização)
   - Dados de identidade
   - Investimentos (se aplicável)
   - Faturas de cartão

2. **Pluggy Connect Widget** para usuário conectar bancos

3. **Webhooks** para sincronização automática quando Pluggy atualiza

4. **Google OAuth** para autenticação

5. **Firebase Firestore** com estrutura otimizada para Pluggy

---

## 📊 SCHEMA FIRESTORE DETALHADO

### **Collection: `users/{userId}`**
```typescript
{
  id: string;                    // Firebase UID
  email: string;
  name: string;
  googleId: string;
  createdAt: timestamp;
  pluggyCustomerId?: string;
}
```

---

### **SubCollection: `users/{userId}/pluggyItems`** (Conexões Bancárias)
```typescript
{
  id: string;                    // Mesmo que pluggyItemId
  pluggyItemId: string;          // ID Pluggy (UNIQUE)
  connectorId: number;           // Ex: 201 (Nubank), 0 (Sandbox)
  connectorName: string;         // Ex: "Nubank", "Bradesco"
  status: 'UPDATED' | 'ERROR' | 'WAITING_USER_ACTION';
  statusDetail?: string;
  lastUpdatedAt: timestamp;      // Última sync bem-sucedida
  lastSyncAttempt: timestamp;    // Última tentativa
  webhookUrl: string;
  createdAt: timestamp;
}
```

**Índice:** `(userId, lastUpdatedAt DESC)`

---

### **SubCollection: `users/{userId}/accounts`** (Contas e Cartões)
```typescript
{
  id: string;                    // ID próprio
  pluggyAccountId: string;       // ID Pluggy (UNIQUE)
  pluggyItemId: string;          // Ref. ao pluggyItems
  type: 'BANK' | 'CREDIT';
  subtype: 'CHECKING_ACCOUNT' | 'SAVINGS_ACCOUNT' | 'CREDIT_CARD' | string;
  name: string;                  // Ex: "Nubank Mastercard"
  number: string;                // ****1234
  balance: number;               // Saldo em BRL
  currencyCode: 'BRL';
  
  creditData?: {
    creditLimit: number;         // Limite total
    availableCreditLimit: number; // Limite disponível
    balanceCloseDate: string;    // YYYY-MM-DD
    balanceDueDate: string;      // YYYY-MM-DD
  };
  
  updatedAt: timestamp;
}
```

**Índices:** 
- `(userId, type)`
- `(userId, updatedAt DESC)`

---

### **SubCollection: `users/{userId}/transactions`** (Transações do Pluggy)
```typescript
{
  id: string;                    // ID próprio
  pluggyTransactionId: string;   // ID Pluggy (UNIQUE - evita duplicatas!)
  accountId: string;             // Ref. ao accounts
  description: string;           // "MERCADO LIVRE"
  amount: number;                // Negativo = saída, Positivo = entrada
  date: timestamp;               // Data da transação
  type: 'DEBIT' | 'CREDIT';
  category: string;              // Do Pluggy: "Shopping", "Alimentação"
  
  paymentData?: {
    paymentMethod: string;       // "CREDIT_CARD" | "PIX" | "DEBIT_CARD"
    payer?: { name: string };
    receiver?: { name: string };
  };
  
  // Campos do seu sistema (sobrescritas do usuário)
  userCategory?: string;         // Categoria customizada do usuário
  tags?: string[];               // ["trabalho", "urgente"]
  notes?: string;
  linkedSplitReimbursement?: string; // Ref. a splitReimbursements
  
  syncedAt: timestamp;           // Quando foi trazido do Pluggy
}
```

**Índices:**
- `(userId, date DESC)`
- `(userId, accountId, date DESC)`
- `(userId, category)`
- `(userId, pluggyTransactionId)` para queries de dedupplicação

---

### **SubCollection: `users/{userId}/fixedExpenses`** (Gastos Mensais - SEUS DADOS)
```typescript
{
  id: string;
  name: string;                  // "Aluguel", "Internet"
  amount: number;
  frequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
  category: string;              // "Moradia", "Utilidades"
  dueDate?: number;              // Dia do mês (1-31)
  active: boolean;
  createdAt: timestamp;
}
```

---

### **SubCollection: `users/{userId}/recurringIncome`** (Entradas Recorrentes - SEUS DADOS)
```typescript
{
  id: string;
  name: string;                  // "Salário", "Freelance"
  amount: number;
  frequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
  category: string;              // "Salário", "Bônus"
  expectedDate?: number;         // Dia do mês
  active: boolean;
  createdAt: timestamp;
}
```

---

### **SubCollection: `users/{userId}/splitReimbursements`** (Contas Divididas - SEUS DADOS)
```typescript
{
  id: string;
  description: string;           // "Almoço em grupo"
  totalAmount: number;
  currency: 'BRL';
  date: timestamp;
  participants: Array<{
    id: string;                  // UUID ou email
    name: string;
    email?: string;
    amount: number;              // Quanto deve/é devido
    settled: boolean;
    settledAt?: timestamp;
  }>;
  status: 'PENDING' | 'PARTIALLY_SETTLED' | 'SETTLED';
  paidBy: string;                // Email/ID de quem pagou
  createdAt: timestamp;
}
```

---

### **SubCollection: `users/{userId}/syncLogs`** (Histórico de Sincronizações)
```typescript
{
  id: string;
  pluggyItemId: string;          // Qual conexão foi sincronizada
  status: 'SUCCESS' | 'ERROR';
  transactionsSynced: number;    // Quantas foram adicionadas/atualizadas
  accountsSynced: number;
  errorMessage?: string;
  syncedAt: timestamp;
  duration: number;              // Tempo em ms
}
```

**Índice:** `(userId, syncedAt DESC)`

---

## 🔐 Regras de Segurança Firestore

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Users - só eles mesmos
    match /users/{userId} {
      allow read, write: if request.auth.uid == userId;
    }
    
    // Todas as subcollections de usuário
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth.uid == userId;
    }
  }
}
```

---

## ⚠️ PRÉ-REQUISITOS

O usuário já tem:
- [ ] Conta em https://meu.pluggy.ai (conectou contas reais ou sandbox)
- [ ] Account de dev em https://dashboard.pluggy.ai com PLUGGY_CLIENT_ID + PLUGGY_CLIENT_SECRET
- [ ] Google OAuth Credentials configuradas
- [ ] Firebase project criado

---

## 🛠️ SOLICITAÇÃO AOS AGENTES:

### [DESENVOLVEDOR] Implemente:

**Setup Inicial (Scripts):**

1. **`setup.ts` (raiz do projeto):**
   - Prompt interativo pedindo:
     * Firebase config (apiKey, authDomain, projectId, etc)
     * PLUGGY_CLIENT_ID
     * PLUGGY_CLIENT_SECRET
     * GOOGLE_CLIENT_SECRET
   - Gera `.env.local` com todas as variáveis
   - Valida conectividade (Pluggy, Firebase)
   - Exibe: "✅ Setup concluído com sucesso"

2. **`scripts/initializeFirebase.ts` (backend):**
   - Cria todas as collections/subcollections automaticamente
   - Cria índices compostos (conforme schema acima)
   - Aplica regras Firestore
   - Valida que o usuário está autenticado
   - Rodável via: `npm run init:firebase`

**Backend (Express + Firebase + Pluggy SDK):**

- Setup Express + TypeScript + nodemon
- Firebase Admin SDK + Pluggy SDK
- Services:
  * `services/firestore.ts` - wrapper com tipos do schema
  * `services/pluggy.ts` - cliente Pluggy (auth, fetch, sync)
  * `services/sync.ts` - orquestrar sincronização (evitar duplicatas com pluggyTransactionId)
- Middleware:
  * `middleware/auth.ts` - valida Firebase ID token
  * `middleware/validation.ts` - valida inputs
  * `middleware/errorHandler.ts`
  * `middleware/rateLimiter.ts` - 100 req/min por usuário
- Routes:
  * POST /auth/google - callback OAuth
  * GET /auth/me - retorna usuário logado
  * POST /pluggy/connect-token - gera connectToken para widget
  * GET /accounts - listar contas sincronizadas
  * POST /sync - sincroniza manualmente
  * GET /transactions (filtros: banco, cartão, categoria, data, tags)
  * POST/GET /fixed-expenses
  * POST/GET /recurring-income
  * POST/GET /split-reimbursements
  * POST /webhook - recebe eventos Pluggy (item/updated, item/error)

- **Pluggy Client (`services/pluggy.ts`):**
  ```typescript
  import { PluggyClient } from 'pluggy-sdk';
  
  const pluggy = new PluggyClient({
    clientId: process.env.PLUGGY_CLIENT_ID!,
    clientSecret: process.env.PLUGGY_CLIENT_SECRET!,
  });
  
  export async function fetchAccounts(itemId: string) {
    return await pluggy.fetchAccounts(itemId);
  }
  
  export async function fetchTransactions(
    accountId: string,
    from?: string,
    to?: string
  ) {
    return await pluggy.fetchTransactions(accountId, { from, to });
  }
  
  export async function syncItem(itemId: string) {
    return await pluggy.updateItem(itemId);
  }
  ```

- **Webhook Handler (`POST /webhook`):**
  * Recebe eventos: `item/created`, `item/updated`, `item/error`
  * `item/updated`: busca contas e transações, salva no Firestore
  * Detecta duplicatas comparando `pluggyTransactionId`
  * `item/error`: loga erro no syncLogs e notifica usuário
  * Webhook URL configurado no Pluggy dashboard

- **Exemplo Rota (GET /accounts):**
  ```typescript
  app.get('/accounts', requireAuth, async (req, res) => {
    const userId = req.user.uid;
    
    const snap = await db
      .collection('users')
      .doc(userId)
      .collection('accounts')
      .get();
    
    res.json(snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })));
  });
  ```

**Frontend (Next.js + Firebase SDK + Pluggy Connect):**

- `lib/firebase.ts` - inicializa Firebase
- `lib/pluggy-api.ts` - fetch wrapper com auth
- Hooks:
  * `useAuth()` - Google OAuth + Firebase
  * `useAccounts()` - listener Firestore para accounts
  * `useTransactions()` - listener com filtros
  * `usePluggyConnect()` - gerencia connectToken e widget
- Componentes:
  * `PluggyConnectButton` - abre widget
  * `AccountsList` - lista contas
  * `TransactionTable` - tabela com filtros
  * `DashboardCharts` - gráficos (Recharts)
- Páginas:
  * `/login` - Google login
  * `/dashboard` - dashboard principal
  * `/accounts` - gerenciar conexões (conectar/desconectar banco)
  * `/transactions` - lista completa com filtros
  * `/settings` - token, logs de sync
  * `/fixed-expenses`, `/recurring-income`, `/split-reimbursements` - CRUD

- **Integração Pluggy Connect:**
  ```typescript
  // page.tsx - Accounts
  'use client';
  import { useEffect, useState } from 'react';
  
  export default function AccountsPage() {
    const [connectToken, setConnectToken] = useState('');
  
    useEffect(() => {
      fetch('/api/pluggy/connect-token')
        .then(r => r.json())
        .then(data => setConnectToken(data.connectToken));
    }, []);
  
    useEffect(() => {
      if (!connectToken) return;
      
      const script = document.createElement('script');
      script.src = 'https://cdn.pluggy.ai/pluggy-connect/v2/pluggy-connect.js';
      document.body.appendChild(script);
      
      script.onload = () => {
        new window.PluggyConnect({
          connectToken,
          onSuccess: (data) => {
            console.log('Banco conectado:', data.item.id);
            // Recarregar accounts
          },
        }).init();
      };
    }, [connectToken]);
  
    return <div id="pluggy-connect"></div>;
  }
  ```

**Estrutura:**
```
project/
├── setup.ts
├── .env.example
├── package.json
├── backend/
│   ├── src/
│   │   ├── services/
│   │   │   ├── firestore.ts
│   │   │   ├── pluggy.ts
│   │   │   └── sync.ts
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── accounts.ts
│   │   │   ├── transactions.ts
│   │   │   ├── expenses.ts
│   │   │   ├── webhook.ts
│   │   │   └── sync.ts
│   │   ├── middleware/
│   │   │   ├── auth.ts
│   │   │   ├── validation.ts
│   │   │   ├── errorHandler.ts
│   │   │   └── rateLimiter.ts
│   │   ├── config/
│   │   │   └── firebase.ts
│   │   └── index.ts
│   ├── scripts/
│   │   └── initializeFirebase.ts
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── (auth)/login/
│   │   │   ├── (dashboard)/
│   │   │   │   ├── dashboard/
│   │   │   │   ├── accounts/
│   │   │   │   ├── transactions/
│   │   │   │   ├── expenses/
│   │   │   │   ├── income/
│   │   │   │   ├── split-reimbursements/
│   │   │   │   └── settings/
│   │   ├── components/
│   │   │   ├── DashboardCharts.tsx
│   │   │   ├── AccountsList.tsx
│   │   │   ├── TransactionTable.tsx
│   │   │   ├── PluggyConnectButton.tsx
│   │   ├── lib/
│   │   │   ├── firebase.ts
│   │   │   ├── pluggy-api.ts
│   │   │   └── utils.ts
│   │   ├── hooks/
│   │   │   ├── useAuth.ts
│   │   │   ├── useAccounts.ts
│   │   │   ├── useTransactions.ts
│   │   │   └── usePluggyConnect.ts
│   │   └── styles/
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
└── README.md
```

**Como rodar:**
```bash
npm install
npm run setup          # Setup interativo
npm run init:firebase # Cria collections Firestore
npm run dev           # Inicia backend + frontend
```

---

### [TESTER] Cubra:

- **Unitários:**
  * Validação de inputs
  * Parsing de dados Pluggy
  * Detecção de duplicatas com `pluggyTransactionId`
  * Cálculos de saldos
  * Sincronização correta de accounts

- **Integração:**
  * OAuth com Firebase
  * Sync Pluggy (mock SDK)
  * CRUD Firestore com schema correto
  * Webhook handler (item/updated, item/error)

- **E2E:**
  * Login Google
  * Dashboard loads
  * Pluggy Connect Widget (mock)
  * Filtrar transações
  * CRUD gastos fixos

- **Cobertura:** 70%+ linhas críticas

---

### [SEGURANÇA] Revise:

- **Firebase:**
  * Regras restringem a usuário próprio
  * ID tokens validados em todas as rotas
  * Service Account Key em .env (não commit)

- **Pluggy:**
  * CLIENT_ID + CLIENT_SECRET em .env backend apenas
  * apiKey não exposto ao cliente
  * connectToken no backend (30min expiration)
  * Webhook signature validada (se oferecido)

- **OAuth:**
  * State parameter validado
  * Tokens expiram corretamente
  * Redirect URI = https em prod

- **APIs:**
  * Validação ALL inputs
  * Rate limiting 100 req/min
  * Usuários só veem seus dados
  * Deduplicação de transações com `pluggyTransactionId`

- **Frontend:**
  * XSS: escape dados (Pluggy responses, Firestore docs)
  * CSRF: token em mutações
  * localStorage: só ID token

- **Logs:**
  * Sync Pluggy (sucesso/erro) em syncLogs
  * Login/logout com timestamp e IP
  * Erros de validação
  * Acessos a dados sensíveis

---

## ENTREGÁVEIS:

✅ Backend + Frontend funcional
✅ Schema Firestore conforme especificado
✅ Setup automático (.env.local + collections)
✅ Pluggy SDK integrado (fetch accounts, transactions, sync)
✅ Pluggy Connect Widget funcionando
✅ Webhook recebendo eventos Pluggy
✅ Deduplicação de transações (pluggyTransactionId)
✅ 70%+ testes
✅ Sem vulnerabilidades críticas/altas
✅ README com:
   - Setup (npm run setup)
   - Pluggy credentials
   - Webhook URL config
   - Firestore schema
   - Deploy guide

---

## NOTAS CRÍTICAS:

- **pluggyTransactionId:** ÚNICO campo para evitar duplicatas
- **pluggyItemId:** ÚNICO para conexões
- **pluggyAccountId:** ÚNICO para contas
- Firebase rules: restritivas (user isolation)
- Webhooks: rota pública mas validada
- Sync: automática por webhook + manual por botão
- TypeScript strict, sem any
- Código completo, sem TODOs
```

---

## ✅ Pronto para disparar!

Tudo detalhado e alinhado com Pluggy. Pode chamar:

```
/javascript-expert
```

E colar o prompt acima. Os agentes vão entregar tudo funcional! 🚀
