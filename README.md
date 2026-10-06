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

   > Já tinha rodado a versão anterior deste schema? Rode também [`supabase/migration-2.sql`](supabase/migration-2.sql)
   > (categoria opcional, estoque opcional, galeria de fotos e novas etapas de entrega).

O script cria:

| Tabela             | Função                                                                 |
|--------------------|------------------------------------------------------------------------|
| `store_settings`  | Identidade da loja (nome, logo, banner, cores, WhatsApp, endereço...)  |
| `categories`     | Categorias com slug                                                    |
| `products`       | Produtos (preço, estoque, imagem, status ativo/inativo, contador views)|
| `profiles`       | Estende `auth.users` (role `admin`/`client`, endereço, telefone)   |
| `orders`         | Pedidos (status, total, endereço de entrega)                           |
| `order_items`    | Itens de cada pedido                                                    |

E ainda:

- **Trigger `handle_new_user`**: cria automaticamente o `profile` com `role='client'`
  quando um usuário se cadastra no Auth;
- **RLS completa**: qualquer visitante lê produtos/categorias/configurações; só admin
  escreve; cada usuário vê apenas seus pedidos (função `is_admin()` centraliza a checagem);
- **Bucket público `store`** no Storage (logo, banner e imagens de produtos) com
  políticas de leitura pública e upload só para admin;
- **Realtime** nas tabelas `store_settings`, `categories`, `products` e `orders`;
- **Função `increment_product_views()`**: incrementa o contador de acessos do produto
  (usada no dashboard "produtos mais acessados") sem violar a RLS;
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
npm run dev      # http://localhost:5173
npm run build    # build de produção
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
| `/admin/pedidos`  | admin           | Lista de pedidos com etapas de entrega (pipeline atualizável) |
| `/admin/clientes` | admin           | Lista de clientes: contato, cidade, nº de pedidos e total gasto |
| `/admin/configuracoes` | admin     | Nome, logo, banner, cores hex, endereço, horários, WhatsApp   |

### Checkout via WhatsApp
Ao finalizar, o sistema grava `orders` + `order_items`, limpa o carrinho (LocalStorage) e
abre `https://wa.me/<whatsapp-da-loja>?text=<resumo>` com itens, endereço e total formatados.

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
├── context/AuthContext.jsx       # sessão, perfil, role, magic link e senha (gratuitos)
├── context/StoreContext.jsx      # store_settings (tema via CSS vars), categorias, realtime
├── context/CartContext.jsx       # carrinho persistente + checkout (orders + WhatsApp)
├── components/ProtectedRoute.jsx # RequireAuth / RequireAdmin
├── components/SearchBar.jsx      # input com debounce (400ms)
├── components/ProductCard.jsx    # card da vitrine
├── layouts/StoreLayout.jsx       # header, nav de categorias, footer, WhatsApp flutuante
├── layouts/AdminLayout.jsx       # sidebar do painel
└── pages/
    ├── Home.jsx                  # vitrine + filtros + paginação
    ├── ProductPage.jsx           # detalhe + views
    ├── Login.jsx / Profile.jsx / Orders.jsx / Cart.jsx
    └── admin/Dashboard.jsx · Settings.jsx · Categories.jsx · Products.jsx
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
- [x] Criar `admin@teste.com` e `cliente@teste.com` no Auth (auto-confirm)
- [x] Rodar os UPDATEs para promover o admin
- [x] Preencher `.env` com URL e anon key
- [x] `npm run dev` → testar vitrine, login, carrinho, WhatsApp e `/admin`
