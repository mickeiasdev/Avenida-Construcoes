# Plano: transformar em SaaS multi-tenant (vender acessos a lojistas)

**Modelo escolhido: tabelas compartilhadas + coluna store_id + RLS.**
Já é o caminho que a migration-37 começou (store_id em products, categories,
orders, coupons, home_banners, product_reviews, delivery_zones,
delivery_cep_ranges). A sua loja (Avenida) vira o **tenant #1** — cliente
beta real do seu próprio produto.

Por que não as alternativas: schema-por-tenant e banco-por-tenant no
Supabase = limite de projetos e dor de migrations infinita. Shared tables +
RLS escala bem até milhares de lojas e mantém UMA base de código.

---

## Fase 1 — Fundação do banco ✅ (migration-39.sql, já pronta)

O que ela faz (sem quebrar nada do que já está no ar):

- Tabela **stores** (o registro de tenants): id, name, subdomain, owner,
  plan, status, trial_ends_at.
- A loja atual vira a store `00000000-0000-0000-0000-000000000001` (o
  mesmo valor default que a migration-37 já usa).
- **profiles.store_id** — cada usuário (lojista) pertence a uma loja.
- **store_settings.store_id** — prepara o fim do singleton (`id = 1`).
- Funções: **is_admin_of_store(store_id)** (o novo is_admin com escopo) e
  **is_super_admin()** (você, o dono do SaaS). is_admin() passa a aceitar
  super_admin também.

Critério de aceite: rodar a migration e a loja atual continuar 100% igual.

## Fase 2 — Escopo por loja (o coração do multi-tenant)

Objetivo: cada query só vê a loja certa. Roteiro:

1. **store_settings deixa de ser singleton** (migration-40): linha por
   loja. Frontend: [StoreContext.jsx](src/context/StoreContext.jsx) passa a
   carregar por store_id e updateSettings deixa de usar .eq('id', 1).
2. **Resolução de tenant**: função JS que extrai o subdomínio do
   location.host (avenida.sualoja.com → 'avenida') e busca a store;
   sem subdomínio = loja principal (sua, durante a transição). Valor vai
   pro StoreContext e é injetado em TODOS os selects com .eq('store_id', x).
3. **place_order v9**: herda o store_id do PRIMEIRO produto do pedido
   (spoof-proof — cliente não manda, o banco deduz) e o antispam passa a
   contar por (store_id, telefone). Grava orders.store_id.
4. **RLS com escopo**: todas as policies admin trocam is_admin() por
   is_admin_of_store(store_id). Lê públicos continuam públicos (produto
   ativo é público por natureza), mas escopo de escrita vira à prova de
   loja-errada.
5. **Storage**: pastas por loja (store/<store_id>/branding/...); o uploader
   do painel recebe o prefixo do contexto.
6. **Realtime**: nome do canal ganha o store_id
   ('store-updates-' + id) pra um lojista não receber evento de outro.
7. **server.js + SEO**: /sitemap.xml, /robots.txt, /c/:slug e
   /produto/:id passam a resolver a loja pelo Host (subdomínio) antes de
   consultar o Supabase — cada loja tem SEO próprio.
8. **Antispam, agendamentos, WhatsApp**: tudo que filtra "da loja" ganha o
   store_id (whatsapp_chats, bookings, error_reports…).

Critério de aceite: com DUAS lojas no banco (a sua + uma de teste), o admin
da A não vê produto/pedido/menu da B em NENHUMA tela.

## Fase 3 — Onboarding self-service (o lojista compra sozinho)

- Página pública de contratação (planos + preço + CTA).
- Signup do lojista: e-mail/senha (Supabase Auth) → RPC transacional
  **create_store_for_owner(nome, subdomain, nicho)** que numa transação só:
  cria a store, cria o profile (role=admin, store_id), aplica o preset do
  nicho (reusar [nichePresets.js](src/lib/nichePresets.js) como dados SQL).
- Wizard de primeira configuração: nome, logo, cor (reusar o editor visual
  do painel), WhatsApp, primeiro produto — pode reusar o AdminTour.
- Painel do lojista: nada muda pra ele — é o mesmo /admin de hoje.

Critério de aceite: um estranho cria loja sozinho do zero e vende em < 10 min.

## Fase 4 — Cobrança (vender os acessos)

