import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getPushState, subscribeToPush, unsubscribeFromPush } from '../lib/push'

const key = ['push-subscription'] as const

export function usePushNotifications() {
  const queryClient = useQueryClient()
  const state = useQuery({ queryKey: key, queryFn: getPushState, staleTime: 0 })
  const enable = useMutation({
    mutationFn: subscribeToPush,
    onSuccess: (data) => queryClient.setQueryData(key, data),
  })
  const disable = useMutation({
    mutationFn: unsubscribeFromPush,
    onSuccess: (data) => queryClient.setQueryData(key, data),
  })
  return {
    ...state,
    enable: enable.mutateAsync,
    disable: disable.mutateAsync,
    isChanging: enable.isPending || disable.isPending,
    changeError: enable.error ?? disable.error,
  }
}
