# 🧱 White-Label Store — Template de E-commerce (React + Vite + Tailwind + Supabase)

Template **white-label** de e-commerce, inicialmente configurado como um **Depósito de Construção**
("Depósito ConstruFácil"), mas adaptável a qualquer nicho: todas as identidades (nome, logo, banner,
cores, endereço, horários e WhatsApp) vêm do banco de dados e são editáveis pelo painel admin.

**Infraestrutura 100% gratuita:** Supabase (banco + auth + storage + realtime) e Vercel (hosting).

---

## 🛠️ Stack

| Camada        | Tecnologia                                   |
|---------------|----------------------------------------------|
| Frontend      | React 19 + Vite                              |
| Estilo        | Tailwind CSS v4 (via @tailwindcss/vite)      |
| Ícones        | Lucide React                                 |
| Gráficos      | Recharts                                     |
| Backend/Banco | Supabase (PostgreSQL, Auth, Storage, Realtime) |
| Hospedagem    | Vercel                                       |
| Repositório   | GitHub                                       |

---

## 🚀 Passo 1 — Criação do projeto e pacotes npm

Comandos equivalentes para criar este projeto do zero:

```bash
npm create vite@latest white-label-store -- --template react
cd white-label-store

# Dependências de runtime
npm install @supabase/supabase-js react-router-dom lucide-react recharts

# Tailwind CSS v4 (usa plugin do Vite — sem tailwind.config.js)
npm install -D tailwindcss @tailwindcss/vite
```

No `vite.config.js`, adicione o plugin:

```js
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({ plugins: [react(), tailwindcss()] })
```

No `src/index.css`, importe o Tailwind e registre as cores dinâmicas:

```css
@import "tailwindcss";

@theme inline {
  --color-primary: var(--brand-primary, #f97316);
  --color-secondary: var(--brand-secondary, #1e293b);
}
```

> Pronto: `bg-primary`, `text-primary`, `bg-secondary` etc. passam a refletir
> as cores gravadas no banco em tempo de execução.

---

## 🗄️ Passo 2 — Supabase: schema + RLS + seed (Mock Data)

1. Crie uma conta e um projeto em <https://supabase.com> (plano Free).
2. Abra **SQL Editor → New query**, cole **todo** o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**.

   > **Já tem um banco em produção?** Rode as migrations abaixo, **em ordem**, no SQL Editor.
   > São idempotentes (pode rodar de novo sem medo).

| Migration | O que muda |
|-----------|------------|
| [migration-2.sql](supabase/migration-2.sql) | Categoria/estoque opcionais, galeria de fotos, novas etapas de entrega |
| [migration-3.sql](supabase/migration-3.sql) | Checkout de visitante (pedido sem login) |
| [migration-4.sql](supabase/migration-4.sql) | Corrige o insert de `order_items` para visitante (`SECURITY DEFINER`) |
| [migration-5.sql](supabase/migration-5.sql) | Forma de entrega (entrega/retirada) e de pagamento |
| [migration-6.sql](supabase/migration-6.sql) | Horários de funcionamento estruturados |
| [migration-7.sql](supabase/migration-7.sql) | Cupons de desconto + desconto % por produto |
| [migration-8.sql](supabase/migration-8.sql) | **Segurança**: impede usuário de se promover a admin, checkout com preço/cupom/estoque calculados **no servidor** (`place_order`), produto inativo deixa de ser público, cupons no schema |
| [migration-9.sql](supabase/migration-9.sql) | **Venda na loja (PDV)**: `order_items.fulfillment` (retirada x entrega), `orders.origin` (site/loja), entrega `misto`, `place_order` v2 e permissão para o admin **excluir pedidos** |
| [migration-10.sql](supabase/migration-10.sql) | CPF do cliente, observação do pedido e política que permite ao **cliente confirmar a entrega** do próprio pedido |
| [migration-11.sql](supabase/migration-11.sql) | **Promoções** (`promo_price`/`promo_until`) + **um produto em várias categorias** (`product_categories`) + categoria `ofertas` |
| [migration-12.sql](supabase/migration-12.sql) | `place_order` passa a respeitar o **preço promocional** (o valor gravado é o mesmo que o site mostra) |
| [migration-13.sql](supabase/migration-13.sql) | **Pix online no pedido**: `payment_status`, `payment_method = 'mercado_pago'` (enum histórico = "Pix online gerado") e colunas de referência da cobrança |
| [migration-14.sql](supabase/migration-14.sql) | **Opcional** — agregações do painel no banco (`store_dashboard_stats` / `store_client_stats`). Sem ela o Dashboard soma no navegador, sujeito ao teto de **1000 linhas por consulta** do PostgREST |
| [migration-15.sql](supabase/migration-15.sql) | Pix por **gateway genérico** (AbacatePay): `orders.payment_provider`, `payment_ref`, `payment_qr_code`, `payment_qr_base64` + índice para o webhook achar o pedido |

   > ⚠️ **A migration-8 é obrigatória para o checkout seguro.** Sem ela o app continua
   > funcionando, mas cai no caminho antigo (preço calculado no navegador) e registra
   > um aviso no console do navegador.

