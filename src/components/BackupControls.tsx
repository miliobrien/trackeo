import { useRef, useState } from 'react'
import { exportBackup, importBackup } from '../db/repo'

/**
 * Everything lives in this browser, so clearing site data wipes the history
 * with no warning and no recovery. These two buttons are the only backup that
 * exists until the data moves to a server.
 */
export function BackupControls() {
  const fileInput = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')

  async function download() {
    const backup = await exportBackup()
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `trackeo-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
    setMessage('Respaldo descargado')
  }

  async function restore(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const { projects, entries } = await importBackup(JSON.parse(await file.text()))
      setMessage(`Restaurados ${projects} proyectos y ${entries} bloques`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo leer el archivo')
    }
  }

  return (
    <div className="flex items-center gap-3 text-xs">
      {message && <span className="text-graphite">{message}</span>}
      <button onClick={download} className="text-graphite underline-offset-4 hover:text-ink hover:underline">
        Exportar
      </button>
      <button
        onClick={() => fileInput.current?.click()}
        className="text-graphite underline-offset-4 hover:text-ink hover:underline"
      >
        Importar
      </button>
      <input ref={fileInput} type="file" accept="application/json" onChange={restore} className="hidden" />
    </div>
  )
}
