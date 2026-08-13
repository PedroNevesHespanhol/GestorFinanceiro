# 📊 Dashboard Financeiro Pessoal — OpenFinance via Pluggy

> Documentação técnica para implementação de um dashboard de controle financeiro pessoal utilizando a API da Pluggy como camada de abstração sobre o OpenFinance Brasil.

---

## ⚠️ Contexto Importante: OpenFinance Direto vs. Pluggy

### Por que NÃO usar o OpenFinance diretamente para uso pessoal

O OpenFinance Brasil é uma infraestrutura regulada pelo Banco Central. Para consumi-lo **diretamente**, você precisaria:

- Ser uma **instituição financeira regulada** ou ter autorização do Bacen
- Registrar-se no **Diretório Central de Participantes** (exige CNPJ regulado)
- Ter **certificados digitais ICP-Brasil** (mTLS / private_key_jwt)
- Implementar o padrão **FAPI (Financial-grade API)** completo com conformidade técnica
- Ter ambiente homologado com **logs de auditoria** e gestão de tokens

➡️ **Conclusão:** Acesso direto ao OpenFinance é inviável para projetos pessoais.

### A solução: Pluggy + MeuPluggy

A **[Pluggy](https://pluggy.ai)** é uma fintech brasileira regulada pelo Bacen que atua como agregador do OpenFinance. Ela expõe uma **API simples e REST** para você consumir dados de contas, cartões e transações de múltiplos bancos, sem precisar lidar com toda a complexidade regulatória.

O **[MeuPluggy](https://github.com/pluggyai/meu-pluggy)** é o aplicativo pessoal deles — você conecta suas contas lá, e depois consome os dados pela API deles no seu projeto. **É gratuito para uso pessoal/desenvolvimento.**

---

## 🏗️ Arquitetura Geral

```
Seus Bancos (Nubank, BB, Itaú, etc.)
        ↓ OpenFinance (protocolo)
    [ Pluggy ]  ← você conecta via MeuPluggy
        ↓ API REST simples
    [ Seu Backend ]  ← consome os dados
        ↓
    [ Seu Dashboard ]  ← visualização
```

---

## 🔐 Autenticação

A Pluggy usa um modelo de dois tokens:

### 1. API Key (backend)
- Criada trocando `CLIENT_ID` + `CLIENT_SECRET` pelo token
- Expira em **2 horas**
- Usada no backend para **acessar todos os dados**

```http
POST https://api.pluggy.ai/auth
Content-Type: application/json

{
  "clientId": "SEU_CLIENT_ID",
  "clientSecret": "SEU_CLIENT_SECRET"
}
```

**Resposta:**
```json
{
  "apiKey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

Use o `apiKey` no header de todas as requisições:
```http
X-API-KEY: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 2. Connect Token (frontend)
- Criado pelo backend com a API Key
- Expira em **30 minutos**
- Usado exclusivamente no **Pluggy Connect Widget** (frontend)

```http
POST https://api.pluggy.ai/connect_token
X-API-KEY: {apiKey}
Content-Type: application/json

{
  "clientUserId": "pedro-dashboard",
  "webhookUrl": "https://seu-backend.com/webhook"
}
```

---

## 📦 Endpoints Principais

**Base URL:** `https://api.pluggy.ai`

### Connectors (instituições disponíveis)

```http
GET /connectors
X-API-KEY: {apiKey}
```

Retorna a lista de todos os bancos/fintechs disponíveis (Nubank, BB, Itaú, Bradesco, etc.)

---

### Items (conexões ativas)

Um **Item** representa uma conta conectada de um banco.

```http
# Listar todos os items do usuário
GET /items
X-API-KEY: {apiKey}

# Buscar item específico
GET /items/{itemId}
X-API-KEY: {apiKey}

# Atualizar/sincronizar dados de um item
POST /items/{itemId}/send
X-API-KEY: {apiKey}

# Deletar conexão (revoga consentimento)
DELETE /items/{itemId}
X-API-KEY: {apiKey}
```

**Resposta de um Item:**
```json
{
  "id": "a9f32b1d-...",
  "connector": { "id": 201, "name": "Nubank", "primaryColor": "#8A05BE" },
  "status": "UPDATED",
  "statusDetail": null,
  "lastUpdatedAt": "2026-06-14T10:00:00.000Z",
  "webhookUrl": "https://seu-backend.com/webhook"
}
```

---

### Accounts (contas bancárias e cartões)

```http
GET /accounts?itemId={itemId}
X-API-KEY: {apiKey}
```

**Resposta:**
```json
{
  "total": 2,
  "results": [
    {
      "id": "4f61bd6d-...",
      "itemId": "a9f32b1d-...",
      "type": "BANK",
      "subtype": "CHECKING_ACCOUNT",
      "name": "Conta Corrente",
      "balance": 1250.00,
      "currencyCode": "BRL",
      "number": "****1234"
    },
    {
      "id": "7a23cd9e-...",
      "itemId": "a9f32b1d-...",
      "type": "CREDIT",
      "subtype": "CREDIT_CARD",
      "name": "Nubank Mastercard",
      "balance": 342.50,
      "currencyCode": "BRL",
      "creditData": {
        "creditLimit": 5000.00,
        "availableCreditLimit": 4657.50,
        "balanceCloseDate": "2026-06-20",
        "balanceDueDate": "2026-06-28"
      }
    }
  ]
}
```

---

### Transactions (transações)

```http
GET /transactions?accountId={accountId}
X-API-KEY: {apiKey}

# Com filtros de data (recomendado)
GET /transactions?accountId={accountId}&from=2026-05-01&to=2026-06-14
X-API-KEY: {apiKey}

# Paginação
GET /transactions?accountId={accountId}&pageSize=50&page=1
X-API-KEY: {apiKey}
```

**Resposta:**
```json
{
  "total": 120,
  "totalPages": 3,
  "results": [
    {
      "id": "tx-001",
      "accountId": "7a23cd9e-...",
      "description": "MERCADO LIVRE",
      "amount": -89.90,
      "date": "2026-06-10T14:23:00.000Z",
      "type": "DEBIT",
      "category": "Shopping",
      "paymentData": {
        "payer": { "name": "PEDRO HENRIQUE" },
        "receiver": { "name": "MERCADO LIVRE" },
        "paymentMethod": "CREDIT_CARD"
      }
    }
  ]
}
```

> **Nota:** `amount` negativo = saída de dinheiro | positivo = entrada.

---

### Identity (dados do titular)

```http
GET /identity?itemId={itemId}
X-API-KEY: {apiKey}
```

Retorna nome, CPF (mascarado), e-mail e telefone cadastrados no banco.

---

### Investments (investimentos)

```http
GET /investments?itemId={itemId}
X-API-KEY: {apiKey}
```

Retorna saldo e posição em renda fixa, tesouro direto, fundos, etc.

---

### Bills (faturas do cartão)

```http
GET /bills?accountId={accountId}
X-API-KEY: {apiKey}
```

Retorna as faturas (abertas e fechadas) do cartão de crédito.

---

## 🔄 Webhooks

Configure webhooks para receber notificações quando dados são atualizados:

```http
POST /webhooks
X-API-KEY: {apiKey}
Content-Type: application/json

{
  "url": "https://seu-backend.com/webhook",
  "event": "item/updated"
}
```

**Eventos disponíveis:**
| Evento | Descrição |
|---|---|
| `item/created` | Nova conexão criada |
| `item/updated` | Dados sincronizados com sucesso |
| `item/error` | Erro na sincronização |
| `item/waiting_user_action` | Banco exige MFA do usuário |

**Payload recebido no seu endpoint:**
```json
{
  "id": "webhook-event-id",
  "event": "item/updated",
  "data": {
    "itemId": "a9f32b1d-..."
  }
}
```

---

## 🛠️ SDKs Disponíveis

A Pluggy oferece SDKs oficiais:

```bash
# JavaScript / TypeScript (recomendado)
npm install pluggy-sdk

# Python
pip install pluggy-sdk
```

### Exemplo com JavaScript SDK:

```typescript
import { PluggyClient } from 'pluggy-sdk';

const client = new PluggyClient({
  clientId: process.env.PLUGGY_CLIENT_ID!,
  clientSecret: process.env.PLUGGY_CLIENT_SECRET!,
});

// Buscar todas as contas de um item
const accounts = await client.fetchAccounts(itemId);

// Buscar transações
const transactions = await client.fetchTransactions(accountId, {
  from: '2026-05-01',
  to: '2026-06-14',
});

// Buscar investimentos
const investments = await client.fetchInvestments(itemId);
```

---

## 🔌 Pluggy Connect Widget (Frontend)

Para que o usuário conecte seus bancos no seu app, use o widget oficial:

```html
<!-- Via CDN -->
<script src="https://cdn.pluggy.ai/pluggy-connect/v2/pluggy-connect.js"></script>
```

```javascript
// Instanciar o widget
const pluggyConnect = new PluggyConnect({
  connectToken: connectToken, // gerado pelo seu backend
  onSuccess: (itemData) => {
    console.log('Conta conectada!', itemData.item.id);
    // Salvar itemId no seu banco de dados
  },
  onError: (error) => {
    console.error('Erro ao conectar:', error);
  },
  onClose: () => {
    console.log('Widget fechado');
  }
});

pluggyConnect.init();
```

**Flutter / Mobile:**
```yaml
# pubspec.yaml
dependencies:
  webview_flutter: ^4.0.0
  # Carregar o widget via WebView
```

---

## 🗄️ Modelo de Banco de Dados Sugerido

```sql
-- Conexões bancárias
CREATE TABLE bank_connections (
  id            UUID PRIMARY KEY,
  pluggy_item_id VARCHAR(255) UNIQUE NOT NULL,
  bank_name     VARCHAR(100),
  status        VARCHAR(50),
  last_sync_at  TIMESTAMP,
  created_at    TIMESTAMP DEFAULT NOW()
);

-- Contas
CREATE TABLE accounts (
  id              UUID PRIMARY KEY,
  pluggy_account_id VARCHAR(255) UNIQUE NOT NULL,
  connection_id   UUID REFERENCES bank_connections(id),
  type            VARCHAR(50), -- BANK | CREDIT
  subtype         VARCHAR(50), -- CHECKING_ACCOUNT | CREDIT_CARD
  name            VARCHAR(255),
  balance         DECIMAL(12,2),
  currency_code   CHAR(3) DEFAULT 'BRL',
  updated_at      TIMESTAMP DEFAULT NOW()
);

-- Transações
CREATE TABLE transactions (
  id                UUID PRIMARY KEY,
  pluggy_tx_id      VARCHAR(255) UNIQUE NOT NULL,
  account_id        UUID REFERENCES accounts(id),
  description       VARCHAR(500),
  amount            DECIMAL(12,2),
  date              TIMESTAMP,
  type              VARCHAR(20),  -- DEBIT | CREDIT
  category          VARCHAR(100),
  payment_method    VARCHAR(50),
  created_at        TIMESTAMP DEFAULT NOW()
);
```

---

## 🚀 Setup Inicial — Passo a Passo

### 1. Criar conta no MeuPluggy
Acesse [https://meu.pluggy.ai](https://meu.pluggy.ai) e conecte suas contas bancárias (Nubank, BB, etc.)

### 2. Criar conta de desenvolvedor
Acesse [https://dashboard.pluggy.ai](https://dashboard.pluggy.ai) e:
- Crie uma Application
- Copie o `CLIENT_ID` e `CLIENT_SECRET`
- Habilite o conector `MeuPluggy` na sua Application

### 3. Configurar variáveis de ambiente
```env
PLUGGY_CLIENT_ID=seu_client_id
PLUGGY_CLIENT_SECRET=seu_client_secret
```

### 4. Obter o `itemId` do MeuPluggy

No dashboard, após habilitar o conector MeuPluggy, crie um item de desenvolvimento:

```http
GET /connectors?name=MeuPluggy
```

Isso retorna o `connectorId` do MeuPluggy. Com ele, você cria um Item vinculado à sua conta.

### 5. Testar com o Sandbox

Use o conector `SANDBOX_NUBANK` (connectorId: 0) para testar sem dados reais:

```typescript
const testItem = await client.createItem(0, {
  user: 'user-ok',
  password: 'password-ok',
});
```

---

## 📋 Fluxo Completo de Implementação

```
1. [BACKEND] GET /auth → obter apiKey
2. [BACKEND] POST /connect_token → gerar connectToken
3. [FRONTEND] Abrir Pluggy Connect Widget com connectToken
4. [USUÁRIO] Conectar banco no widget
5. [WEBHOOK] Receber evento item/updated
6. [BACKEND] GET /accounts?itemId={id} → salvar contas no DB
7. [BACKEND] GET /transactions?accountId={id} → salvar transações
8. [FRONTEND] Renderizar dashboard com dados do DB
9. [CRON] Executar GET /items/{id}/send periodicamente para sincronizar
```

---

## 💡 Stack Recomendada para o Projeto

| Camada | Tecnologia |
|---|---|
| **Backend** | Node.js + TypeScript (Next.js API Routes ou Express) |
| **SDK** | `pluggy-sdk` (npm) |
| **Banco de Dados** | PostgreSQL (Supabase ou Neon) |
| **Frontend** | Next.js + Tailwind CSS |
| **Gráficos** | Recharts ou Chart.js |
| **Webhooks** | Vercel ou ngrok (dev) |
| **Agendamento** | Vercel Cron Jobs |
| **Deploy** | Vercel (gratuito) |

---

## 🔗 Links Úteis

| Recurso | URL |
|---|---|
| Documentação oficial Pluggy | https://docs.pluggy.ai |
| Dashboard de desenvolvedor | https://dashboard.pluggy.ai |
| MeuPluggy (app pessoal) | https://meu.pluggy.ai |
| GitHub MeuPluggy | https://github.com/pluggyai/meu-pluggy |
| Referência completa da API | https://docs.pluggy.ai/reference |
| Quickstarts / exemplos | https://github.com/pluggyai/quickstarts |
| SDK JavaScript | https://www.npmjs.com/package/pluggy-sdk |
| Discord da comunidade | https://discord.gg/EanrwJADby |

---

## ⚡ Limitações do Plano Gratuito (Sandbox/Dev)

- Trial de **15 dias** no plano pago, mas dados do MeuPluggy continuam acessíveis mesmo após expirar
- Dados atualizam sob demanda (não há push automático nos planos gratuitos)
- Limites de requisições por hora
- Para uso pessoal do próprio dashboard, o plano gratuito é suficiente

---

*Documentação gerada em: Junho/2026*  
*Versão da API Pluggy referenciada: v2*