O script cria:

| Tabela             | Função                                                                 |
|--------------------|------------------------------------------------------------------------|
| `store_settings`  | Identidade da loja (nome, logo, banner, cores, WhatsApp, endereço...)  |
| `categories`     | Categorias com slug                                                    |
| `products`       | Produtos (preço, estoque, imagem, status ativo/inativo, contador views)|
| `profiles`       | Estende `auth.users` (role `admin`/`client`, endereço, telefone)   |
| `orders`         | Pedidos (status, total, cupom, desconto, entrega, endereço)            |
| `order_items`    | Itens de cada pedido                                                    |
| `coupons`       | Cupons (% ou valor fixo, compra mínima, ativo/inativo)                 |

Cada item do pedido tem **destino próprio** (`retirada` x `entrega`): dá para vender
3 itens no balcão e deixar 1 para entregar depois, tudo no mesmo pedido (`delivery_method = 'misto'`).

E ainda:

- **Trigger `handle_new_user`**: cria automaticamente o `profile` com `role='client'`
  quando um usuário se cadastra no Auth;
- **RLS completa**: qualquer visitante lê produtos **ativos**/categorias/configurações; só
  admin escreve; cada usuário vê apenas seus pedidos (função `is_admin()` centraliza a checagem);
- **Privilégio por coluna em `profiles`**: `authenticated` só pode atualizar os próprios dados
  cadastrais — a coluna `role` fica fora do alcance da API (sem isso qualquer cliente logado
  poderia se promover a admin com um `PATCH` na API). Promover admin é feito pelo SQL Editor,
  que roda como owner da tabela;
- **Bucket público `store`** no Storage (logo, banner e imagens de produtos) com
  políticas de leitura pública e upload só para admin;
- **Realtime** nas tabelas `store_settings`, `categories`, `products` e `orders`;
- **Função `increment_product_views()`**: incrementa o contador de acessos do produto
  (usada no dashboard "produtos mais acessados") sem violar a RLS. É uma métrica
  **indicativa**: como o incremento é aberto ao público, alguém mal-intencionado pode
  inflá-la (para números confiáveis, use uma ferramenta de analytics);
- **Função `place_order()` (`SECURITY DEFINER`)**: ponto único de criação de pedido (site **e** loja). Relê o
  preço de `products`, aplica o desconto do produto, valida o cupom (ativo + compra mínima),
  calcula subtotal/total, grava `orders` + `order_items` e baixa o estoque **na mesma
  transação** — o navegador só informa quais itens e quantas unidades;
- **Seed com mocks**: 1 loja de construção, 4 categorias (Cimento e Argamassa, Ferramentas,
  Elétrica, Hidráulica) e 10 produtos com imagens do Unsplash.

---

## 👤 Criar os usuários de teste (Admin e Cliente)

Não é possível inserir em `auth.users) por SQL público. Faça no painel:

1. **Supabase Dashboard → Authentication → Users → Add user → Create new user**:
   - `admin@teste.com` — senha `admin123` — marque **Auto Confirm User**
   - `cliente@teste.com` — senha `client123` — marque **Auto Confirm User**
2. O trigger já criou os `profiles`. Para **promover o admin**, rode no SQL Editor:

```sql
update public.profiles set role = 'admin', full_name = 'Admin da Loja'
where id = (select id from auth.users where email = 'admin@teste.com');

update public.profiles set full_name = 'Cliente Teste'
where id = (select id from auth.users where email = 'cliente@teste.com');
```

3. Para testar o **Magic Link**: Authentication → Sign In / Providers → certifique-se de que
   **Email** está habilitado; em **URL Configuration**, ajuste **Site URL**
   (ex.: `http://localhost:5173`) e adicione `http://localhost:5173/**` em Redirect URLs.

---

## ⚙️ Configuração do frontend (.env)

Copie `.env.example` para `.env` e preencha com os dados de
**Project Settings → API**:

```bash
cp .env.example .env
```

```
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sua-anon-key-publica
```

## ▶️ Rodando

```bash
npm run dev        # http://localhost:5173
npm run build      # build de produção
npm test           # vitest (jsdom + React Testing Library)
npm run typecheck  # tsc --noEmit
npm run lint       # oxlint
```

