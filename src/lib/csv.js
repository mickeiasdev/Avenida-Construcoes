// Exporta um array de objetos como CSV (separador ';' + BOM UTF-8,
// para abrir corretamente com acentos no Excel BR)
export function downloadCsv(filename, rows) {
  if (!rows || rows.length === 0) return
  const headers = Object.keys(rows[0])
  const escape = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"'
  const csv = [
    headers.join(';'),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(';')),
  ].join('\n')

  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  // o link precisa estar no DOM em alguns navegadores, e a URL só pode ser
  // revogada depois que o download começou — senão o arquivo vem vazio
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
