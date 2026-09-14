import { useState } from 'react'
import type { SyncStatus } from '../sync/useSync'

interface Props {
  status: SyncStatus
  error: string | null
  email: string | null
  signIn: (email: string) => Promise<void>
  signOut: () => Promise<void>
}

/** Deliberately colourless: green means a timer is running, nothing else. */
const LABELS: Record<SyncStatus, string> = {
  off: '',
  unknown: '',
  'signed-out': 'Solo en esta compu',
  offline: 'Sin conexión, se guarda igual',
  syncing: 'Sincronizando',
  pending: 'Guardando cambios',
  synced: 'Sincronizado',
  error: 'No se pudo sincronizar',
}

export function AccountBar({ status, error, email, signIn, signOut }: Props) {
  const [asking, setAsking] = useState(false)
  const [address, setAddress] = useState('')
  const [sent, setSent] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  // Nothing is claimed until the stored session has answered. Showing the
  // signed-out state first would flash "entrá" at someone who never left.
  if (status === 'off' || status === 'unknown') return null

  async function send() {
    if (!address.trim()) return
    setProblem(null)
    try {
      await signIn(address)
      setSent(address.trim())
      setAsking(false)
      setAddress('')
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : 'No se pudo enviar el enlace')
    }
  }

  if (asking) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <input
          autoFocus
          type="email"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void send()
            }
            if (e.key === 'Escape') setAsking(false)
          }}
          placeholder="tu@mail.com"
          aria-label="Tu correo"
          className="h-8 w-48 rounded-md border border-rule bg-card px-2 text-xs outline-none focus:border-ink"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={!address.trim()}
          className="h-8 rounded-md bg-ink px-3 text-xs text-paper disabled:opacity-40"
        >
          Mandame el enlace
        </button>
        <button type="button" onClick={() => setAsking(false)} className="text-graphite hover:text-ink">
          Cancelar
        </button>
        {problem && <span className="text-ink">{problem}</span>}
      </div>
    )
  }

  if (sent) {
    return (
      <p className="text-xs text-graphite">
        Te mandamos un enlace a <span className="text-ink">{sent}</span>. Abrilo en esta compu.{' '}
        <button onClick={() => setSent(null)} className="underline underline-offset-4 hover:text-ink">
          Usar otro correo
        </button>
      </p>
    )
  }

  return (
    <div className="flex items-center gap-2 text-xs text-graphite">
      <span
        aria-hidden
        className={`size-1.5 rounded-full ${status === 'synced' ? 'bg-graphite' : 'border border-graphite'}`}
      />
      <span title={error ?? undefined}>{LABELS[status]}</span>
      {email ? (
        <>
          <span className="text-rule">·</span>
          <button onClick={() => void signOut()} className="underline-offset-4 hover:text-ink hover:underline">
            Salir
          </button>
        </>
      ) : (
        <>
          <span className="text-rule">·</span>
          <button onClick={() => setAsking(true)} className="underline-offset-4 hover:text-ink hover:underline">
            Sincronizar
          </button>
        </>
      )}
    </div>
  )
}