---

## 🧭 Como usar

| Rota               | Quem            | O quê                                                        |
|--------------------|-----------------|--------------------------------------------------------------|
| `/`               | público         | Vitrine: banner, busca com debounce, filtro por categoria, paginação |
| `/produto/:id`    | público         | Detalhes, galeria de fotos, ofertas em carrossel + carrinho e finalização direta (comprar agora) |
| `/login`          | público         | Magic Link (gratuito) e e-mail+senha                          |
| `/carrinho`       | logado          | Carrinho persistente + checkout → grava pedido → WhatsApp     |
| `/perfil`         | logado          | Dados pessoais e endereço completo                            |
| `/pedidos`        | logado          | Histórico de pedidos com status e data                       |
| `/admin`          | **role admin**  | Dashboard (Recharts): vendas, acessos, clientes               |
| `/admin/produtos` | admin           | CRUD de produtos com upload de imagem                         |
| `/admin/categorias`| admin          | CRUD de categorias (exclusão bloqueada se houver produtos)    |
| `/admin/pedidos`  | admin           | Lista de pedidos com etapas de entrega, itens separados entre **retirada** e **entrega**, marcação item a item, exclusão de pedidos e limpeza em lote |
| `/admin/nova-venda` | admin        | **PDV**: registra a venda do cliente que está no balcão |
| `/admin/clientes` | admin           | Lista de clientes: contato, cidade, nº de pedidos e total gasto |
| `/admin/cupons`   | admin           | Cupons de desconto (% ou R$ fixo, compra mínima, ativar/desativar) |
| `/admin/promocoes`| admin           | Promoções com prazo: coloca produtos na categoria **Ofertas** e define preço/data de fim |
| `/favoritos`      | público         | Favoritos ❤️ salvos no navegador (LocalStorage) |
| `/admin/configuracoes` | admin     | Nome, logo, banner, cores hex, endereço, horários, WhatsApp   |

### Checkout via WhatsApp
Ao finalizar, o navegador chama a RPC `place_order` (o servidor calcula preço, cupom, total e
baixa de estoque), limpa o carrinho (LocalStorage) e abre
`https://wa.me/<whatsapp-da-loja>?text=<resumo>` com itens, endereço e total formatados.
Visitante também finaliza (pedido `is_guest`) e recebe a confirmação na própria tela —
só quem está logado tem a página `/pedidos`. Sem WhatsApp configurado, o pedido é gravado
e o app avisa (não abre um `wa.me` vazio).

### Pix automático (AbacatePay) — opcional, recomendado
Com a **migration-13**, a **migration-15** aplicadas e as Edge Functions publicadas, o cliente
escolhe **Pix** no checkout e recebe na hora o **QR Code + Copia e Cola**, sem sair do site.
O pedido é criado antes (pela RPC `place_order`), então o valor cobrado é sempre o do servidor.

O gateway ativo fica definido em [`src/lib/payments.js`](src/lib/payments.js) (`PIX_FUNCTION`) —
a tela de Pix e o checkout não mudam: eles só leem `qr_code` / `qr_code_base64` e o status.

```bash
# 1) secrets (Dashboard → Integração → API) e o secret que VOCÊ definiu no webhook
supabase secrets set ABACATE_API_KEY=abc_...
supabase secrets set ABACATE_WEBHOOK_SECRET=...

# 2) publicar as funções (o supabase/config.toml já define verify_jwt)
supabase functions deploy create-abacate-order
supabase functions deploy webhook-abacatepay
```

- **migration-15 obrigatória**: cria `orders.payment_provider/payment_ref/payment_qr_code/payment_qr_base64`
  (o QR é guardado no pedido porque a AbacatePay não tem endpoint para re-ler o `brCode`);
- `create-abacate-order` (`verify_jwt = true`): confere que o pedido é de quem está chamando
  (dono, admin ou visitante com o orderId), cria o Pix pela **API v2** (`POST /transparents/create`,
  valor em centavos lido do banco) e **nunca cria segunda cobrança** para pedido pago;
- `webhook-abacatepay` (`verify_jwt = false`, obrigatório): a AbacatePay chama sem token do
  Supabase. Autenticidade: `?webhookSecret=` comparado com `ABACATE_WEBHOOK_SECRET` +
  assinatura `X-Webhook-Signature` quando presente; todo evento é reconfirmado com
  `GET /transparents/check` antes de tocar no pedido. Eventos a marcar no webhook:
  `transparent.completed`, `transparent.refunded`, `transparent.disputed`, `transparent.lost`;
