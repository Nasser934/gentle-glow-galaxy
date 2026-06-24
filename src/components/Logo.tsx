import { Link } from "react-router-dom";

interface LogoProps {
  to?: string;
  size?: number;
  showWordmark?: boolean;
  showTagline?: boolean;
  className?: string;
}

/**
 * Concept AI mark — abstract "decision frame": four segmented panels forming a
 * precise C-shaped evaluation grid with a small central signal point.
 * Suggests scoring, structured analysis, decision intelligence.
 */
export const LogoMark = ({ size = 24, className = "" }: { size?: number; className?: string }) => (
  <svg
    viewBox="0 0 32 32"
    width={size}
    height={size}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden
  >
    {/* Top arm */}
    <rect x="3" y="3" width="14" height="6" rx="1.5" fill="currentColor" opacity="0.95" />
    {/* Left arm */}
    <rect x="3" y="11" width="6" height="10" rx="1.5" fill="currentColor" opacity="0.75" />
    {/* Bottom arm */}
    <rect x="3" y="23" width="14" height="6" rx="1.5" fill="currentColor" opacity="0.95" />
    {/* Vertical accent bar (signal column) */}
    <rect x="19" y="11" width="3" height="10" rx="1" fill="currentColor" opacity="0.55" />
    {/* Central signal point — the idea being evaluated */}
    <circle cx="26.5" cy="16" r="2.25" fill="currentColor" />
  </svg>
);

export const Logo = ({
  to = "/",
  size = 22,
  showWordmark = true,
  showTagline = false,
  className = "",
}: LogoProps) => {
  const inner = (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span
        className="flex items-center justify-center rounded-md bg-primary/10 p-1 text-primary ring-1 ring-inset ring-primary/20"
        style={{ width: size + 10, height: size + 10 }}
      >
        <LogoMark size={size - 4} />
      </span>
      {showWordmark && (
        <span className="flex flex-col leading-none">
          <span className="text-[15px] font-semibold tracking-tight text-foreground">
            Concept AI
          </span>
          {showTagline && (
            <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Feasibility Intelligence
            </span>
          )}
        </span>
      )}
    </span>
  );

  return to ? (
    <Link to={to} className="inline-flex items-center">
      {inner}
    </Link>
  ) : (
    inner
  );
};

export default Logo;
