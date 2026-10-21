# 🧱 White-Label Store — Template de E-commerce (React + Vite + Tailwind + Supabase)

Plataforma completa de e-commerce white-label com vitrine, checkout, painel administrativo,
PDV, WhatsApp integrado, impressão de comprovantes e PWA instalável. Multi-nicho: construção,
vestuário, alimentação, serviços — qualquer estabelecimento que venda produtos.

---

## 🛠️ Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 19 + Vite 8 + Tailwind CSS v4 |
| Backend | Supabase (PostgreSQL + RLS + Realtime + Edge Functions/Deno) |
| Pagamentos | Mercado Pago (Pix online automático via Edge Function) |
| WhatsApp | Evolution API (self-hosted, anti-ban, chat completo no painel) |
| Deploy | Vercel (push no GitHub → deploy automático) |
| PWA | 2 apps instaláveis (Loja + Painel Admin) |

---

## 🚀 Passo 1 — Instalação local

```bash
npm install
npm run dev
```

### .env (obrigatório)

Copie .env.example para .env e preencha:

```
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sua-anon-key-publica
```

> Supabase Dashboard → Project Settings → API

---

## 🗄️ Passo 2 — Banco de dados

### Novo projeto (do zero)

Rode o arquivo **inteiro** de supabase/schema.sql no SQL Editor do Supabase.

### Projeto existente (upgrades)

Rode as migrations em ordem no SQL Editor, ou use a CLI:
```bash
supabase db push --yes
```

### Migrations essenciais

| Migration | O que adiciona |
|---|---|
| [migration-8](supabase/migration-8.sql) | ⚠️ **OBRIGATÓRIA**: place_order no servidor (preço/cupom/estoque), RLS |
| [migration-9](supabase/migration-9.sql) | Venda na loja (PDV), fulfillment, exclusão de pedidos |
| [migration-10](supabase/migration-10.sql) | CPF do cliente, observação, confirmação de entrega |
| [migration-13](supabase/migration-13.sql) | Pix online (payment_status, Mercado Pago) |
| [migration-19](supabase/migration-19.sql) | WhatsApp no painel (tabela whatsapp_chats) |
| [migration-20](supabase/migration-20.sql) | Tamanho da fonte do sistema (font_scale) |
| [migration-21](supabase/migration-21.sql) | CPF completo no fluxo (orders.customer_cpf + lookup_cpf_account) |
| [migration-22](supabase/migration-22.sql) | Mais vendidos (RPC top_selling_products) |
| [migration-23](supabase/migration-23.sql) | WhatsApp: flag known (contatos conhecidos) |
| [migration-24](supabase/migration-24.sql) | WhatsApp: encerrar atendimento (closed) |
| [migration-25](supabase/migration-25.sql) | WhatsApp: respostas rápidas editáveis |
| [migration-26](supabase/migration-26.sql) | CNPJ da loja (cupom/nota de venda) |
| [migration-27](supabase/migration-27.sql) | Histórico completo + refazer compra (claim_guest_orders) |
| [migration-28](supabase/migration-28.sql) | Layout da vitrine (loja x cardápio) |
| [migration-29](supabase/migration-29.sql) | Corrige upload de imagens (RLS Storage com with check) |
| [migration-30](supabase/migration-30.sql) | ⭐ Catálogo inteligente: estoque mínimo (alertas), calculadora de material (rendimento por unidade) e meta diária de vendas |
| [migration-31](supabase/migration-31.sql) | ⭐ Frete por zona de entrega (taxa/prazo no checkout) + cupons avançados (validade, 1ª compra, categoria) + place_order v5 |
| [migration-32](supabase/migration-32.sql) | ⭐ Listas de compra recorrente ("lista da obra" — salvar a sacola e repetir com 1 toque) |
| [migration-33](supabase/migration-33.sql) | ⭐ Avaliações de produto com foto (anti-fake: só pedido entregue; moderação no painel) |
| [migration-34](supabase/migration-34.sql) | ⭐ Banners promocionais da vitrine (carrossel de campanhas na Home) |
| [migration-35](supabase/migration-35.sql) | ⭐ Carrinho abandonado (snapshots) + notificações push do PWA (push_subscriptions) |

---

## 👤 Passo 3 — Criar o usuário admin

1. Supabase Dashboard → Authentication → Users → **Add user**
2. SQL Editor: update profiles set role = 'admin' where email = 'seu@email.com';

---

