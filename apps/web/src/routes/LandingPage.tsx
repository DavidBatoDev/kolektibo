import type { CSSProperties, ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useAuth } from '../lib/auth'
import { useLandingPageEffects } from '../hooks/useLandingPageEffects'

const CONTRACT =
  'https://stellar.expert/explorer/testnet/contract/CBR36Q2AEAUQWZ6CXESIYEGWPYCDUDHQP62EEYFHS5JELW4T3FGKINF2'
const PROOF_TX =
  'https://stellar.expert/explorer/testnet/tx/127e4e3f868798c3df9d6d8f4376d18e38d80dc9b470f961cb87420d1aa31278'

export function LandingPage() {
  const { user } = useAuth()
  useLandingPageEffects()
  const appTo = user ? '/app' : '/auth/sign-up'

  return (
    <div className="landing-page">
      <div className="banner">
        <header className="nav">
          <div className="wrap">
            <a className="brand" href="#top">
              <img src="/assets/kolektibo.svg" alt="" />
              Kolektibo
            </a>
            <nav className="nav-links">
              <a href="#how">How it works</a>
              <a href="#app">The app</a>
              <a href="#proof">Proof</a>
            </nav>
            <Link className="btn-primary sm" to={appTo}>
              Open the app
            </Link>
          </div>
        </header>

        <section className="hero" id="top">
          <div className="wrap">
            <div className="hero-content hero-anim" style={{ '--delay': 0 } as CSSProperties}>
              <div className="hero-text">
                <span className="eyebrow hero-anim" style={{ '--delay': 1 } as CSSProperties}>
                  AI treasurer · secured on Stellar
                </span>
                <h1 className="hero-anim" style={{ '--delay': 3 } as CSSProperties}>
                  Pooled money your group can trust.
                </h1>
                <p className="sub hero-anim" style={{ '--delay': 5 } as CSSProperties}>
                  One shared fund for your barkada — locked by a smart contract, so no single person can touch it.
                </p>
                <p className="micro-line hero-anim" style={{ '--delay': 7 } as CSSProperties}>
                  Barangay funds · church collections · team pondohan
                </p>
                <div className="actions hero-anim" style={{ '--delay': 9 } as CSSProperties}>
                  <Link className="btn-primary" to={appTo}>
                    Start a pool <span className="arw">→</span>
                  </Link>
                  <Link className="btn-ghost" to="/demo">
                    Watch the 60-sec demo →
                  </Link>
                </div>
                <div className="live-chip hero-anim" style={{ '--delay': 11 } as CSSProperties}>
                  <span className="dot" />
                  Live demo treasury · <b className="counter" data-target="48200">₱48,200</b> · Stellar testnet
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="powered">
        <div className="wrap">
          <span className="powered-label">Powered by</span>
          <div className="powered-row">
            <span className="logo-word">Stellar</span>
            <span className="logo-word">Soroban</span>
            <span className="logo-word">USDC</span>
            <span className="logo-word">Supabase</span>
          </div>
        </div>
      </section>

      <section className="pillars">
        <div className="wrap bento">
          <article className="bento-card lg green reveal-up glow-card" style={{ '--delay': 0 } as CSSProperties}>
            <span className="icon-badge">
              <img src="/assets/pool.webp" alt="" />
            </span>
            <div className="bento-body">
              <h3>One shared pool</h3>
              <p>Everyone chips in to one fund. Balances update on-chain, in pesos — nobody keeps the cash at home.</p>
            </div>
            <a className="bento-cta" href="#how">
              See how it works →
            </a>
          </article>
          <article className="bento-card mint reveal-up glow-card" style={{ '--delay': 2 } as CSSProperties}>
            <span className="icon-badge">
              <img src="/assets/coin.webp" alt="" />
            </span>
            <div className="bento-body">
              <h3>An AI treasurer</h3>
              <p>Ask how much you have or where the money went. Straight answers.</p>
            </div>
          </article>
          <article className="bento-card paper reveal-up glow-card" style={{ '--delay': 4 } as CSSProperties}>
            <span className="icon-badge">
              <img src="/assets/vault.webp" alt="" />
            </span>
            <div className="bento-body">
              <h3>Locked by a contract</h3>
              <p>Funds move only when your rules and enough officers say so.</p>
            </div>
          </article>
        </div>
      </section>

      <section className="how" id="how">
        <div className="wrap">
          <span className="section-label reveal-up">How it works</span>
          <h2 className="section-head reveal-up" style={{ '--delay': 1 } as CSSProperties}>
            From a plain-language rule to a self-guarding fund — in a minute.
          </h2>
          <ol className="steps grid-3">
            <li className="card step reveal-up" style={{ '--delay': 2 } as CSSProperties}>
              <span className="step-num">01</span>
              <h3>Set the rules</h3>
              <p>Say it in plain words; the AI turns it into on-chain policy.</p>
              <img className="step-ico" src="/assets/cycle.webp" alt="" />
            </li>
            <li className="card step reveal-up" style={{ '--delay': 4 } as CSSProperties}>
              <span className="step-num">02</span>
              <h3>Everyone contributes</h3>
              <p>Members add money straight into the shared contract.</p>
              <img className="step-ico" src="/assets/contribute.webp" alt="" />
            </li>
            <li className="card step reveal-up" style={{ '--delay': 6 } as CSSProperties}>
              <span className="step-num">03</span>
              <h3>Release with approvals</h3>
              <p>A spend needs 2 of 3 officers to sign. Then the money moves.</p>
              <img className="step-ico" src="/assets/verified.webp" alt="" />
            </li>
          </ol>
          <Link className="btn-ghost center-link reveal-up" style={{ '--delay': 8 } as CSSProperties} to="/demo">
            See the full demo →
          </Link>
        </div>
      </section>

      <section className="in-pocket" id="app">
        <div className="wrap">
          <span className="section-label reveal-up">In your pocket</span>
          <h2 className="section-head reveal-up" style={{ '--delay': 1 } as CSSProperties}>
            No wallet, no seed phrase, no drama. It feels like a chat app.
          </h2>
          <div className="phones">
            <figure className="phone reveal-up" style={{ '--delay': 2 } as CSSProperties}>
              <div className="phone-frame">
                <span>
                  Drop screen
                  <br />
                  <small>Pool · Home</small>
                </span>
              </div>
              <figcaption>Your pool at a glance.</figcaption>
            </figure>
            <figure className="phone lift reveal-up" style={{ '--delay': 4 } as CSSProperties}>
              <div className="phone-frame">
                <span>
                  Drop screen
                  <br />
                  <small>Ask the AI</small>
                </span>
              </div>
              <figcaption>Ask the AI treasurer.</figcaption>
            </figure>
            <figure className="phone reveal-up" style={{ '--delay': 6 } as CSSProperties}>
              <div className="phone-frame">
                <span>
                  Drop screen
                  <br />
                  <small>Spend · Approvals</small>
                </span>
              </div>
              <figcaption>Approve a spend — 2 of 3 to release.</figcaption>
            </figure>
          </div>
        </div>
      </section>

      <section className="safe">
        <div className="wrap">
          <div className="safe-text">
            <span className="section-label reveal-up">Why it&apos;s safe</span>
            <h2 className="section-head reveal-up" style={{ '--delay': 1 } as CSSProperties}>
              Safer than a notebook and one treasurer.
            </h2>
            <div className="points">
              <div className="point reveal-up" style={{ '--delay': 2 } as CSSProperties}>
                <span className="pn">01</span>
                <div>
                  <h4>No single point of failure</h4>
                  <p>The money lives in the contract, not one officer&apos;s wallet.</p>
                </div>
              </div>
              <div className="point reveal-up" style={{ '--delay': 4 } as CSSProperties}>
                <span className="pn">02</span>
                <div>
                  <h4>See every peso</h4>
                  <p>Every move is a public transaction. No more &quot;trust me.&quot;</p>
                </div>
              </div>
              <div className="point reveal-up" style={{ '--delay': 6 } as CSSProperties}>
                <span className="pn">03</span>
                <div>
                  <h4>The AI holds no keys</h4>
                  <p>It explains and tracks, but it can&apos;t move a centavo.</p>
                </div>
              </div>
              <div className="point reveal-up" style={{ '--delay': 8 } as CSSProperties}>
                <span className="pn">04</span>
                <div>
                  <h4>Proven, not promised</h4>
                  <p>Live on Stellar testnet today — not a mockup.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="pg" id="proof">
        <div className="wrap">
          <span className="section-label reveal-up">Proof it works</span>
          <h2 className="section-head reveal-up" style={{ '--delay': 1 } as CSSProperties}>
            Watch the contract enforce itself.
          </h2>
          <p className="pg-sub reveal-up" style={{ '--delay': 2 } as CSSProperties}>
            Run each scenario. A valid spend settles and earns a receipt. An attack collapses before any money moves.
          </p>

          <div className="pg-grid">
            <ProofPanel
              type="valid"
              breakAt={7}
              badge="A"
              badgeClass="ok"
              tagId="PANEL_A // VALID"
              icon="/assets/verified.webp"
              title="Legitimate payment"
              tags={['2 of 3 approved', 'within policy', 'on testnet']}
              nodes={[
                'composing spend',
                'within policy',
                'within daily limit',
                'officer 1 signed',
                'officer 2 signed · 2 of 3',
                'contract verified',
                'settled on testnet',
              ]}
              resultOk="Receipt emitted"
              desc="Two of three officers approve. The contract settles on Stellar testnet and emits a verifiable receipt."
              delay={0}
            />
            <ProofPanel
              type="attack"
              breakAt={4}
              badge="B"
              badgeClass="bad"
              tagId="PANEL_B // INJECTION"
              icon="/assets/vault.webp"
              title="AI hijack attempt"
              tags={['malicious prompt', 'AI has no keys']}
              nodes={[
                'prompt received',
                'AI drafts spend',
                'signature required',
                'AI holds no key',
                'halted',
                'halted',
                'halted',
              ]}
              resultBad="Blocked · no payment moved"
              desc="A message tells the AI to pay a stranger. The AI holds no keys — the spend still needs 2 of 3 officers. Nothing moves."
              delay={2}
            />
            <ProofPanel
              type="attack"
              breakAt={5}
              badge="C"
              badgeClass="bad"
              tagId="PANEL_C // UNDER-SIGNED"
              icon="/assets/approvals.webp"
              title="Under-signed spend"
              tags={['1 of 3 signatures', 'needs 2 of 3']}
              nodes={[
                'composing spend',
                'within policy',
                'officer 1 signed · 1 of 3',
                'submitted to contract',
                'NotEnoughApprovals',
                'reverted',
                'reverted',
              ]}
              resultBad="Reverted · no payment moved"
              desc={
                <>
                  A spend goes out with a single signature. The contract reverts with{' '}
                  <code>NotEnoughApprovals</code>.
                </>
              }
              delay={4}
            />
          </div>

          <div className="pg-foot">
            <p className="pg-real">
              Not a mockup — on Stellar testnet, one signature was rejected and two approvals moved the funds.
            </p>
            <div className="pg-links">
              <a className="btn-primary sm" href={CONTRACT} target="_blank" rel="noopener noreferrer">
                Open on Stellar Expert <span className="arw">→</span>
              </a>
              <p className="mono">
                contract{' '}
                <a href={CONTRACT} target="_blank" rel="noopener noreferrer">
                  CBR3…INF2
                </a>{' '}
                · proof tx{' '}
                <a href={PROOF_TX} target="_blank" rel="noopener noreferrer">
                  127e4e3f…31278
                </a>
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="cta">
        <div className="wrap">
          <div className="cta-inner">
            <h2 className="reveal-up">Start your first pool.</h2>
            <p className="reveal-up" style={{ '--delay': 2 } as CSSProperties}>
              Free on testnet. About a minute.
            </p>
            <Link className="btn-primary lg reveal-up" style={{ '--delay': 4 } as CSSProperties} to={appTo}>
              Open the app <span className="arw">→</span>
            </Link>
          </div>
        </div>
      </section>

      <footer className="foot">
        <div className="wrap foot-grid">
          <div className="foot-brand">
            <a className="brand" href="#top">
              <img src="/assets/kolektibo.svg" alt="" />
              Kolektibo
            </a>
            <p>Pooled money your group can trust.</p>
            <span className="powered">Powered by Stellar · Soroban · USDC</span>
          </div>
          <nav className="foot-col">
            <span className="foot-head">Product</span>
            <a href="#how">How it works</a>
            <a href="#app">The app</a>
            <a href="#proof">Proof</a>
            <Link to={appTo}>Open the app</Link>
          </nav>
          <div className="foot-col">
            <span className="foot-head">What&apos;s next</span>
            <p className="road">Mainnet + GCash cash-in</p>
            <p className="road">Passkey login — no seed phrases</p>
          </div>
        </div>
        <div className="wrap foot-legal">
          © 2026 Kolektibo · Built at the APAC Stellar Hackathon · Made for Filipino groups.
        </div>
      </footer>
    </div>
  )
}

