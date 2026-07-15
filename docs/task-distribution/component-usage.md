# Phase-1 component usage

Canonical exports live in `apps/web/src/components/ui.tsx`. These snippets show the intended API;
screen-specific CSS should not replace these primitives.

## Modal and Sheet

```tsx
<Modal open={confirming} onClose={() => setConfirming(false)} title="Release funds?">
  <Button variant="gold">Release funds</Button>
</Modal>

<Sheet open={editing} onClose={() => setEditing(false)} title="Edit member">
  <MemberForm />
</Sheet>
```

`Modal` is for a short decision. `Sheet` is for a longer mobile task. Both trap focus, close on
Escape/backdrop, prevent background scrolling, and render through a document-level portal.

## Toast

```tsx
const toast = useToast()
toast('Invite link copied')
toast("Couldn't save the payee", 'danger')
```

`ToastProvider` is mounted once in `main.tsx`; messages are announced through an `aria-live` region.

## Empty, error, and loading

```tsx
<EmptyState title="No activity yet" body="Confirmed contributions will appear here." />
<ErrorState message="The feed is unavailable." onRetry={refetch} />
<List>{[0, 1, 2].map((id) => <SkeletonRow key={id} />)}</List>
```

Use skeletons shaped like the eventual content. Empty states invite the next action; errors explain
the recovery action.

## Avatar

```tsx
<Avatar name="Aling Nena" src={profile.avatar_url ?? undefined} verified />
```

The fallback derives initials. `verified` includes both a symbol and accessible label, so status is
not communicated by colour alone.

## List and Row

```tsx
<List>
  <Row leading={<Avatar name="Kuya Jun" />} title="Kuya Jun" subtitle="Member" trailing="₱200" />
</List>
```

Dense records share one divided surface. Pass `onClick` to `Row` only when the whole row is an action.

## SegmentedControl

```tsx
<SegmentedControl
  value={filter}
  onChange={setFilter}
  options={[{ value: 'all', label: 'All' }, { value: 'mine', label: 'Mine' }]}
/>
```

Use this for two to four mutually exclusive views of the same content. Use `Tabs` for different
sections and `Switch` for an independent setting.

## QRCode and CopyField

```tsx
<QRCode value={inviteUrl} label="Invite to Barangay 143" />
<CopyField value={inviteUrl} label="Invite link" />
```

QR codes render locally in the browser; invite values are not sent to an image or QR service.

