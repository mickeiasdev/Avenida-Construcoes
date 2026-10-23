# 🏗️ Plano de evolução para Multi-Tenant SaaS

> Decisões já tomadas no código (migration-37) + o desenho do que vem.

## Já está pronto (fundação)
- **`store_id`** em products, categories, orders, coupons, home_banners,
  product_reviews, delivery_zones e delivery_cep_ranges — valor fixo por
  enquanto. Quando o multi-tenant chegar, cada lojista ganha o seu UUID e a
  RLS passa a filtrar por ele.
- **`schema_migrations`** — controle de versão do banco por loja (o painel
  avisa se houver migration pendente).
- **`billing_subscriptions`** — tabela pronta: store_id, customer_email,
  plan, status (active/pending/past_due/canceled), mp_subscription_id,
  current_period_end.

## Desenho do SaaS (quando você ativar)

### 1. Cadastro da loja nova
1. Lojista assina no site de vendas → webhook cria: tenant (store_id) +
   linha em store_settings + usuário admin;
2. Subdomínio automático: `lojadajoao.seudominio.com` (wildcard DNS + Vercel);
3. Seed de boas-vindas (categorias sugeridas do nicho escolhido).

### 2. Cobrança — Mercado Pago Assinaturas
- Criação: `POST /preapproval_plan` + `preapproval` (R$ 79–149/mês);
- Webhook `mercado-pago-subscription` (edge function nova):
  - `payment.created/approved` → status = active + current_period_end;
  - `payment.failed` → status = past_due;
- **Bloqueio suave**: past_due há 7 dias → banner "regularize o pagamento"
  na vitrine e no painel; 15 dias → loja em modo leitura (visualiza pedidos
  antigos, não aceita novos). NUNCA apagar dados de cliente.

### 3. RLS multi-tenant
```sql
create policy "tenant read products" on public.products
  for select using (store_id = current_setting('app.store_id')::uuid);
```
O `store_id` entra por JWT claim (login do lojista) — sem mudar o app.

### 4. Custos/limites por plano
- Plano base: 1 loja, 500 pedidos/mês, WhatsApp incluso;
- Plano pro: domínio próprio, relatórios, automações ilimitadas.

## O que NÃO muda
Todo o front já é white-label; StoreContext/settings por loja; as migrations
seguem numeradas e a `schema_migrations` garante que nenhuma loja fica
para trás.
