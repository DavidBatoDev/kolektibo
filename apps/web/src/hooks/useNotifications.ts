import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

const notificationsKey = ['notifications'] as const
const unreadKey = ['notifications', 'unread-count'] as const

export function useNotifications() {
  return useQuery({
    queryKey: notificationsKey,
    enabled: !!supabase,
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return data
    },
  })
}

export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: unreadKey,
    enabled: !!supabase,
    queryFn: async () => {
      const { count, error } = await supabase!
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .is('read_at', null)
      if (error) throw error
      return count ?? 0
    },
  })
}

/** Keep the notification list and unread bell count current without polling. */
export function useNotificationsRealtime(): void {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!supabase || !user) return
    const client = supabase

    const channel = client
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: notificationsKey })
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void queryClient.invalidateQueries({ queryKey: notificationsKey })
        }
      })

    return () => {
      void client.removeChannel(channel)
    }
  }, [queryClient, user?.id])
}
