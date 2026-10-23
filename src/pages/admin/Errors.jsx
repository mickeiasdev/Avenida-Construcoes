import { useEffect, useState } from 'react'
import { AlertTriangle, Check, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { formatDateTime } from '../../lib/utils'

// ERROS DA LOJA: falhas dos navegadores dos clientes caem aqui (migration-37).
export default function Errors() {
  const [rows, setRows] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from('error_reports')
        .select('*')
        .eq('resolved', false)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) { setRows([]); return }
      setRows(data ?? [])
    }
    load()
  }, [])

  async function resolve(id) {
    setBusy(true)
    await supabase.from('error_reports').update({ resolved: true }).eq('id', id)
    setBusy(false)
    setRows((rs) => (rs ?? []).filter((r) => r.id !== id))
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Erros do sistema</h1>
        <p className="text-sm text-gray-500">Falhas reportadas pelos navegadores dos clientes — resolva e acompanhe. Vazio = loja saudável. 🎉</p>
      </div>

      {rows === null ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : rows.length === 0 ? (
        <p className="card py-10 text-center text-sm text-gray-400">Nenhum erro em aberto.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="card list-row flex-col items-start gap-2 !p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 font-bold text-red-500">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span className="truncate">{r.message}</span>
                </p>
                <p className="mt-0.5 truncate text-xs text-gray-500">
                  {formatDateTime(r.created_at)} · {r.url} · {r.context ?? '—'}
                </p>
                {r.stack && <pre className="mt-1 max-h-24 overflow-auto rounded-lg bg-gray-50 p-2 text-[10px] leading-tight text-gray-500">{r.stack.slice(0, 500)}</pre>}
              </div>
              <button type="button" className="btn-soft btn-sm shrink-0" disabled={busy} onClick={() => resolve(r.id)}>
                <Check className="h-3.5 w-3.5" /> Resolver
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
