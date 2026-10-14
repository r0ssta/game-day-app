import { useCallback, useEffect, useState } from 'react'
import { formationFromRow, normalizeFormationName } from '@/lib/custom-formations'
import { setActiveCustomFormations, type Formation, type FormationSlot } from '@/lib/formations'
import type { TeamFormat } from '@/lib/team-format'
import { supabase } from '@/supabaseClient'
import type { DbTeamFormation } from '@/types/database'

type Listener = (formations: Formation[], ready: boolean) => void

const listeners = new Set<Listener>()
let publishedFormations: Formation[] = []
let publishedReady = false

function publish(formations: Formation[], ready: boolean) {
  publishedFormations = formations
  publishedReady = ready
  setActiveCustomFormations(formations, ready)
  for (const listener of listeners) listener(formations, ready)
}

function rowsToFormations(rows: DbTeamFormation[]): Formation[] {
  return rows
    .map((row) => formationFromRow(row))
    .filter((formation): formation is Formation => formation !== null)
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
}

export type SaveTeamFormationInput = {
  id?: string
  name: string
  format: TeamFormat
  slots: FormationSlot[]
}

export function useTeamFormations(teamId: string | null | undefined) {
  const [formations, setFormations] = useState<Formation[]>(publishedFormations)
  const [ready, setReady] = useState(publishedReady)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const listener: Listener = (next, isReady) => {
      setFormations(next)
      setReady(isReady)
    }
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  useEffect(() => {
    if (!teamId) return
    let cancelled = false
    publish([], false)
    void supabase
      .from('team_formations')
      .select('*')
      .eq('team_id', teamId)
      .order('name', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.warn('[useTeamFormations]', error.message)
          publish([], true)
          return
        }
        publish(rowsToFormations(data ?? []), true)
      })
    return () => {
      cancelled = true
    }
  }, [teamId])

  const save = useCallback(
    async (input: SaveTeamFormationInput): Promise<Formation> => {
      if (!teamId) throw new Error('Select a team first')
      const name = normalizeFormationName(input.name)
      if (!name) throw new Error('Name the formation first')
      setSaving(true)
      try {
        const payload = {
          team_id: teamId,
          name,
          format: input.format,
          slots: input.slots,
          updated_at: new Date().toISOString(),
        }
        const query = input.id
          ? supabase.from('team_formations').update(payload).eq('id', input.id).select('*').single()
          : supabase.from('team_formations').insert(payload).select('*').single()
        const { data, error } = await query
        if (error) throw error
        const saved = formationFromRow(data)
        if (!saved) throw new Error('Saved formation could not be read back')
        const next = [...publishedFormations.filter((formation) => formation.id !== saved.id), saved].sort(
          (a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }),
        )
        publish(next, true)
        return saved
      } finally {
        setSaving(false)
      }
    },
    [teamId],
  )

  const remove = useCallback(async (id: string) => {
    setSaving(true)
    try {
      const { error } = await supabase.from('team_formations').delete().eq('id', id)
      if (error) throw error
      publish(
        publishedFormations.filter((formation) => formation.id !== id),
        true,
      )
    } finally {
      setSaving(false)
    }
  }, [])

  return { formations, ready, saving, save, remove }
}
