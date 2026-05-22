"use client";

import type { SVGProps } from "react";

export function NotificationSettingsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M6.75 10.35c0-3.2 2.1-5.55 5.25-5.55s5.25 2.35 5.25 5.55v1.85c0 .8.25 1.58.72 2.23l.84 1.16c.47.65 0 1.56-.8 1.56H5.99c-.8 0-1.27-.91-.8-1.56l.84-1.16c.47-.65.72-1.43.72-2.23v-1.85Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9.55 17.15a2.55 2.55 0 0 0 4.9 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M18.9 5.15h2.05M19.93 4.12v2.06" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M7.7 4.65 6.55 3.5M16.3 4.65l1.15-1.15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".45" />
    </svg>
  );
}

export function ApiTokenIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M14.25 8.15a4.3 4.3 0 1 0-3.3 5.02l2.15 2.15h2.35v2.35h2.35v2.15h2.8v-3.1l-6.35-6.35a4.3 4.3 0 0 0 0-2.22Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M7.7 9.85h.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M15.9 13.15 18.75 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".45" />
    </svg>
  );
}
