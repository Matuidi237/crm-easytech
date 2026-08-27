type IconProps = { size?: number; strokeWidth?: number; className?: string };

function base(size: number, strokeWidth: number) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
}

export function IconDashboard({ size = 19, strokeWidth = 1.7, className }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className}>
      <rect x="3" y="3" width="7.5" height="8.5" rx="2" />
      <rect x="13.5" y="3" width="7.5" height="5.5" rx="2" />
      <rect x="13.5" y="11.5" width="7.5" height="9.5" rx="2" />
      <rect x="3" y="14.5" width="7.5" height="6.5" rx="2" />
    </svg>
  );
}

export function IconUsers({ size = 19, strokeWidth = 1.7, className }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className}>
      <path d="M15.5 20v-1.6a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20" />
      <circle cx="8.75" cy="7.5" r="3.5" />
      <path d="M22 20v-1.6a4 4 0 0 0-3-3.87M16.5 4.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function IconImport({ size = 19, strokeWidth = 1.7, className }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className}>
      <path d="M21 15v3.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V15" />
      <path d="M7.5 9.5 12 14l4.5-4.5" />
      <path d="M12 14V3" />
    </svg>
  );
}

export function IconMail({ size = 19, strokeWidth = 1.7, className }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className}>
      <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
      <path d="m3.5 7 7.34 5.14a2 2 0 0 0 2.32 0L20.5 7" />
    </svg>
  );
}

export function IconSearch({ size = 17, strokeWidth = 1.8, className }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m20 20-4.5-4.5" />
    </svg>
  );
}

export function IconBell({ size = 18, strokeWidth = 1.7, className }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className}>
      <path d="M18 8.5a6 6 0 1 0-12 0c0 6-2.5 7.5-2.5 7.5h17S18 14.5 18 8.5" />
      <path d="M13.7 19.5a2 2 0 0 1-3.4 0" />
    </svg>
  );
}

export function IconLogout({ size = 17, strokeWidth = 1.7, className }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className}>
      <path d="M9.5 20.5H5.5a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2h4" />
      <path d="m15.5 16.5 4.5-4.5-4.5-4.5" />
      <path d="M20 12H9.5" />
    </svg>
  );
}

export function IconGlobe({ size = 19, strokeWidth = 1.7, className }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3.5 9.5h17M3.5 14.5h17" />
      <path d="M12 3a15 15 0 0 1 0 18A15 15 0 0 1 12 3" />
    </svg>
  );
}

export function IconLayers({ size = 19, strokeWidth = 1.7, className }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className}>
      <path d="m12 3 8.5 4.5L12 12 3.5 7.5 12 3Z" />
      <path d="m3.5 12.5 8.5 4.5 8.5-4.5" />
      <path d="m3.5 16.75 8.5 4.5 8.5-4.5" />
    </svg>
  );
}

export function IconTrash({ size = 16, strokeWidth = 1.7, className }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className}>
      <path d="M4 6.5h16M9.5 6.5V4.75a1.5 1.5 0 0 1 1.5-1.5h2a1.5 1.5 0 0 1 1.5 1.5V6.5" />
      <path d="M18 6.5v13a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19.5v-13" />
      <path d="M10.5 11v5.5M13.5 11v5.5" />
    </svg>
  );
}

export function IconPlus({ size = 17, strokeWidth = 1.9, className }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconArrowRight({ size = 16, strokeWidth = 1.8, className }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className}>
      <path d="M4 12h15M13 6l6 6-6 6" />
    </svg>
  );
}

export function IconArrowLeft({ size = 16, strokeWidth = 1.8, className }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className}>
      <path d="M20 12H5M11 6l-6 6 6 6" />
    </svg>
  );
}

export function IconSend({ size = 17, strokeWidth = 1.7, className }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className}>
      <path d="M21 3 10.5 13.5" />
      <path d="M21 3l-6.75 18-3.75-7.5L3 9.75 21 3Z" />
    </svg>
  );
}

export function IconFile({ size = 19, strokeWidth = 1.7, className }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

export function IconAlert({ size = 16, strokeWidth = 1.8, className }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5M12 16h.01" />
    </svg>
  );
}

export function IconCheck({ size = 16, strokeWidth = 1.9, className }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className}>
      <path d="m4.5 12.5 5 5 10-11" />
    </svg>
  );
}

export function IconMenu({ size = 20, strokeWidth = 1.9, className }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export function IconClose({ size = 20, strokeWidth = 1.9, className }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function IconUserCircle({ size = 19, strokeWidth = 1.7, className }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="10" r="3.2" />
      <path d="M5.8 19a6.5 6.5 0 0 1 12.4 0" />
    </svg>
  );
}

export function IconShield({ size = 19, strokeWidth = 1.7, className }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className}>
      <path d="M12 3 5 6v5.5c0 4.2 2.9 7.9 7 9.5 4.1-1.6 7-5.3 7-9.5V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function IconKey({ size = 17, strokeWidth = 1.7, className }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className}>
      <circle cx="8" cy="15" r="4" />
      <path d="m10.8 12.2 8.2-8.2M17 6l2.5 2.5M14.5 8.5 17 11" />
    </svg>
  );
}

export function IconMore({ size = 17, strokeWidth = 2, className }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className}>
      <circle cx="5" cy="12" r="1.2" fill="currentColor" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
      <circle cx="19" cy="12" r="1.2" fill="currentColor" />
    </svg>
  );
}

export function IconFilter({ size = 16, strokeWidth = 1.8, className }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className}>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2.2" />
      <circle cx="8" cy="17" r="2.2" />
    </svg>
  );
}

export function IconDownload({ size = 16, strokeWidth = 1.75, className }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className}>
      <path d="M21 15.5v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3" />
      <path d="M7.5 10 12 14.5 16.5 10M12 14.5v-11" />
    </svg>
  );
}

export function IconChevronDown({ size = 15, strokeWidth = 2, className }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function IconChevronLeft({ size = 16, strokeWidth = 2, className }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className}>
      <path d="m15 6-6 6 6 6" />
    </svg>
  );
}

export function IconChevronRight({ size = 16, strokeWidth = 2, className }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export function IconChevronsLeft({ size = 16, strokeWidth = 2, className }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className}>
      <path d="m17 6-6 6 6 6M10 6l-6 6 6 6" />
    </svg>
  );
}

export function IconChevronsRight({ size = 16, strokeWidth = 2, className }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className}>
      <path d="m7 6 6 6-6 6M14 6l6 6-6 6" />
    </svg>
  );
}

export function IconCopy({ size = 16, strokeWidth = 1.7, className }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className}>
      <rect x="9" y="9" width="12" height="12" rx="2.5" />
      <path d="M15 6.5V5.5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h1" />
    </svg>
  );
}

export function IconExternal({ size = 16, strokeWidth = 1.7, className }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className}>
      <path d="M14 4h6v6M20 4l-8.5 8.5" />
      <path d="M18 14.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4.5" />
    </svg>
  );
}

export function IconInbox({ size = 20, strokeWidth = 1.6, className }: IconProps) {
  return (
    <svg {...base(size, strokeWidth)} className={className}>
      <path d="M21 12.5h-5l-1.5 3h-5l-1.5-3H3" />
      <path d="M6.2 4.5h11.6a2 2 0 0 1 1.8 1.15l2.2 5.05a2 2 0 0 1 .2.85v6.95a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V11.5a2 2 0 0 1 .2-.85l2.2-5.05A2 2 0 0 1 6.2 4.5Z" />
    </svg>
  );
}