- Tabela **subscriptions** (store_id, plano, status, período, provider,
  provider_ref) + **plans** (limites por plano).
- Como cobrar começando (mais simples → mais automático):
  1. Pix manual + você confirma no seu painel (dia 1: funciona).
  2. Mercado Pago: assinatura recorrente ou cobrança mensal com QR do Pix
     automático (você já usa MP na loja — reutilize o padrão do
     webhook-mercadopago).
- **Gate de acesso**: hook no login do lojista + middleware do server.js
  checam subscription. Trial 14 dias → vencido: vitrine mostra "loja
  pausada" e o painel só abre a tela de pagamento.
- Limites por plano no banco (RPC checa count de produtos/storage antes
  de inserir) — não no front, que é contornável.

Critério de aceite: lojista paga → acesso libera sozinho; para de pagar →
pausa sozinho.

## Fase 5 — Painel do SaaS (o SEU)

- Perfil super_admin (você) enxerga: lista de lojas, MRR, trials vencendo,
  churn, uso por loja (produtos, pedidos, storage), botão pausar/estender.
- Rotas /saas/* protegidas por is_super_admin() — separadas do /admin dos
  lojistas.
- Suporte: a aba de erros que existe (admin/erros) ganha filtro por loja.

## Fase 6 — Domínio próprio do cliente (diferencial premium)

No Caddy da VM, TLS sob demanda: quando um lojista aponta o DNS dele pra
sua VM, o certificado emite sozinho — mas SÓ de domínio pago:

Caddyfile:
```
sualoja.com, *.sualoja.com {
	on_demand_tls {
		ask http://localhost:3000/domain-check
	}
	reverse_proxy 127.0.0.1:3000
}
```

server.js ganha GET /domain-check?domain=X que consulta stores
(custom_domain = X and status = 'active') e responde 200/404.
Custom domains viram recurso do plano Pro.

## Fase 7 — Operação de SaaS de verdade

- **Migrations com cuidado**: a partir daqui TODA migration afeta TODos os
  clientes. Use um projeto Supabase de staging (ou branch) e rode o
  teste-place-order.sql antes de subir.
- **LGPD**: export/delete dos dados de um lojista que sair (script SQL por
  store_id) — prometa no contrato.
- Backups: dump Postgres semanal (pg_dump no Supabase) + .env guardado.
- Monitoramento: /healthz + uptime externo (UptimeRobot free) e a tabela
  error_reports agregada por loja.
- Rate limit do Supabase ( anon ): com N lojas o tráfego soma — monitore.

---

## O que NÃO fazer

- **service_role key no navegador** — nunca; ela fura TODA a RLS.
- **Confiar em header/query param pra RLS** — cliente mente; RLS só confia
  em auth.uid() e nos dados do banco.
- **Schema/banco por tenant no Supabase** — limite de projetos e migrations
  em N places.
- **Vender multi-tenant sem a Fase 2 testada com 2 lojas reais** —
  vazamento entre lojas é o pior bug possível de SaaS.
- Cobrar antes do produto entregar valor: comece com 3 lojas piloto
  (grátis) por 30 dias.

## Sugestão de preço pra começar (referência de mercado BR)

- **Trial**: 14 dias sem cartão.
- **Essencial**: R$ 49-69/mês — loja completa, 1 loja, subdomínio.
- **Pro**: R$ 99-149/mês — domínio próprio, mais produtos/storage,
  automações WhatsApp.
- Cobrança anual com 2 meses grátis melhora caixa e reduz churn.

## Ordem de execução e o que você pode vender

| Ordem | Fase | Pronto pra... |
| --- | --- | --- |
| 1 | Fundação (39) | já rodou hoje |
| 2 | Escopo + RLS | migrar a Avenida com segurança |
| 3 | Onboarding | aceitar lojista piloto manual |
| 4 | Cobrança | cobrar de fato |
| 5 | Painel SaaS | operar sem planilha |
| 6 | Domínios próprios | plano Pro |
| 7 | Operação/LGPD | escalar com segurança |

**Pronto pra vender** = Fases 2-4 com a Avenida rodando como tenant #1.
O caminho mais curto até a primeira venda: Fase 2 + onboarding manual
(você cria a loja do piloto na mão) + Pix manual — depois automatiza.
