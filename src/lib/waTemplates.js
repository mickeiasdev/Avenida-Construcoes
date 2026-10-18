// ============================================================
// VARIAÇÕES ANTI-BAN DO WHATSAPP
// O WhatsApp sinaliza contas que disparam mensagens IDÊNTICAS em
// repetição. Toda automação da loja sorteia entre 10 redações do
// mesmo tema (estrutura, emojis e saudações diferentes), e o envio
// ganha um pequeno delay aleatório de "digitação".
// Usado por: quickReplies do chat (clique sorteia), "Avisar cliente"
// (Pedidos) e — em cópia espelho — pelas Edge Functions whatsapp-chat
// (notifyOrder) e whatsapp-notify (avisos automáticos).
// ============================================================

// sorteia uma variação da lista
export function pickVariant(list) {
  if (!Array.isArray(list) || list.length === 0) return ''
  return list[Math.floor(Math.random() * list.length)]
}

// aplica {nome}, {loja}, {n}, {etapa}… num template
export function applyTemplate(tpl, vars = {}) {
  return String(tpl ?? '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : m))
}

// delay aleatório de digitação (ms) para mensagens automáticas
export function humanTypingDelay() {
  return Math.floor(Math.random() * 1400) + 600 // 0,6s a 2s
}

// ---------- ATUALIZAÇÃO DE STATUS AO CLIENTE (10) ----------
// {nome} {loja} {n} {etapa}
export const STATUS_CLIENT_TEMPLATES = [
  'Olá, {nome}! Aqui é da {loja} 👋\n\nAtualização do seu pedido nº {n}: *{etapa}*\n\nQualquer dúvida é só responder por aqui.',
  'Oi, {nome}! Passando da {loja} pra avisar 😊\n\nSeu pedido nº {n}: *{etapa}*\n\nSe precisar de algo, estamos por aqui!',
  'Fala, {nome}! Equipe {loja} falando 🙌\n\nNovidade do pedido nº {n}: *{etapa}*\n\nAbraço — qualquer coisa chama!',
  'Olá, {nome}, tudo bem? 😃\n\nDa {loja}: o pedido nº {n} agora está assim: *{etapa}*\n\nDúvidas? Responde aqui.',
  'Olá, {nome}! Aviso rápido da {loja}:\n\nPedido nº {n} — *{etapa}*\n\nTamo junto!',
  'Oi, {nome}! 👋 Aqui é a {loja}.\n\nO pedido nº {n} teve novidade: *{etapa}*\n\nQualquer coisa, é só chamar!',
  '{nome}, olha só quem apareceu 😄 — a {loja}, com notícia do pedido nº {n}:\n\n*{etapa}*\n\nPrecisando, estamos aqui!',
  'Olá, {nome}!\n\nA {loja} avisando que o pedido nº {n} está: *{etapa}*\n\nObrigado pela confiança!',
  'Ei, {nome}! 🚀 Atualização da {loja}:\n\nPedido nº {n} → *{etapa}*\n\nDeu tudo certo? Qualquer coisa responde!',
  'Oi, {nome}, tudo certo por aí? 😊\n\nSeu pedido nº {n} na {loja}: *{etapa}*\n\nEstamos à disposição!',
]

// ---------- PAGAMENTO CONFIRMADO AO CLIENTE (10) ----------
// {nome} {loja} {n}
export const PAID_CLIENT_TEMPLATES = [
  'Olá, {nome}! ✅ Recebemos o pagamento do seu pedido nº {n} na {loja}.\n\nJá estamos preparando tudo! Qualquer dúvida, responde aqui.',
  'Oi, {nome}! Pagamento confirmado! 🎉\n\nO pedido nº {n} da {loja} já está em preparo. Obrigado! 😊',
  '{nome}, tudo certo por aqui! 💚\n\nO pagamento do pedido nº {n} caiu — a {loja} já tá preparando seu pedido.',
  'Olá! Pagamento do pedido nº {n} confirmado ✅\n\nValeu pela confiança, {nome}! A {loja} avisa cada passo por aqui.',
  'Oi, {nome}! 🙌 Boa notícia: o pagamento do pedido nº {n} foi aprovado!\n\nA {loja} começa a preparar agora. Qualquer coisa, chama!',
  '{nome}, recebemos! ✅ O pedido nº {n} está pago e a {loja} já separa tudo.\n\nObrigado pela preferência! 😊',
  'Tudo certo, {nome}! 💚\n\nPagamento do nº {n} confirmado — a equipe da {loja} tá em ação.\n\nVamos mantendo você por dentro!',
  'Olá, {nome}! Obrigado por comprar com a {loja} 🙏\n\nO pagamento do pedido nº {n} foi confirmado e já estamos preparando.',
  'Boa, {nome}! 🎉 Pagamento do pedido nº {n} ok!\n\nA {loja} avisa quando sair pra entrega. Abraço!',
  'Oi, {nome}! 😊 Passando pra confirmar: o pagamento do pedido nº {n} chegou!\n\nA {loja} cuida do resto — qualquer coisa responde aqui.',
]

// ---------- NOVO PEDIDO — AVISO À LOJA (6) ----------
// {n} {cliente} {fone} {valor} {entrega}
export const NEW_ORDER_STORE_TEMPLATES = [
  '🛒 *Novo pedido no site*\nPedido nº {n} · {valor}\nCliente: {cliente} · {fone}\n{entrega}',
  '📢 Pedido novo chegando no site!\n\nNº {n} — {valor}\nCliente: {cliente} ({fone})\n{entrega}',
  '🆕 Venda pelo site:\n\nPedido {n} · {valor}\nCliente: {cliente}\nTel: {fone}\n{entrega}',
  '📦 Olha o site trabalhando:\n\nPedido nº {n} ({valor})\nCliente: {cliente}\n{fone}\n{entrega}',
  '⚡ Novo pedido pra separar:\n\nNº {n} — {valor}\nCliente: {cliente} · {fone}\n{entrega}',
  '🛍️ Tem pedido novo no site!\n\nPedido {n} · {valor}\nCliente: {cliente} · {fone}\n{entrega}',
]

// ---------- PAGAMENTO — AVISO À LOJA (5) ----------
// {n} {cliente} {fone} {valor}
export const PAID_STORE_TEMPLATES = [
  '🧾 *Pedido PAGO no site!*\nPedido nº {n} · {valor}\nCliente: {cliente} · {fone}\nDê andamento em /admin/pedidos.',
  '💰 Caiu o pagamento! Pedido nº {n} ({valor}).\nCliente: {cliente} · {fone}\nConfere lá nos pedidos!',
  '🚨 Pix confirmado:\n\nPedido nº {n} — {valor}\nCliente: {cliente} ({fone})\nBora preparar!',
  '✅ Beleza: pedido nº {n} pago ({valor}).\nCliente: {cliente} · {fone}\nJá pode separar!',
  '🎉 Pedido do site pago!\n\nNº {n} · {valor}\nCliente: {cliente} · {fone}\nDê andamento em /admin/pedidos.',
]

// ---------- RESPOSTAS RÁPIDAS DO CHAT (5 temas × 10) ----------
// {loja} {endereco} {horario}
export const QUICK_THEMES = {
  confirmed: [
    'Olá! Aqui é da {loja} 🙌 Seu pedido foi *confirmado* e já está em preparo. Já já temos mais notícias!',
    'Oi! Da {loja} falando 😊 *Pedido confirmado!* A equipe já começou a preparar. Qualquer coisa, chama!',
    'Boa notícia: seu pedido na {loja} foi *confirmado* ✅ Estamos preparando tudo com carinho!',
    'Olá! ✅ Confirmando seu pedido na {loja} — já está em preparo! Dúvidas? Responde aqui.',
    'Oi, tudo bem? Seu pedido foi *confirmado* pela {loja}! 🎉 Em breve mais atualizações.',
    'Aviso da {loja}: *pedido confirmado!* 👏 A preparação começou. Obrigado por comprar com a gente!',
    'Olá! Passando da {loja}: deu tudo certo com seu pedido — *confirmado!* ✅ Seguimos em contato.',
    'Boa! ✅ Pedido confirmado na {loja}. Preparando seu pedido agora — qualquer coisa responde!',
    'Olá! A {loja} agradece 🙏 — seu pedido foi *confirmado* e já entrou pra separação!',
    'Oi! Notícia boa: *seu pedido na {loja} foi confirmado!* 😊 Já estamos preparando.',
  ],
  preparing: [
    'Olá! Estamos *separando os itens* do seu pedido agora 📦 Avisamos quando sair pra entrega!',
    'Opa! 📦 Da {loja}: seu pedido entrou na fila de separação — logo mais tem novidade!',
    'Boa! Seu pedido está *em separação* aqui na {loja} 🛠️ Em breve avisamos o próximo passo.',
    'Oi! A equipe da {loja} está *separando tudo* direitinho 📦 Qualquer dúvida, responde!',
    'Avanço: seu pedido saiu do papel e já está *sendo separado*! 📦 — Equipe {loja}',
    'Olá! Trabalhando no seu pedido agora 😊 *Separação em andamento* na {loja}!',
    'Status: *separando seus itens!* 📦 Da {loja} — em breve mais notícias por aqui.',
    'Oi! Passando da {loja}: *seu pedido está em separação!* 🛒 Preparando tudo com capricho.',
    'Seu pedido na {loja} está *em preparo*! 📦 Logo, logo sai pra entrega (ou fica pronto pro balcão!).',
    'Olá! A {loja} avisando: começamos a separar seu pedido 📦 Siga as novidades por aqui!',
  ],
  shipping: [
    'Boas notícias: seu pedido *saiu pra entrega!* 🚚 Da {loja} — acompanhe por aqui!',
    '🚚 Seu pedido está a caminho! Da {loja} — qualquer imprevisto, avisamos por aqui.',
    'Oi! *Saiu pra entrega!* 🚀 A {loja} despachou seu pedido. Fique de olho!',
    'Olá! 🚚 Pedido da {loja} em rota de entrega! Qualquer coisa, responde aqui.',
    'Saiu da {loja}! *Seu pedido está na estrada* 🚚 Logo mais chega!',
    'Opa! 🚚 Seu pedido *saiu pra entrega agora* — Equipe {loja} avisando!',
    '🚚 Em rota! Seu pedido da {loja} está a caminho. Obrigado pela paciência!',
    'Olá! Da {loja}: *seu pedido saiu pra entrega!* 🚚 Já já chega!',
    'Novidade da {loja}: pedido *em rota de entrega!* 🚚 Fique de olho!',
    'Oi! 🚚 *Saiu pra entrega!* Da {loja} — qualquer dúvida é só responder!',
  ],
  delivered: [
    'Seu pedido foi *entregue!* ✅ A {loja} agradece a preferência — qualquer coisa, chama!',
    'Entrega concluída! 🎉 Obrigado por comprar com a {loja}! ⭐',
    'Tudo entregue! ✅ Esperamos que curta tudo! Da {loja}, um abraço!',
    'Olá! Confirmamos a *entrega do seu pedido* ✅ A {loja} agradece a confiança!',
    'Prontinho! 🎁 Pedido entregue. Qualquer necessidade, a {loja} tá aqui!',
    '✅ *Pedido entregue!* A {loja} agradece — e fica à disposição pro que precisar!',
    'Chegou! 😄 Entrega realizada pela {loja}. Obrigado pela confiança!',
    'Entrega finalizada ✅ Da {loja}: obrigado, e conte com a gente sempre!',
    'Olá! Seu pedido foi entregue com sucesso ✅ A {loja} deseja ótimo uso!',
    '🎉 Entregue! A {loja} agradece a preferência. Precisando de algo mais, chama!',
  ],
  address: [
    '{loja}\n📍 {endereco}\n🕐 {horario}',
    'A gente fica aqui:\n📍 {endereco}\n{loja} — {horario}',
    'Nosso endereço: {endereco} 📍\nFuncionamento: {horario}\nAbraço, {loja}!',
    '📍 {endereco}\n\nÉ aqui que a {loja} te espera! {horario}',
    'Opa! Aqui vai:\n📍 {endereco}\n🕐 {horario}\n— {loja}',
    'Nossa loja:\n{endereco}\nHorário: {horario}\nEsperamos por você! 😊 — {loja}',
    '{loja}\n{endereco}\n{horario}\nTe esperamos! 🙌',
    'Pra quem prefere pegar no balcão:\n📍 {endereco}\n🕐 {horario}',
    'Endereço e horário da {loja}:\n📍 {endereco}\n🕐 {horario}',
    '📍 Como chegar:\n{endereco}\n🕐 {horario}\n— Equipe {loja}',
  ],
}

// ---------- ENVIAR PRODUTO DA LOJA (10) ----------
// {produto} {preco} {link} {loja}
export const PRODUCT_TEMPLATES = [
  'Olha o que temos: *{produto}* — {preco}! 🛒\n\nConfere aqui: {link}\n\nQualquer dúvida, responde! — {loja}',
  'Recomendação da {loja}: *{produto}* por {preco}. 😊\n\nDetalhes e compra: {link}',
  'Esse aqui faz o seu serviço render: *{produto}* — {preco}\n\n👇 Tudo aqui: {link}\n\n— Equipe {loja}',
  'Separamos pra você: *{produto}* ({preco})\n\nVeja as infos e peça pelo site: {link}',
  'Olá! A {loja} tem *{produto}* no valor de {preco}.\n\nLink direto: {link} 🛒',
  'Chegou o que você procura? *{produto}* — {preco}\n\nConfere: {link} — qualquer coisa, chama!',
  'Só dar uma olhada: *{produto}* ({preco}) — disponível na {loja}!\n\n{link}',
  'Se precisar, temos *{produto}* por {preco} prontinho. 🙌\n\nInfos completas: {link}\n\n— {loja}',
  'Dica da {loja} 🛠️: *{produto}* a {preco}.\n\nCompra em 1 clique: {link}',
  'Produto da loja que combina com seu pedido: *{produto}* — {preco}\n\nSaiba mais: {link}',
]

// ---------- ENVIAR CUPOM (10) ----------
// {codigo} {desconto} {minimo} {link}
export const COUPON_TEMPLATES = [
  'Presente pra você! 🎁\nUse o cupom *{codigo}* e leve {desconto} na sua compra.\n\nAplica direto no carrinho 😉\n{link}',
  'Cupom exclusivo: *{codigo}* — {desconto}!\n\nVale no checkout do site: {link}',
  'Aproveita esse: cupom *{codigo}*, {desconto} na sua próxima compra. 🛒\n\n{link}',
  'Só pra você: use *{codigo}* e ganhe {desconto}!\n\nVálido no carrinho: {link}',
  'Descontão na sua mão: *{codigo}* ({desconto}).\n\nAplica lá: {link}',
  '🎁 Olha o cupom que o {minimo} libera pra você: *{codigo}* com {desconto}!\n\nCorre: {link}',
  'Bora economizar: cupom *{codigo}*, {desconto}!\n\nÉ só colar no carrinho: {link}',
  'Selinho de desconto: *{codigo}*\n{desconto} na sua compra. 😊\n\n{link}',
  'Vale um desconto: usa o código *{codigo}* e leva {desconto}.\n\nCompra aqui: {link}',
  'Do pro seu pedido: cupom *{codigo}*, {desconto}! 🛒\n\nAplica e finaliza: {link}',
]

// ---------- OFERTAS ATIVAS (10) ----------
// {itens} {loja} {link}
export const OFFERS_TEMPLATES = [
  '🔥 *Ofertas da {loja} em destaque!*\n\n{itens}\n\nConfira tudo: {link}',
  'Olha as promoções que estão valendo agora na {loja}: 🛒\n\n{itens}\n\n{link}',
  'Tá rolando desconto! {itens}\n\nVem ver: {link} — {loja}',
  '*Promoções ativas* 🏷️ — {loja}\n\n{itens}\n\nPeça pelo site: {link}',
  'Dá uma olhada nessas ofertas:\n\n{itens}\n\n— {loja} | {link}',
  'Barganhas de hoje na {loja}! 🏷️\n\n{itens}\n\n{link}',
  'Separamos as melhores promoções pra você:\n\n{itens}\n\nAproveite: {link}',
  '🔥 Ofertas quentes — {loja}\n\n{itens}\n\nTudo aqui: {link}',
  'Com desconto agora:\n\n{itens}\n\nCompre fácil: {link} — {loja}',
  '*Atenção, promoção!* 😄 {itens}\n\n{loja} — {link}',
]
