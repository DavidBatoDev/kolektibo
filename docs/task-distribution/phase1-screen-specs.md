# Phase-1 mobile screen specifications

Owner: Jasmin (J3) · Reference viewport: 390 × 844 CSS px · Shell maximum: 448 px (`max-w-md`)

All layouts use the light green/gold token system, a 16 px page gutter, one primary action per screen,
44 px minimum standalone tap targets, and the shared primitives documented in
[`component-usage.md`](./component-usage.md). English and Tagalog copy must be called through `t()`.

| Flow | Mobile composition and copy | Loading / empty / error / success |
|---|---|---|
| Link a wallet | Illustrated hero → signer status card → address/proof explanation → dark `Link wallet` CTA. Never request or display a secret key. | Wallet-shaped skeleton; empty explains device-held signing; proof failure names the retry; success shows verified badge + shortened address. |
| Pool directory | Hero with total pool context → one divided pool list → `Create a pool` CTA. Each row shows name, role, status, and balance only when confirmed. | Three row skeletons; empty invites first pool; query error keeps retry; success navigates to overview. |
| Create / join | Step list for rules → people → review → deploy. Join preview shows pool name, member count, invited role, and a single `Join pool` action. | Preserve entered form data; invalid/exhausted invite explains why; deploy uses queued → signing → submitted/hash → confirmed. |
| Invite | Role and expiry controls → create CTA → active invite card with local QR and copyable link. Officer is offered only before deployment. | Skeleton existing invites; empty means no active links; creation error stays inline; copied link produces visible confirmation. |
| Member roster | One divided list, officers first. `Avatar`, role word, shortened wallet, verified symbol, contribution amount. | Row skeletons; empty invites an officer to share a link; roster error retries; joined member prepends after refresh. |
| Address book | Payee list → `Add payee` sheet. Require a name and valid Stellar address before save. | Row skeletons; empty invites first payee; validation is inline; saved payee gains a worded verified/check status. |
| Activity feed | Hero → live/reconnecting badge → one divided `List`. Each row has event symbol, actor sentence, peso amount, relative time, optional pool, and tx-hash explorer link. | Three `SkeletonRow`s; empty invites a first contribution; error offers retry; Supabase Realtime inserts prepend and reconnect triggers history backfill. |
| Notification settings | Currency/theme/language fields → push `Switch` → per-event checkboxes → save. Push switch applies immediately because browser permission is stateful. | Unsupported/denied status is explicit; subscription errors stay inline; enabled state comes from `PushManager.getSubscription()`; save confirmation uses brand text/toast. |
| Transaction lifecycle | Reuse `StepList`: queued → signing → submitted (hash visible) → confirmed. Release is the only gold action. | At 30 s submitted, say “Taking longer than usual” and keep explorer access. Failure includes what the member should do next; never end on a spinner. |

## Feed event copy

- `contrib`: “Aling Nena contributed ₱200”
- `spend_req`: “Kap. Ramon requested ₱1,200 for Equipment”
- `approve`: “Kuya Jun approved spend #4”
- `execute`: “₱1,200 was released for Equipment”

The contract/indexer payload supplies money and actor addresses. Directory profiles resolve display
names when available; otherwise use a shortened Stellar address, never a fabricated person.

## Realtime and notification boundary

- Initial history and reconnect backfill are ordinary Supabase queries.
- Live in-app delivery is only Supabase Realtime `postgres_changes` on `chain_events` inserts, filtered
  by contract ID and protected by the existing member RLS policy.
- Background delivery is standards-based Web Push from the service worker. It does not create a second
  in-app realtime bus.