- **permissões da chave de API**: marque `TRANSPARENT:CREATE` e `TRANSPARENT:READ` ao criar
  a chave no dashboard (sem elas a API responde 403);
- o QR expira em 1h (`expiresIn: 3600`) — expirando, o botão do site cria uma cobrança nova
  **para o mesmo pedido**;
- o código do QR e o status aparecem em `/carrinho` e em `/pedidos` (**Ver QR Pix**), com
  revalidação a cada 4s e botão **Verificar agora**. Pedido pago é confirmado pelo webhook
  mesmo que o cliente feche a página.

> **Sem** as funções publicadas o app continua vendendo: o pedido é gravado, o cliente recebe a
> confirmação e o aviso de que o Pix não pôde ser gerado naquele momento.

### Venda na loja (PDV) — `/admin/nova-venda`
Registra a compra do cliente que está no balcão:

1. busque e toque nos produtos para montar a venda;
2. em cada item escolha **“Leva agora”** (retirada na hora) ou **“Entregar depois”**;
3. informe nome/telefone — telefone e endereço só são exigidos se algo ficar para entrega;
4. escolha a forma de pagamento e finalize.

A venda do PDV **não abre o WhatsApp** (o cliente está na frente) e o valor é recalculado pelo
servidor na hora de gravar. Se sobrar item para entrega, o pedido nasce `confirmed` e segue o
fluxo normal em `/admin/pedidos`; se o cliente levou tudo, a venda já nasce concluída.
O que saiu do balcão fica com `fulfilled_at` preenchido (✓ retirado) e o pedido aparece com os
selos **Venda na loja** e **Retirada parcial**.

### Gestão de pedidos — a lista não cresce para sempre
- **Marcar item**: cada item tem um ✓ para marcar como retirado/entregue (e ↺ para desfazer);
- **Excluir um pedido**: botão *Excluir* no cartão do pedido (os itens vão junto);
- **Limpar cancelados (N)** e **Limpar entregues 30+ dias (N)**: no topo da lista, sempre com
  confirmação antes de apagar;
- o CSV exportado traz `origem` (Loja/Site), `entrega` (modo do pedido) e o destino de cada item.

### Autenticação — 100% gratuita
- **Magic Link por e-mail** e **e-mail + senha**: grátis (o e-mail embutido do Supabase tem
  limite de envios por hora; em produção, conecte um SMTP próprio em *Authentication → SMTP Settings*).
- **OTP via WhatsApp: removido** — enviar códigos por WhatsApp exige provedor **pago**
  (Twilio, Zenvia ou Meta WhatsApp Cloud API, cobram por mensagem/conversa). O ponto de
  reintegração fica documentado em `src/context/AuthContext.jsx`.
- Alternativa **grátis** de código de 6 dígitos por **e-mail**: troque `{{ .ConfirmationURL }}`
  por `{{ .Token }}` no template *Auth → Email Templates → Magic Link* e valide com
  `supabase.auth.verifyOtp({ email, token, type: 'email' })`.
- O WhatsApp usado no **checkout e no botão flutuante continua** — são apenas links
  `wa.me` (o cliente conversa direto com a loja), sem custo algum.

---

## 🗂️ Estrutura

```
src/
├── lib/supabaseClient.js        # cliente Supabase + helpers de upload (bucket 'store')
├── lib/checkout.js              # dados de entrega: campos, máscaras e validação (puro)
├── lib/utils.js                 # formatBRL, effectivePrice, pipeline de status, horários
├── lib/storeOrder.js            # rótulos de pagamento/entrega e WhatsApp do pedido
├── lib/useModalA11y.js           # ESC + foco inicial/devolução em modais e drawers
├── context/AuthContext.jsx       # sessão, perfil, role, magic link e senha (gratuitos)
├── context/StoreContext.jsx      # store_settings (tema via CSS vars), categorias, realtime
├── context/CartContext.jsx       # carrinho persistente + checkout (orders + WhatsApp)
├── components/ProtectedRoute.jsx # RequireAuth / RequireAdmin
├── components/SearchBar.jsx      # input com debounce (400ms)
├── components/MpPixDisplay.jsx    # QR Pix + Copia e Cola + revalidação do pagamento
├── components/ProductCard.jsx    # card da vitrine
├── layouts/StoreLayout.jsx       # header, nav de categorias, footer, WhatsApp flutuante
├── layouts/AdminLayout.jsx       # sidebar do painel
└── pages/
    ├── Home.jsx                  # vitrine + filtros + paginação
    ├── ProductPage.jsx           # detalhe + views
    ├── Login.jsx / Profile.jsx / Orders.jsx / Cart.jsx
    ├── admin/  Dashboard · Pedidos · Nova venda · Produtos · Categorias · Clientes · Cupons · Promoções · Configurações
supabase/functions/
├── create-abacate-order/index.ts   # Pix via AbacatePay (checkout transparente)
└── webhook-abacatepay/index.ts     # confirma o pagamento (secret na URL + HMAC)
supabase/schema.sql               # tabelas + RLS + storage + realtime + seed
vercel.json                       # SPA fallback para o deploy
```

