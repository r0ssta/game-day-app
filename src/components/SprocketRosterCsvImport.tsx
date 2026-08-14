import { useCallback, useRef, useState, type DragEvent } from 'react'
import { CheckCircle2, FileUp, Loader2, Upload, XCircle } from 'lucide-react'
import { parseSprocketRosterCsv } from '@/lib/sprocket-csv'
import { cn } from '@/lib/utils'
import type { SprocketAddPlayerInput } from '@/components/SprocketImportSection'

type ImportStatusTone = 'success' | 'partial' | 'error' | 'info'

type ImportStatus = {
  tone: ImportStatusTone
  title: string
  detail?: string
}

type SprocketRosterCsvImportProps = {
  enabled: boolean
  contextLabel: string
  disabledHint?: string
  onAddPlayer: (input: SprocketAddPlayerInput) => Promise<unknown>
  onToast: (message: string) => void
}

function statusClasses(tone: ImportStatusTone): string {
  switch (tone) {
    case 'success':
      return 'border-2 border-neon bg-neon/15 text-foreground'
    case 'partial':
      return 'border-2 border-athletic bg-athletic/15 text-foreground'
    case 'error':
      return 'border-2 border-danger bg-danger/15 text-foreground'
    default:
      return 'border-2 border-border bg-secondary text-foreground'
  }
}

export function SprocketRosterCsvImport({
  enabled,
  contextLabel,
  disabledHint = 'Select an age group before importing.',
  onAddPlayer,
  onToast,
}: SprocketRosterCsvImportProps) {
  const csvInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [importing, setImporting] = useState(false)
  const [status, setStatus] = useState<ImportStatus | null>(null)

  const disabled = !enabled || importing

  const importRosterFile = useCallback(
    async (file: File) => {
      if (!enabled) {
        setStatus({
          tone: 'error',
          title: disabledHint,
        })
        return
      }

      setImporting(true)
      setStatus({ tone: 'info', title: `Importing roster from ${file.name}…` })

      try {
        const text = await file.text()
        const parsed = parseSprocketRosterCsv(text)

        if (parsed.players.length === 0) {
          const firstSkip = parsed.skipped[0]?.reason
          setStatus({
            tone: 'error',
            title: 'No players imported from CSV.',
            detail: firstSkip ?? 'Check that the file includes Name (or First/Last) columns.',
          })
          return
        }

        let imported = 0
        const failures: string[] = []

        for (const player of parsed.players) {
          try {
            await onAddPlayer({
              firstName: player.firstName,
              lastName: player.lastName,
              jersey: player.jersey,
              isGuest: false,
              primaryPosition: player.primaryPosition,
              secondaryPosition: player.primaryPosition,
            })
            imported += 1
          } catch (err) {
            failures.push(
              `Row ${player.rowNumber}: ${err instanceof Error ? err.message : 'Failed to add'}`,
            )
          }
        }

        const skipCount = parsed.skipped.length
        const warnText = [
          ...parsed.warnings,
          skipCount > 0 ? `${skipCount} row(s) skipped` : '',
          failures.length > 0 ? `${failures.length} row(s) failed to save` : '',
        ]
          .filter(Boolean)
          .join(' · ')

        if (imported === 0) {
          setStatus({
            tone: 'error',
            title: 'Roster import failed.',
            detail: warnText || failures[0] || 'No players were saved.',
          })
          return
        }

        const tone: ImportStatusTone =
          failures.length > 0 || skipCount > 0 || parsed.warnings.length > 0 ? 'partial' : 'success'
        setStatus({
          tone,
          title: `Successfully imported ${imported} player${imported === 1 ? '' : 's'} into ${contextLabel}.`,
          detail: warnText || undefined,
        })
        onToast(`Imported ${imported} player${imported === 1 ? '' : 's'} from Sprocket CSV`)
      } catch (err) {
        setStatus({
          tone: 'error',
          title: 'Could not read roster CSV.',
          detail: err instanceof Error ? err.message : 'Unknown error',
        })
      } finally {
        setImporting(false)
        if (csvInputRef.current) csvInputRef.current.value = ''
      }
    },
    [contextLabel, disabledHint, enabled, onAddPlayer, onToast],
  )

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    void importRosterFile(file)
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragOver(false)
    if (disabled) return
    handleFiles(event.dataTransfer.files)
  }

  return (
    <section className="space-y-3 rounded-xl border-2 border-border bg-background p-3">
      <div>
        <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wide text-foreground">
          <Upload className="size-4 text-athletic" />
          Import from Sprocket
        </h3>
        <p className="mt-1 text-xs font-semibold text-muted-foreground">
          Upload a Sprocket roster CSV into {contextLabel}. Maps Name, Jersey #, and Position.
        </p>
      </div>

      {!enabled ? (
        <p className="rounded-xl border-2 border-border bg-secondary px-3 py-2 text-sm font-extrabold text-foreground">
          {disabledHint}
        </p>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            if (!disabled) setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={cn(
            'rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors',
            dragOver ? 'border-neon bg-neon/10' : 'border-border bg-card',
            disabled && 'opacity-50',
          )}
        >
          <FileUp className="mx-auto size-6 text-athletic" />
          <p className="mt-2 text-sm font-extrabold text-foreground">Roster CSV</p>
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            disabled={disabled}
            onChange={(e) => handleFiles(e.target.files)}
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => csvInputRef.current?.click()}
            className="mt-3 w-full rounded-lg border-2 border-foreground/80 bg-card px-3 py-2.5 text-xs font-extrabold uppercase tracking-wide text-foreground disabled:opacity-40"
          >
            {importing ? 'Importing…' : 'Choose CSV'}
          </button>
        </div>
      )}

      {importing ? (
        <p className="flex items-center gap-2 text-sm font-extrabold text-foreground">
          <Loader2 className="size-4 animate-spin" />
          Working…
        </p>
      ) : null}

      {status ? (
        <div role="status" className={cn('rounded-xl px-4 py-3', statusClasses(status.tone))}>
          <p className="flex items-start gap-2 text-sm font-extrabold leading-snug">
            {status.tone === 'error' ? (
              <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            ) : (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
            )}
            <span>{status.title}</span>
          </p>
          {status.detail ? (
            <p className="mt-1 pl-6 text-xs font-semibold text-foreground/90">{status.detail}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
