import { useState, useEffect } from 'react'
import { usePayees, useAddPayee } from '../hooks/usePayees'
import { getPayee } from '../lib/livepool'
import { Button, Card, Field, inputClass } from './ui'

export function PayeePicker({
  poolId,
  value,
  onChange,
}: {
  poolId: string
  value: string
  onChange: (address: string) => void
}) {
  const { data: payees = [], isLoading } = usePayees(poolId)
  const add = useAddPayee(poolId)
  
  const [mode, setMode] = useState<'pick' | 'manual' | 'new'>('pick')
  
  // For new payee
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    // If the backend isn't there and we have local demo state, let's allow manual input 
    // or set the value if it's currently empty and we are in pick mode.
    if (!isLoading && payees.length === 0) {
      try {
        const local = getPayee()
        if (local && local.publicKey && !value) {
          onChange(local.publicKey)
          // We optionally set mode to manual so they can see the address
          setMode('manual')
        }
      } catch (e) {
        // ignore
      }
    }
  }, [isLoading, payees.length, value, onChange])

  const handleAdd = () => {
    add.mutate(
      { name, address, notes },
      {
        onSuccess: () => {
          onChange(address.trim())
          setMode('pick')
          setName('')
          setAddress('')
          setNotes('')
        },
      }
    )
  }

  if (mode === 'manual') {
    return (
      <div className="space-y-3">
        <Field label="Recipient address" hint="The payee's Stellar address (starts with G).">
          <input
            className={inputClass}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="G…"
          />
        </Field>
        {payees.length > 0 && (
          <button
            type="button"
            className="text-xs text-brand-400 hover:underline"
            onClick={() => setMode('pick')}
          >
            ← Pick from address book
          </button>
        )}
      </div>
    )
  }

  if (mode === 'new') {
    return (
      <Card className="space-y-4">
        <Field label="Payee name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="MVP Sports Depot" />
        </Field>
        <Field label="Stellar address">
          <input className={inputClass} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="G…" />
        </Field>
        <Field label="Notes" hint="Optional">
          <textarea className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={() => setMode('pick')}>Cancel</Button>
          <Button
            className="flex-1"
            disabled={!name.trim() || !address.trim()}
            loading={add.isPending}
            onClick={handleAdd}
          >
            Save & Select
          </Button>
        </div>
        {add.isError && <p className="text-xs text-rose-400">{String((add.error as Error).message)}</p>}
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <Field label="Recipient" hint="Select a saved payee or enter an address.">
        <select
          className={inputClass}
          value={
            value 
              ? (payees.some((p) => p.stellar_address === value) ? value : '__manual')
              : ''
          }
          onChange={(e) => {
            const val = e.target.value
            if (val === '__manual') setMode('manual')
            else if (val === '__new') setMode('new')
            else onChange(val)
          }}
        >
          <option value="" disabled>-- Select payee --</option>
          {payees.map((p) => (
            <option key={p.id} value={p.stellar_address}>
              {p.name}
            </option>
          ))}
          <option value="__manual">Enter manual address...</option>
          <option value="__new">+ Add new payee...</option>
        </select>
      </Field>
      {value && !['__manual', '__new', ''].includes(value) && (
        <p className="text-xs text-slate-500 font-mono break-all">
          {value}
        </p>
      )}
    </div>
  )
}