## ⚡ Passo 4 — Edge Functions

```bash
supabase functions deploy create-mp-order webhook-mercadopago whatsapp-chat whatsapp-webhook whatsapp-notify push-order-status
```

### Secrets

```bash
# Pix online (Mercado Pago)
supabase secrets set MP_ACCESS_TOKEN=APP_USR-...
supabase secrets set MP_WEBHOOK_SECRET=sua-senha

# WhatsApp (Evolution API)
supabase secrets set EVOLUTION_API_URL=https://sua-evolution.com
supabase secrets set EVOLUTION_API_KEY=sua-chave
supabase secrets set EVOLUTION_INSTANCE=loja

# Notificações automáticas
supabase secrets set NOTIFY_SECRET=sua-senha-interna
```

### 🔔 Push "seu pedido saiu para entrega" (opcional, migration-35)

1. Gere as chaves: `npx web-push generate-vapid-keys --json`
2. Pública no `.env` da loja: `VITE_VAPID_PUBLIC_KEY=<publicKey>`
3. Ambas como secrets (a function usa a PRIVADA):
   ```bash
   supabase secrets set VAPID_PUBLIC_KEY=<publicKey> VAPID_PRIVATE_KEY=<privateKey> VAPID_SUBJECT=mailto:contato@sualoja.com
   ```
4. Deploy da function `push-order-status`. O cliente ativa em **Meus pedidos → Ativar notificações**.

### 🔐 Autenticação

Login por **Google** e **e-mail** (senha ou magic link) — configurados direto no Supabase
(Dashboard → Authentication → Providers).

### Webhooks (cadastro manual)

| Onde | URL | Evento |
|---|---|---|
| Dashboard do MP | .../functions/v1/webhook-mercadopago | orders |
| Painel da Evolution | .../functions/v1/whatsapp-webhook?secret=SEU-NOTIFY-SECRET | Messages Upsert |
| Supabase → Database → Webhooks | Function: whatsapp-notify | INSERT/UPDATE em orders |

---

## 💬 WhatsApp no painel

### Provisório (na sua máquina, grátis)

Duplo clique em tools\ligar-whatsapp.bat — sobe a Evolution, abre o túnel e atualiza o Supabase.
O PC precisa ficar ligado. Veja tools/LEIA-ME.txt para detalhes.

### Definitivo (VPS, 24/7)

```bash
docker run -d --name evolution -p 8080:8080 \
  -e AUTHENTICATION_TYPE=apikey \
  -e API_GLOBAL_KEY=sua-chave \
  atendai/evolution-api:latest
```

### Recursos do chat

- Lista de conversas com busca, não lidas, nomes (cadastro ou WhatsApp do contato)
- Enviar texto, imagem (base64, zero Storage), arquivo PDF, notas de voz
- Respostas rápidas: 10 redações anti-ban por tema, sorteadas a cada clique
- Menu **+**: produto da loja, cupom, ofertas ativas (com link direto)
- Central de mídias (imagens, arquivos, links) por conversa
- Gravar nota de voz pelo microfone
- Separação por data (HOJE/ONTEM/dia) estilo WhatsApp
- Aviso automático ao avançar status (com comprovante na confirmação)
- Encerrar atendimento (volta se o cliente escrever)
- Notificações: toast + badge no menu + contador no título da aba
- Pedidos do cliente no chat: ver detalhes, avançar status, imprimir
- Dedupe de contatos (LID vs número real)
- Foto de perfil quando disponível

---

## 🖨️ Impressão

Botão **Cupom** no pedido (painel ou chat WhatsApp):
- **Cupom 80mm**: térmico, monospace, itens + total + pagamento + CPF
- **Nota A4**: quadros loja/cliente, tabela de itens, assinatura

CNPJ da loja em Painel → Configurações.

---

## 📱 PWA

O site instala como app nativo:

| Onde | Como | Abre |
|---|---|---|
| Chrome/Edge na vitrine | Ícone de instalar | Loja (ícone M cinza) |
| Chrome/Edge em /admin | Mesmo botão | Painel Admin (ícone M escuro) |
| Android | Menu ⋮ → Adicionar à tela inicial | Loja |
| iPhone | Safari → Compartilhar → Adicionar | Loja |

---

## 🛒 Vitrine — Recursos

