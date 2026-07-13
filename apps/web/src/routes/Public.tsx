import { Link, useParams } from '@tanstack/react-router'
import { Badge, Button, Card } from '../components/ui'

const PRODUCT_POINTS = [
  ['Create rules together', 'Set contribution expectations, spending categories, limits, and approval thresholds before money moves.'],
  ['Members keep control', 'Every contribution and approval is signed by a member wallet. Kolektibo never holds the group’s keys.'],
  ['See the whole story', 'Balances, requests, approvals, and releases stay traceable on Stellar and readable in plain language.'],
] as const

export function LandingPage() {
  return (
    <div className="space-y-20 pb-16 pt-10 sm:pt-20">
      <section className="mx-auto max-w-4xl text-center">
        <Badge tone="green">Private group treasuries · Stellar testnet beta</Badge>
        <h1 className="mt-6 text-4xl font-bold tracking-tight text-white sm:text-6xl">
          Pooled money your whole group can trust.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
          Kolektibo helps barangays, clubs, teams, projects, and co-ops collect funds and approve
          spending together. The smart contract enforces the rules; the AI only explains them.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link to="/auth/sign-up">
            <Button className="w-full sm:w-auto">Create an account</Button>
          </Link>
          <Link to="/demo">
            <Button variant="ghost" className="w-full sm:w-auto">Explore the testnet demo</Button>
          </Link>
        </div>
        <p className="mt-4 text-xs text-slate-500">No real funds are used in the current beta.</p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {PRODUCT_POINTS.map(([title, body], index) => (
          <Card key={title} className="h-full">
            <span className="text-xs font-semibold text-brand-400">0{index + 1}</span>
            <h2 className="mt-3 text-lg font-semibold text-white">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">{body}</p>
          </Card>
        ))}
      </section>

      <section className="rounded-3xl bg-linear-to-br from-brand-700/30 to-ink-800/70 p-6 ring-1 ring-brand-500/20 sm:p-10">
        <div className="grid gap-8 md:grid-cols-[1.2fr_1fr] md:items-center">
          <div>
            <p className="text-sm font-semibold text-gold-400">One clear approval flow</p>
            <h2 className="mt-2 text-3xl font-bold text-white">Contribute. Request. Approve. Release.</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">
              A treasurer proposes a payment, the group’s approvers sign, and the contract releases
              USDC only after the configured threshold is met. No administrator can bypass it.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center text-sm">
            {['Private invites', 'Shared approvals', 'Live activity', 'Audit exports'].map((item) => (
              <div key={item} className="rounded-2xl bg-black/15 px-3 py-4 text-slate-200 ring-1 ring-white/10">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

const INFO: Record<string, { eyebrow: string; title: string; intro: string; items: [string, string][] }> = {
  'how-it-works': {
    eyebrow: 'How it works',
    title: 'A treasury that follows the group’s rules',
    intro: 'Kolektibo separates the friendly coordination layer from the contract that protects the money.',
    items: [
      ['1. Create a private pool', 'Choose contribution expectations, spending categories, approvers, and limits.'],
      ['2. Invite the group', 'Members join privately; approvers connect verified signing wallets before deployment.'],
      ['3. Contribute', 'Members sign contributions from their own wallet directly into the treasury contract.'],
      ['4. Govern spending', 'Requests collect the configured approvals before anyone can release funds.'],
    ],
  },
  features: {
    eyebrow: 'Features',
    title: 'Built for real group money workflows',
    intro: 'The production workspace brings membership, governance, reporting, and on-chain proof into one place.',
    items: [
      ['Flexible pools', 'Use templates for dues, projects, events, relief funds, or a custom treasury.'],
      ['Approval queues', 'See what needs your signature and why, with the exact policy shown before approval.'],
      ['Recipient checks', 'Validate payee accounts and USDC readiness before creating an irreversible request.'],
      ['Reports and receipts', 'Keep metadata and attachments off-chain while linking every record to chain proof.'],
    ],
  },
  security: {
    eyebrow: 'Security',
    title: 'The platform cannot take the pool’s money',
    intro: 'Money authority remains in Soroban; the application database has no transfer permission.',
    items: [
      ['Non-custodial', 'Members sign. The backend never receives private signing material.'],
      ['Threshold governed', 'Approver rules are enforced by the contract, not by a hidden administrator setting.'],
      ['Private by default', 'Pools are invite-only and database access is isolated with row-level security.'],
      ['Auditable', 'Confirmed activity links back to Stellar transaction and contract records.'],
    ],
  },
  pricing: {
    eyebrow: 'Pricing',
    title: 'Free during the testnet beta',
    intro: 'Core pool creation, contributions, approvals, and reports are free while Kolektibo prepares for a mainnet pilot.',
    items: [
      ['Beta', 'Unlimited testnet exploration for invited groups. No real money and no transfer fees.'],
      ['Future Pro', 'Advanced exports, higher AI usage, and priority support will be priced after the pilot.'],
    ],
  },
  about: {
    eyebrow: 'About Kolektibo',
    title: 'Designed for the way Filipino groups already pool money',
    intro: 'Kolektibo combines familiar group coordination with structural safeguards that do not depend on blind trust in one treasurer.',
    items: [
      ['Philippines first', 'Peso-first language and community workflows, settling in USDC on Stellar.'],
      ['Trust through rules', 'The AI does the paperwork; the smart contract enforces the actual movement of funds.'],
    ],
  },
}

export function PublicInfoPage({ page }: { page: keyof typeof INFO }) {
  const content = INFO[page]
  return (
    <div className="mx-auto max-w-4xl space-y-8 py-12 sm:py-20">
      <div className="max-w-2xl">
        <p className="text-sm font-semibold text-brand-400">{content.eyebrow}</p>
        <h1 className="mt-2 text-3xl font-bold text-white sm:text-5xl">{content.title}</h1>
        <p className="mt-4 leading-7 text-slate-300">{content.intro}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {content.items.map(([title, body]) => (
          <Card key={title} className="h-full">
            <h2 className="font-semibold text-white">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">{body}</p>
          </Card>
        ))}
      </div>
    </div>
  )
}

const HELP_ARTICLES: Record<string, { title: string; body: string[] }> = {
  'create-a-pool': { title: 'Create a pool', body: ['Start from My pools and choose Create a pool.', 'Complete the contribution, spending, and people steps. The draft is saved before anything is deployed.', 'Invite at least two approvers and wait for each signer to connect a verified wallet.'] },
  'join-a-pool': { title: 'Join a pool', body: ['Open the private invite link or enter its code from My pools.', 'Preview the pool and role before joining.', 'Members may browse first, but need a connected wallet before contributing.'] },
  'approve-a-spend': { title: 'Approve a spend', body: ['Open Approvals inside the pool.', 'Review the payee, amount, purpose, category limit, and existing signatures.', 'Your wallet signs the approval. The release remains locked until the contract threshold is satisfied.'] },
  'wallet-safety': { title: 'Wallet safety', body: ['Never share a secret key or approval prompt.', 'The current beta uses testnet wallets. Production approvers will enroll recovery-ready passkeys.', 'Kolektibo support will never ask you to send funds or reveal signing credentials.'] },
}

export function HelpPage() {
  return (
    <div className="mx-auto max-w-4xl py-12 sm:py-20">
      <p className="text-sm font-semibold text-brand-400">Help center</p>
      <h1 className="mt-2 text-3xl font-bold text-white">How can we help?</h1>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {Object.entries(HELP_ARTICLES).map(([slug, article]) => (
          <Link key={slug} to="/help/$article" params={{ article: slug }}>
            <Card className="h-full transition hover:bg-ink-700/60">
              <h2 className="font-semibold text-white">{article.title}</h2>
              <p className="mt-1 text-sm text-slate-500">Read guide →</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}

export function HelpArticlePage() {
  const { article = '' } = useParams({ strict: false }) as { article?: string }
  const content = HELP_ARTICLES[article]
  if (!content) return <PublicNotFound message="That help article does not exist." />
  return (
    <article className="mx-auto max-w-2xl py-12 sm:py-20">
      <Link to="/help" className="text-sm text-brand-400">← Help center</Link>
      <h1 className="mt-4 text-3xl font-bold text-white">{content.title}</h1>
      <div className="mt-6 space-y-4 text-sm leading-7 text-slate-300">
        {content.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      </div>
    </article>
  )
}

export function StatusPage() {
  return (
    <div className="mx-auto max-w-3xl py-12 sm:py-20">
      <Badge tone="green">Testnet beta operational</Badge>
      <h1 className="mt-4 text-3xl font-bold text-white">System status</h1>
      <p className="mt-3 text-slate-400">Live production probes will replace these beta readiness indicators before public launch.</p>
      <div className="mt-8 space-y-3">
        {['Web application', 'Stellar testnet RPC', 'AI and chain operations', 'Supabase identity and directory', 'Event indexer'].map((service, index) => (
          <Card key={service} className="flex items-center justify-between">
            <span className="text-sm text-slate-200">{service}</span>
            <Badge tone={index === 4 ? 'gold' : 'green'}>{index === 4 ? 'in development' : 'configured'}</Badge>
          </Card>
        ))}
      </div>
    </div>
  )
}

const LEGAL: Record<string, { title: string; paragraphs: string[] }> = {
  terms: { title: 'Terms of service', paragraphs: ['Kolektibo is currently a testnet beta and does not process real funds.', 'A production legal agreement, eligibility rules, prohibited-use policy, dispute process, and service limitations must be approved before mainnet launch.'] },
  privacy: { title: 'Privacy notice', paragraphs: ['Kolektibo stores account, membership, preference, and pool metadata in Supabase. Money authority and confirmed transfers remain on Stellar.', 'The production notice will document retention, processors, consent, access, export, correction, and deletion rights before public beta.'] },
  risk: { title: 'Risk disclosure', paragraphs: ['Blockchain transactions may be public and irreversible. Stablecoins, wallets, network availability, and third-party ramps carry risks.', 'The current product uses Stellar testnet assets with no monetary value. Do not treat demo balances as real funds.'] },
}

export function LegalPage({ document }: { document: keyof typeof LEGAL }) {
  const content = LEGAL[document]
  return (
    <article className="mx-auto max-w-2xl py-12 sm:py-20">
      <p className="text-sm font-semibold text-brand-400">Legal · beta draft</p>
      <h1 className="mt-2 text-3xl font-bold text-white">{content.title}</h1>
      <div className="mt-6 space-y-4 text-sm leading-7 text-slate-300">
        {content.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      </div>
    </article>
  )
}

function PublicNotFound({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-xl py-20 text-center">
      <h1 className="text-2xl font-semibold text-white">Page not found</h1>
      <p className="mt-2 text-sm text-slate-400">{message}</p>
      <Link to="/"><Button className="mt-6">Go home</Button></Link>
    </div>
  )
}
