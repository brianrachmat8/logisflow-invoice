type BrandLogoProps = {
  className?: string;
  tone?: "light" | "dark";
  compact?: boolean;
  showTagline?: boolean;
};

export function BrandLogo({
  className = "",
  tone = "dark",
  compact = false,
  showTagline = false,
}: BrandLogoProps) {
  return (
    <span className={`logisflow-logo ${tone} ${compact ? "compact" : ""} ${className}`.trim()}>
      <svg className="logisflow-logo-mark" viewBox="0 0 96 96" role="img" aria-label="Logisflow">
        <defs>
          <linearGradient id="logisflowMarkGradient" x1="18" y1="12" x2="82" y2="84" gradientUnits="userSpaceOnUse">
            <stop stopColor="#13b7f2" />
            <stop offset="0.48" stopColor="#0a78d8" />
            <stop offset="1" stopColor="#06275b" />
          </linearGradient>
          <linearGradient id="logisflowAccentGradient" x1="10" y1="18" x2="88" y2="76" gradientUnits="userSpaceOnUse">
            <stop stopColor="#18c2ff" />
            <stop offset="1" stopColor="#1967ff" />
          </linearGradient>
        </defs>
        <path
          d="M36 18c-10.6 0-19.2 8.6-19.2 19.2 0 14.8 19.2 34.8 19.2 34.8s19.2-20 19.2-34.8C55.2 26.6 46.6 18 36 18Zm0 29.2a10 10 0 1 1 0-20 10 10 0 0 1 0 20Z"
          fill="url(#logisflowAccentGradient)"
        />
        <path
          d="M28 47v12.7c0 15.2 12.3 27.5 27.5 27.5H77c5.8 0 10.5-4.7 10.5-10.5S82.8 66.2 77 66.2H56.2c-4.3 0-7.8-3.5-7.8-7.8V47c-4.1 5.9-8.2 10.8-12.4 15.1C33.2 59.2 30.5 56.1 28 47Z"
          fill="url(#logisflowMarkGradient)"
        />
        <path
          d="M36 57v9.7c0 7.3 5.9 13.2 13.2 13.2h16"
          fill="none"
          stroke="#fff"
          strokeWidth="5.2"
          strokeLinecap="round"
          strokeDasharray="10 10"
        />
        <path d="M6 45h18M9 57h15M14 69h18" stroke="#18bff5" strokeWidth="5.2" strokeLinecap="round" />
        <circle cx="77" cy="76.7" r="14" fill="url(#logisflowAccentGradient)" />
        <circle cx="77" cy="76.7" r="6" fill="#fff" />
      </svg>
      <span className="logisflow-logo-copy">
        <span className="logisflow-logo-word">Logis<span>flow</span></span>
        {showTagline && <span className="logisflow-logo-tagline">Smart Logistics Flow</span>}
      </span>
    </span>
  );
}
