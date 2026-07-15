import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";
import { Card, inputClass } from "./ui";

type AuthIconName =
  | "account"
  | "check"
  | "globe"
  | "key"
  | "lock"
  | "login"
  | "mail"
  | "phone"
  | "shield"
  | "user"
  | "wallet";

export function AuthPage({
  icon,
  eyebrow,
  title,
  description,
  children,
}: {
  icon: AuthIconName;
  eyebrow: string;
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="auth-page">
      <header className="auth-page-heading">
        <span className="auth-page-icon" aria-hidden="true">
          <AuthGlyph name={icon} className="size-6" />
        </span>
        <div>
          <p className="auth-eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="auth-description">{description}</p>
        </div>
      </header>
      {children}
    </div>
  );
}

export function AuthCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <Card className={`auth-card ${className ?? ""}`}>{children}</Card>;
}

export function AuthInput({
  icon,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  icon: Extract<AuthIconName, "key" | "lock" | "mail" | "phone" | "user">;
}) {
  return (
    <div className="auth-input-wrap">
      <span className="auth-input-icon" aria-hidden="true">
        <AuthGlyph name={icon} className="size-5" />
      </span>
      <input
        className={`${inputClass} auth-input ${className ?? ""}`}
        {...props}
      />
    </div>
  );
}

export function AuthSelect({
  icon,
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  icon: Extract<AuthIconName, "globe">;
}) {
  return (
    <div className="auth-input-wrap">
      <span className="auth-input-icon" aria-hidden="true">
        <AuthGlyph name={icon} className="size-5" />
      </span>
      <select
        className={`${inputClass} auth-input ${className ?? ""}`}
        {...props}
      >
        {children}
      </select>
    </div>
  );
}

export function AuthSuccess({ children }: { children: ReactNode }) {
  return (
    <div className="auth-success" role="status">
      <span aria-hidden="true">
        <AuthGlyph name="shield" className="size-5" />
      </span>
      <p>{children}</p>
    </div>
  );
}

function AuthGlyph({
  name,
  className,
}: {
  name: AuthIconName;
  className?: string;
}) {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (name === "login") {
    return (
      <svg {...common}>
        <path d="M14 8l4 4-4 4M18 12H8" />
        <path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5" />
      </svg>
    );
  }
  if (name === "account") {
    return (
      <svg {...common}>
        <circle cx="9" cy="8" r="3" />
        <path d="M3.5 19c0-3 2.4-5 5.5-5 1.3 0 2.5.35 3.45.97" />
        <path d="M17 12v6M14 15h6" />
      </svg>
    );
  }
  if (name === "mail") {
    return (
      <svg {...common}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M4 7l8 6 8-6" />
      </svg>
    );
  }
  if (name === "lock") {
    return (
      <svg {...common}>
        <rect x="4" y="10" width="16" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
      </svg>
    );
  }
  if (name === "key") {
    return (
      <svg {...common}>
        <circle cx="8" cy="15" r="4" />
        <path d="M11 12l8-8M16 7l2 2M14 9l2 2" />
      </svg>
    );
  }
  if (name === "user") {
    return (
      <svg {...common}>
        <circle cx="12" cy="8" r="4" />
        <path d="M4.5 21c.5-4.2 3.2-6.5 7.5-6.5s7 2.3 7.5 6.5" />
      </svg>
    );
  }
  if (name === "phone") {
    return (
      <svg {...common}>
        <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
        <path d="M10 5h4M11 18.5h2" />
      </svg>
    );
  }
  if (name === "globe") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.4 2.5 3.6 5.5 3.6 9S14.4 18.5 12 21c-2.4-2.5-3.6-5.5-3.6-9S9.6 5.5 12 3z" />
      </svg>
    );
  }
  if (name === "wallet") {
    return (
      <svg {...common}>
        <path d="M4 6h14a2 2 0 0 1 2 2v10H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12" />
        <path d="M15 11h5v4h-5a2 2 0 0 1 0-4Z" />
      </svg>
    );
  }
  if (name === "check") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12.5l2.6 2.6L16.5 9" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M12 3l7 3v5c0 4.6-2.8 8-7 10-4.2-2-7-5.4-7-10V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}