---

## 🌍 Deploy (Vercel + GitHub)

1. Suba o repositório para o GitHub.
2. Em <https://vercel.com> → **Add New Project** → importe o repositório.
3. Configure as variáveis de ambiente `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
4. Deploy. O `vercel.json` já cuida do fallback de rotas (SPA).
5. No Supabase **Auth → URL Configuration**, troque o Site URL pela URL da Vercel
   e adicione `https://SEU-APP.vercel.app/**` às Redirect URLs.

---

## 📱 Destaques de UX mobile

- **Bottom navigation** estilo app (Início · Pedidos · Carrinho · Perfil · Menu) com badge de itens;
- **Checkout em 3 passos** (Sacola → Entrega → Revisão) com CTA fixo, total sempre visível e validação nos campos;
- Modais como **bottom sheets** no celular; galeria de fotos e ofertas em **carrossel com swipe**;
- **PWA manifest** (app instalável no Android) + **theme-color** que segue a cor primária da loja;
- **Compartilhar produto** via Web Share API (fallback WhatsApp) e **redefinição de senha** por e-mail;
- Abertura do WhatsApp com **fallback** para navegação direta (evita popup blocker do iOS);
- **CEP automático** via ViaCEP + máscaras de telefone/CEP nos formulários;
- **Favoritos** ❤️ (LocalStorage) com página própria em `/favoritos`;
- **Ordenação** da vitrine (recentes, mais vistos, preço) e filtros no histórico de pedidos;
- Admin: **busca de pedidos**, **exportação CSV** (pedidos e clientes) e ranking de **produtos mais vendidos**;
- **Ícones PWA em PNG** gerados por `scripts/generate-icons.py` com a cor da marca.

## ✅ Checklist rápido

- [x] Rodar `supabase/schema.sql` no SQL Editor
- [x] Rodar `supabase/migration-8.sql` (checkout seguro + trava do `role`)
- [x] Rodar `supabase/migration-9.sql` (venda na loja, retirada x entrega, exclusão de pedidos)
- [x] Rodar `supabase/migration-10.sql` (CPF, observação e confirmação de entrega pelo cliente)
- [x] Rodar `supabase/migration-11.sql` + `migration-12.sql` (promoções e múltiplas categorias)
- [x] Rodar `supabase/migration-13.sql` (Pix online no pedido) — só se for usar Pix online
- [x] Rodar `supabase/migration-14.sql` (opcional: agregações do painel no banco)
- [x] Rodar `supabase/migration-15.sql` (colunas do gateway de Pix — só se for usar Pix online)
- [x] Criar `admin@teste.com` e `cliente@teste.com` no Auth (auto-confirm)
- [x] Rodar os UPDATEs para promover o admin
- [x] Preencher `.env` com URL e anon key
- [x] Configurar nome, logo, cores, **WhatsApp** e horários em `/admin/configuracoes`
- [x] `npm test` + `npm run typecheck` + `npm run lint`
- [x] `npm run dev` → testar vitrine, login, carrinho, cupom, retirada, WhatsApp e `/admin`

## ♿ Acessibilidade

Já implementado no template:

- **Modais e drawers**: `role="dialog"` + `aria-modal`, **ESC fecha**, foco inicial no painel e
  foco devolvido ao elemento que abriu (`src/lib/useModalA11y.js`);
- **Formulários**: campos associados aos rótulos (`htmlFor`/`id`), inclusive nos campos gerados
  por lista (`f_<campo>`) e nos seletores de cor (`useId`);
- **Botões só de ícone** com `aria-label` (carrinho, favorito, fechar, compartilhar, WhatsApp);
- **Alerta de erro** do painel/Pix com `role="alert"`;
- **Contraste**: o gradiente do botão primário é derivado de `--brand-primary` (não há mais cor
  fixa no CSS) — escolha cores com bom contraste em `/admin/configuracoes` (a primária precisa
  funcionar sobre fundo branco).

Vale rodar **Lighthouse/axe** no seu nicho e nas suas cores finais (Chrome DevTools → Lighthouse,
aba Accessibility) e revisar a hierarquia de títulos das páginas que você criar.
