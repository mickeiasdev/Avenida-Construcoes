# 📘 Manual do Lojista — sua loja vendendo em 1 hora

Bem-vindo! Este guia leva você da instalação à **primeira venda** sem enrolação.
Cada seção tem o caminho exato de onde clicar no painel.

---

## 🚀 Primeira venda em 10 passos

1. **Entrei, e agora?** → O painel abre um TOUR guiado (dá para rever no botão
   "Tour do painel", no rodapé da barra lateral).
2. **Preset de nicho** → *Configurações → Preset de nicho*: escolha
   Construção/Moda/Comida/Serviços e toque em **Salvar**. A loja já nasce com
   a cara do seu mercado.
3. **Identidade** → *Configurações*: nome da loja, logo, banner e o
   **WhatsApp que recebe os pedidos** (o mais importante!).
4. **Produtos** → *Produtos → Novo produto*: foto, preço, estoque. Promoção?
   Marque "Serviço" só se você agenda horário (salão, técnico, aula).
5. **Pagamento** → Pix automático é o padrão (precisa só do token do gateway
   na Vercel — o desenvolvedor configura para você). Dinheiro e cartão na
   entrega já funcionam sem nada.
6. **Entrega** → *Configurações → Zonas de entrega* (ex.: "Caponga · R$ 10 ·
   hoje") ou *Faixas de CEP*. Preencha UMA das duas. Retirada no balcão
   sempre funciona; ligue "Retirada com horário" para o cliente marcar a hora.
7. **WhatsApp do painel** → *WhatsApp*: leia o QR com o celular da loja. A
   partir daí você atende os clientes no chat DENTRO do painel.
8. **Divulgue** → copie o link da loja (botão "Ver loja") e poste no status,
   no Instagram e no grupo da obra.
9. **Pedidos chegam** → *Pedidos*: cada pedido novo aparece com selo. Ao
   avançar o status ("saiu para entrega"), o cliente recebe no WhatsApp
   automaticamente.
10. **Faça a festa** → *Dashboard* mostra as vendas do dia contra a sua meta
    (configure em *Configurações → Meta de vendas do dia*).

---

## 🧭 Onde fica cada coisa

| Quero... | Vá em... |
|---|---|
| Trocar cores/fonte/cantos | Configurações → Cores / Editor visual |
| Criar promoção com prazo | Promoções (ou marque Oferta no produto) |
| Cupom só pra primeira compra | Cupons → "Vale só para a PRIMEIRA compra" |
| Ver quem abandonou o carrinho | Automações → Carrinhos abandonados |
| Chamar clientes que sumiram | Automações → Recompra / Pós-entrega |
| Agenda de serviços e retiradas | Agendamentos |
| Exportar vendas pro contador | Relatórios → Pedidos do período (CSV) |
| Moderar avaliações | Avaliações (aprovar publica na loja) |
| Banner de campanha na home | Banners |

---

## ❓ Perguntas frequentes

**O cliente não recebe o WhatsApp de confirmação.**
① O servidor da Evolution está ligado? ② O número da loja está certo em
*Configurações*? ③ O painel WhatsApp mostra "conectado"? Se o erro citar
"DNS/túnel", ligue o servidor e atualize o endereço no Supabase (ou chame o
suporte — botão verde no canto do painel).

**O frete não aparece no checkout.**
O cliente precisa escolher a zona (ou digitar o CEP se você usa faixas).
Sem zonas E sem faixas, a entrega é "a combinar" (taxa zero).

**Esqueci a senha.** Na tela de login → "Esqueci minha senha" (link por e-mail).

**Como mudo a meta do dia?** Configurações → Meta de vendas do dia (R$ 0 esconde o medidor).

**Preciso de nota fiscal?** O sistema gera cupom de venda para imprimir
(pedidos → imprimir). A NF-e é adquirida separadamente no seu contador.

**Dados são meus?** Sim — e dá para exportar tudo: *Relatórios* tem CSV de
pedidos, produtos, clientes e backup completo em JSON.

---

## 🆘 Suporte
Botão verde **"Suporte"** (canto inferior direito do painel) — cai direto no
WhatsApp do desenvolvedor. Antes de chamar, tenha em mãos: o que você fez,
o que apareceu na tela e um print.
