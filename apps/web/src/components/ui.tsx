import {
  createContext, useContext, useEffect, useId, useRef, useState,
  type ButtonHTMLAttributes, type HTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

/* ============================================================
   ui.tsx — the kit. Nobody hand-rolls CSS. Import from here.
   Superset of the original API: Card, Button, Field, inputClass,
   Badge, ProgressBar, peso, SectionLabel — plus the Phase-1 primitives.
   ============================================================ */

const cx = (...c: (string | false | undefined | null)[]) =>
  c.filter(Boolean).join(" ");

/* ---------- money ---------- */

const pesoFmt = new Intl.NumberFormat("en-PH", {
  style: "currency", currency: "PHP", minimumFractionDigits: 0, maximumFractionDigits: 2,
});

/** Always ₱1,200. Never 1200, never PHP 1200. */
export const peso = (n: number) => pesoFmt.format(n);

/** The money number. Loudest thing on the screen. */
export function Money({
  amount, size = "hero", className,
}: { amount: number; size?: "hero" | "row"; className?: string }) {
  return (
    <span
      className={cx(
        "tabular-nums text-ink-950",
        size === "hero" ? "text-[40px] font-extrabold leading-[1.05] tracking-[-0.02em]"
                        : "text-[15px] font-semibold",
        className,
      )}
    >
      {peso(amount)}
    </span>
  );
}

/* ---------- button ---------- */

type Variant =
  | "primary"    // THE action. one per screen.
  | "secondary"  // the escape hatch next to it
  | "mint"       // small inline action inside a row
  | "accent"     // affirmative confirm in a sheet; the FAB
  | "gold"       // money LEAVING the pool. release/payout only.
  | "ghost"      // tertiary
  | "danger";    // destructive

const VARIANT: Record<Variant, string> = {
  primary:   "bg-ink-900 text-white hover:bg-ink-800 shadow-card",
  secondary: "bg-paper-0 text-ink-900 ring-1 ring-inset ring-ink-300 hover:bg-paper-100",
  mint:      "bg-brand-100 text-brand-700 hover:bg-brand-200",
  accent:    "bg-brand-500 text-white hover:bg-brand-600 shadow-green",
  gold:      "bg-gold-400 text-ink-950 hover:bg-gold-500", // ink text: white fails AA on gold
  ghost:     "bg-transparent text-ink-700 hover:bg-paper-100",
  danger:    "bg-paper-0 text-danger ring-1 ring-inset ring-danger/30 hover:bg-danger/5",
};

const SIZE = {
  sm: "h-9 px-4 text-[14px] gap-1.5",      // inside rows only
  md: "h-11 px-5 text-[15px] gap-2",       // default. 44px = tap target.
  lg: "h-13 px-6 text-[16px] gap-2",       // the one hero CTA
} as const;

export function Button({
  variant = "primary", size = "md", loading, icon, className, children, disabled, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: keyof typeof SIZE;
  loading?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center whitespace-nowrap rounded-full font-medium select-none",
        "transition active:scale-[0.97] motion-reduce:active:scale-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-paper-50",
        "disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100",
        VARIANT[variant], SIZE[size], className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {loading ? <span className="sr-only">{children}</span> : children}
    </button>
  );
}

function Spinner() {
  return (
    <svg className="size-4 animate-spin" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/* ---------- surfaces ---------- */

export function Card({
  hero, className, children, ...rest
}: HTMLAttributes<HTMLDivElement> & { hero?: boolean }) {
  return (
    <div
      className={cx(
        hero
          ? "rounded-[32px] p-6 text-white bg-[image:var(--gradient-hero)] shadow-green"
          : "ui-card rounded-[26px] p-4 bg-paper-0 shadow-card",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/** Small uppercase section header above a card group. (Preserved from the original kit.) */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-500">
      {children}
    </h2>
  );
}

/** Full-bleed illustrated heading for authenticated app routes. */
export function AppPageHero({
  eyebrow, title, body, asset, children, className,
}: {
  eyebrow?: string;
  title: ReactNode;
  body?: ReactNode;
  asset?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cx("app-page-hero", !asset && "app-page-hero-plain", className)}>
      <div className="app-page-hero-copy">
        {eyebrow && <p className="app-page-eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {body && <p className="app-page-summary">{body}</p>}
        {children && <div className="app-page-actions">{children}</div>}
      </div>
      {asset && <img className="app-page-asset" src={asset} alt="" aria-hidden="true" />}
    </header>
  );
}

/** Dense lists live in ONE card with divided rows. Not a card per row. */
export function List({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx("ui-list rounded-[26px] bg-paper-0 shadow-card overflow-hidden", className)}>
      <div className="divide-y divide-ink-300/60">{children}</div>
    </div>
  );
}

export function Row({
  leading, title, subtitle, trailing, onClick, className,
}: {
  leading?: ReactNode; title: ReactNode; subtitle?: ReactNode;
  trailing?: ReactNode; onClick?: () => void; className?: string;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={cx(
        "flex w-full items-center gap-3 px-4 py-3 text-left min-h-[56px]",
        onClick && "transition active:bg-paper-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500",
        className,
      )}
    >
      {leading}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium text-ink-950">{title}</div>
        {subtitle && <div className="truncate text-[13px] text-ink-700">{subtitle}</div>}
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </Tag>
  );
}

/* ---------- selection controls ---------- */

/** Switch = an independent setting. Applies IMMEDIATELY. No Save button. */
export function Switch({
  checked, onChange, label, hint, disabled,
}: {
  checked: boolean; onChange: (v: boolean) => void;
  label: string; hint?: string; disabled?: boolean;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex items-center gap-3 py-3 min-h-[56px] cursor-pointer">
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium text-ink-950">{label}</span>
        {hint && <span className="block text-[13px] text-ink-700">{hint}</span>}
      </span>
      <button
        id={id} role="switch" aria-checked={checked} disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          "relative h-7 w-12 shrink-0 rounded-full transition",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
          "disabled:opacity-40",
          checked ? "bg-brand-500" : "bg-ink-300",
        )}
      >
        <span
          className={cx(
            "absolute top-1 size-5 rounded-full bg-white shadow-card transition-all motion-reduce:transition-none",
            checked ? "left-6" : "left-1",
          )}
        />
      </button>
    </label>
  );
}

/**
 * SegmentedControl = the SAME content, re-cut. Applies immediately.
 * (Different content → Tabs. Can't decide → this.)
 * 2–4 options. At 5+, use Tabs or a Select.
 */
export function SegmentedControl<T extends string>({
  options, value, onChange, className,
}: {
  options: { value: T; label: string }[];
  value: T; onChange: (v: T) => void; className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cx("flex gap-1 rounded-full bg-paper-100 p-1", className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cx(
              "flex-1 rounded-full px-4 py-2 text-[14px] font-medium transition",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
              // active weight stays 500 — the thumb already says it's active
              active ? "bg-paper-0 text-ink-950 shadow-card" : "text-ink-700",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Tabs = DIFFERENT content. Sits under the header. Never nest with the above. */
export function Tabs<T extends string>({
  options, value, onChange,
}: {
  options: { value: T; label: string }[];
  value: T; onChange: (v: T) => void;
}) {
  return (
    <div role="tablist" className="flex gap-6 border-b border-ink-300/60 px-4">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cx(
              "relative -mb-px py-3 text-[15px] font-medium transition min-h-[44px]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-t-lg",
              active ? "text-ink-950" : "text-ink-700",
            )}
          >
            {o.label}
            {active && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand-500" />
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Filter chip. Multi-select, applies immediately. */
export function Chip({
  active, onClick, children,
}: { active?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <button
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        "rounded-full px-3.5 py-2 text-[13px] font-medium transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
        active ? "bg-brand-100 text-brand-700" : "bg-paper-100 text-ink-700 hover:bg-ink-300/50",
      )}
    >
      {children}
    </button>
  );
}

/* ---------- status ---------- */

type Tone = "neutral" | "brand" | "gold" | "danger" | "green" | "slate";

const TONE: Record<Tone, string> = {
  neutral: "bg-paper-100 text-ink-700",
  brand:   "bg-brand-100 text-brand-700",
  gold:    "bg-gold-300/40 text-gold-700",
  danger:  "bg-danger/10 text-danger",
  green:   "bg-brand-100 text-brand-700",
  slate:   "bg-paper-100 text-ink-700",
};

/** Colour is NEVER the only signal — pass an icon or a word too. */
export function Badge({
  tone = "neutral", icon, children,
}: { tone?: Tone; icon?: ReactNode; children: ReactNode }) {
  return (
    <span className={cx(
      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold",
      TONE[tone],
    )}>
      {icon}
      {children}
    </span>
  );
}

/** The approval chip. Most important status object in the app. */
export function ApprovalChip({ have, need }: { have: number; need: number }) {
  const met = have >= need;
  return met
    ? <Badge tone="brand" icon={<CheckIcon />}>Ready to release</Badge>
    : <Badge tone="neutral">{have} of {need} approvals</Badge>;
}

export function ProgressBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div
      role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
      className="h-2 w-full overflow-hidden rounded-full bg-paper-100"
    >
      <div
        className="h-full rounded-full bg-[image:var(--gradient-data)] transition-[width] duration-500 motion-reduce:transition-none"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/* ---------- tx lifecycle: queued → signing → submitted → confirmed ---------- */

export type StepState = "pending" | "active" | "done" | "failed";

export function StepList({
  steps,
}: { steps: { label: string; state: StepState; detail?: ReactNode }[] }) {
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => (
        <li key={i} className="flex items-start gap-3">
          <span className={cx(
            "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[12px]",
            s.state === "done"   && "bg-brand-100 text-brand-700",
            s.state === "active" && "bg-brand-500 text-white",
            s.state === "pending"&& "bg-paper-100 text-ink-500",
            s.state === "failed" && "bg-danger/10 text-danger",
          )}>
            {s.state === "done" ? <CheckIcon /> : s.state === "active" ? <Spinner /> : i + 1}
          </span>
          <span className="min-w-0 flex-1">
            <span className={cx(
              "block text-[15px] font-medium",
              s.state === "pending" ? "text-ink-500" : "text-ink-950",
            )}>
              {s.label}
            </span>
            {s.detail && <span className="block text-[13px] text-ink-700">{s.detail}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Truncated hash → stellar.expert. Tap to copy. (Testnet — matches lib/stellar.) */
export function TxHash({ hash }: { hash: string }) {
  return (
    <a
      href={`https://stellar.expert/explorer/testnet/tx/${hash}`}
      target="_blank" rel="noreferrer"
      className="font-mono text-[13px] text-brand-700 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
    >
      {hash.slice(0, 4)}…{hash.slice(-4)}
    </a>
  );
}

/* ---------- fields ---------- */

export const inputClass = cx(
  "h-11 w-full rounded-2xl bg-paper-100 px-4 text-[15px] text-ink-950",
  "placeholder:text-ink-500",
  "focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-paper-0",
  "disabled:opacity-40",
);

export function Field({
  label, hint, error, children,
}: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-[13px] font-medium text-ink-700">{label}</span>
      {children}
      {error
        ? <span className="block text-[13px] text-danger">{error}</span>
        : hint && <span className="block text-[13px] text-ink-500">{hint}</span>}
    </label>
  );
}

/** Invite links. Tap = copy. (Elton EL2) */
export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Field label={label}>
      <div className="flex items-center gap-2 rounded-2xl bg-paper-100 p-1.5 pl-4">
        <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-ink-700">{value}</span>
        <Button
          size="sm" variant={copied ? "mint" : "secondary"}
          onClick={() => {
            navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </Field>
  );
}

/* ---------- avatar ---------- */

export function Avatar({
  name, src, size = 40, verified,
}: { name: string; src?: string; size?: number; verified?: boolean }) {
  const initials = name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      {src
        ? <img src={src} alt="" className="size-full rounded-full object-cover" />
        : (
          <span className="grid size-full place-items-center rounded-full bg-brand-100 text-[13px] font-semibold text-brand-700">
            {initials}
          </span>
        )}
      {verified && (
        <span
          className="absolute -bottom-0.5 -right-0.5 grid size-4 place-items-center rounded-full bg-brand-500 text-white ring-2 ring-paper-0"
          aria-label="Wallet verified"
        >
          <CheckIcon />
        </span>
      )}
    </span>
  );
}

/* ---------- empty / loading / error ---------- */

/** Loading = skeleton of the ACTUAL shape. Never a spinner. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-lg bg-paper-100 motion-reduce:animate-none", className)} />;
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Skeleton className="size-10 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-2/5" />
        <Skeleton className="h-3 w-1/4" />
      </div>
      <Skeleton className="h-4 w-16" />
    </div>
  );
}

/** Empty = an invitation. Never "Nothing here yet." */
export function EmptyState({
  icon, title, body, action,
}: { icon?: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      {icon && (
        <span className="grid size-16 place-items-center rounded-full bg-[image:var(--gradient-glow)] text-ink-500">
          {icon}
        </span>
      )}
      <p className="text-[17px] font-semibold text-ink-950">{title}</p>
      <p className="max-w-xs text-[14px] text-ink-700">{body}</p>
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}

/** Error = what happened + the fix. No "Error:" prefix. No apology. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <EmptyState
      title="Something went wrong"
      body={message}
      action={onRetry && <Button variant="secondary" onClick={onRetry}>Retry</Button>}
    />
  );
}

/* ---------- sheet (mobile modal) ---------- */

export function Sheet({
  open, onClose, title, children,
}: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab") return;
      const f = ref.current?.querySelectorAll<HTMLElement>(
        'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])',
      );
      if (!f?.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    ref.current?.querySelector<HTMLElement>("button,input")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-ink-950/40" onClick={onClose} aria-hidden />
      <div
        ref={ref} role="dialog" aria-modal="true" aria-label={title}
        className="relative max-h-[calc(100dvh-1rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-[32px] bg-paper-0 p-5 pb-[calc(2rem+var(--safe-bottom))] shadow-lift animate-[slideUp_220ms_ease-out] motion-reduce:animate-none"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-ink-300" />
        <h2 className="mb-4 text-[19px] font-bold text-ink-950">{title}</h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/* ---------- toast ---------- */

type Toast = { id: number; message: string; tone?: Tone };
const ToastCtx = createContext<(m: string, tone?: Tone) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = (message: string, tone: Tone = "neutral") => {
    const id = Date.now();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              "rounded-full px-4 py-2.5 text-[14px] font-medium shadow-lift",
              t.tone === "danger" ? "bg-danger text-white" : "bg-ink-900 text-white",
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- icons ---------- */

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
