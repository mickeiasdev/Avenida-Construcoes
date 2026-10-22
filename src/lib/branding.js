// CONTATO DO DESENVOLVEDOR — aparece no botão de suporte do painel e no
// rodapé da vitrine. Edite aqui (o resto do sistema lê deste arquivo).
export const DEVELOPER = {
  name: 'MickeiasDev',
  url: 'https://github.com/mickeiasdev',
  // DDD + número (formato wa.me) — o WhatsApp de suporte do sistema
  whatsapp: '5585999999999',
}

export function devWhatsappLink(message) {
  return 'https://wa.me/' + DEVELOPER.whatsapp + '?text=' + encodeURIComponent(message ?? 'Olá! Preciso de ajuda com a minha loja.')
}