function ProofPanel({
  type,
  breakAt,
  badge,
  badgeClass,
  tagId,
  icon,
  title,
  tags,
  nodes,
  resultOk,
  resultBad,
  desc,
  delay,
}: {
  type: 'valid' | 'attack'
  breakAt: number
  badge: string
  badgeClass: 'ok' | 'bad'
  tagId: string
  icon: string
  title: string
  tags: string[]
  nodes: string[]
  resultOk?: string
  resultBad?: string
  desc: ReactNode
  delay: number
}) {
  return (
    <article
      className={`pg-panel ${type === 'valid' ? 'valid' : 'attack'} reveal-up glow-card`}
      data-type={type}
      data-break={breakAt}
      style={{ '--delay': delay } as CSSProperties}
    >
      <header className="pg-head">
        <img className="pg-ico" src={icon} alt="" />
        <span className="pg-tag-id">{tagId}</span>
        <span className={`pg-badge ${badgeClass}`}>{badge}</span>
      </header>
      <h3>{title}</h3>
      <div className="pg-tags">
        {tags.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
      <div className="pg-seq" aria-hidden="true">
        {nodes.map((label) => (
          <i key={label} className="node" data-label={label} />
        ))}
      </div>
      <div className="pg-stage">
        <div className="pg-status">
          <span className="st-idle">
            <b className="ricon idle">▷</b>Run the sequence
          </span>
          <span className="st-live">
            <b className="st-dot" />
            <span className="st-txt" />
          </span>
        </div>
        <div className="pg-result">
          {resultOk && (
            <span className="r-ok">
              <b className="chk" />
              {resultOk}
            </span>
          )}
          {resultBad && (
            <span className="r-bad">
              <b className="crs" />
              {resultBad}
            </span>
          )}
        </div>
      </div>
      <p className="pg-desc">{desc}</p>
      <button className="pg-run" type="button">
        Run sequence <span className="arw">→</span>
      </button>
    </article>
  )
}
