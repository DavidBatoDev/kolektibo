import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Database } from '../db/types.gen'

type Profile = Database['public']['Tables']['profiles']['Row']
type Settings = Database['public']['Tables']['user_settings']['Row']
type ProfileUpdate = Database['public']['Tables']['profiles']['Update']
type SettingsUpdate = Database['public']['Tables']['user_settings']['Update']

function db() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export function useProfile() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['profile', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Profile> => {
      const { data, error } = await db().from('profiles').select('*').eq('id', user!.id).single()
      if (error) throw error
      return data
    },
  })
}

export function useSettings() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['settings', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Settings> => {
      const { data, error } = await db()
        .from('user_settings')
        .select('*')
        .eq('user_id', user!.id)
        .single()
      if (error) throw error
      return data
    },
  })
}

export function useUpdateProfile() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: ProfileUpdate) => {
      const { error } = await db().from('profiles').update(patch).eq('id', user!.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile', user?.id] }),
  })
}

export function useUpdateSettings() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: SettingsUpdate) => {
      const { error } = await db().from('user_settings').update(patch).eq('user_id', user!.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', user?.id] }),
  })
}

/** Upload to avatars/<uid>/avatar.<ext> (owner-folder RLS), then save the public URL. */
export function useUploadAvatar() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase()
      const path = `${user!.id}/avatar.${ext}`
      const { error: upErr } = await db()
        .storage.from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type || 'image/png' })
      if (upErr) throw upErr
      const { data } = db().storage.from('avatars').getPublicUrl(path)
      const url = `${data.publicUrl}?v=${Date.now()}` // cache-bust on re-upload
      const { error: updErr } = await db()
        .from('profiles')
        .update({ avatar_url: url })
        .eq('id', user!.id)
      if (updErr) throw updErr
      return url
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile', user?.id] }),
  })
}