- Abre nos **Mais vendidos** (ranking do banco; completa com destaques)
- Menu **Explorar**: Mais vendidos, Todos, Categorias, Ofertas (funciona sem a categoria Ofertas)
- Busca com debounce, produtos com galeria, promoção com preço riscado
- Checkout em 3 passos: Sacola → Entrega → Revisão
- Cupom de desconto, Pix online com QR na hora, retirada no balcão
- CPF obrigatório (validação em todos os modos)
- Visitante compra sem login; ao criar conta, pedidos são adotados (histórico completo)
- **Refazer compra** no histórico (itens com preço/estoque atuais)
- **Perfil incompleto**: pulso no ícone da conta até preencher
- Dropdown da conta fecha ao clicar fora/ESC
- **Anti-ban**: 10 variações de mensagem em todas as automações

---

## 🖥️ Painel Admin

| Seção | Recursos |
|---|---|
| Dashboard | Métricas, gráficos (Recharts), produtos mais vistos |
| Pedidos | Tabs por status, busca, CSV, limpeza, cupom/nota, aviso WhatsApp |
| Nova venda (PDV) | Venda presencial, retirada/entrega por item |
| Produtos | CRUD com galeria, estoque, promoção, popup de confirmação |
| Categorias | Tabela, scroll infinito, busca, popup |
| Cupons | % ou R$ fixo, valor mínimo, popup |
| Promoções | Prazo que expira sozinho, popup |
| Clientes | Estatísticas, CSV, conversar no WhatsApp |
| WhatsApp | Chat completo (ver seção acima) |
| Configurações | Nome, logo, banner, cores, CNPJ, fonte (80-130%), respostas rápidas |

### Confirmações em popup
Todas as ações sensíveis (criar/desativar/excluir produto, cupom, categoria,
cancelar/excluir pedido, finalizar venda, salvar configurações, encerrar atendimento) passam
por um popup de confirmação — nada de window.confirm nativo.

---

## 🔒 Segurança

| Camada | Proteção |
|---|---|
| RLS | Row Level Security em todas as tabelas |
| place_order | Preço/cupom/estoque calculados **no servidor** (migration-8+) |
| profiles.role | Coluna protegida — usuário não pode se promover a admin |
| whatsapp-chat | JWT obrigatório + role admin verificada |
| whatsapp-webhook | Segredo na URL |
| webhook-mercadopago | HMAC-SHA256 |
| Anti-ban | 10 redações sorteadas + delay humano |

---

## 🚢 Deploy (Vercel + GitHub)

```bash
git remote add origin https://github.com/SEU-USUARIO/SEU-REPO.git
git push -u origin main
```

Na [Vercel](https://vercel.com):
1. Import Project → selecione o repo
2. Framework: Vite | Build: npm run build | Output: dist
3. Environment Variables: VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY

Cada push no main faz deploy automático.

---

## ✅ Checklist de produção

- [ ] Rode schema.sql (ou migrations em ordem)
- [ ] Crie o admin (Authentication + SQL: role = admin)
- [ ] Deploy das 5 Edge Functions
- [ ] Configure os secrets (MP, Evolution, NotifySecret)
- [ ] Cadastre os webhooks (MP, Evolution, Database)
- [ ] Migration-8 rodada (checkout seguro — obrigatória)
- [ ] Configure a loja (nome, logo, cores, CNPJ, horários)
- [ ] Cadastre produtos e categorias
- [ ] Teste: pedido visitante + Pix + aviso no WhatsApp
- [ ] Instale os PWAs (Loja + Painel)

---

## 📂 Estrutura

```
src/
  pages/           # Vitrine (Home, ProductPage, Cart, Orders, Profile, Login, PrintOrder)
    admin/         # Painel (Dashboard, Orders, Products, Categories, Clients, WhatsApp, ...)
  components/      # CheckoutForm, ConfirmDialog, ProductCard, MpPixDisplay, OrderAlerts, ...
  layouts/         # StoreLayout (vitrine) + AdminLayout (painel)
  context/         # AuthContext, CartContext, StoreContext, FavoritesContext
  lib/             # checkout, utils, validation, supabase, whatsappChat, waTemplates, ...
supabase/
  schema.sql       # Schema completo (novo projeto)
  migration-*.sql  # Migrations incrementais (projeto existente)
  functions/        # Edge Functions (Deno)
tools/             # Servidor WhatsApp provisório local
  evolution-api/   # Código da Evolution API (não versionado)
  cloudflared.exe  # Túnel público
  ligar-whatsapp.bat  # Liga tudo com 1 clique
```