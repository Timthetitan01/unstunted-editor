import type { SVGProps } from 'react'

// Hand-drawn 16×16 monochrome icons in the style of Premiere's UI glyphs.
// All inherit `currentColor` so CSS controls their tint.

type P = SVGProps<SVGSVGElement> & { size?: number }

function Svg({ size = 15, children, ...rest }: P): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

// ── tools ──
export const IcSelect = (p: P): JSX.Element => (
  <Svg {...p}><path d="M4.5 1.2v11.6l2.7-2.6 1.7 4.1 1.9-.8-1.7-4 3.7-.3z" /></Svg>
)

export const IcTrackFwd = (p: P): JSX.Element => (
  <Svg {...p}>
    <path d="M2 3h1.7v10H2z" />
    <path d="M5.5 8l4.6-4.6v2.8H15v3.6h-4.9v2.8z" />
  </Svg>
)

export const IcRazor = (p: P): JSX.Element => (
  <Svg {...p}>
    <path
      fillRule="evenodd"
      d="M2.2 4.5h11.6c.7 0 1.2.5 1.2 1.2v4.6c0 .7-.5 1.2-1.2 1.2H2.2c-.7 0-1.2-.5-1.2-1.2V5.7c0-.7.5-1.2 1.2-1.2zm4.6 2.7h2.4v1.6H6.8zM3.2 7.3h1.4v1.4H3.2zm8.2 0h1.4v1.4h-1.4z"
    />
  </Svg>
)

export const IcHand = (p: P): JSX.Element => (
  <Svg {...p}>
    <path d="M5.2 14.2c-1.4-1.4-3-3.3-3-4.9 0-1 1.3-1.4 2-.5l.7.9V4.3c0-1.2 1.6-1.2 1.6 0V8h.5V2.9c0-1.2 1.6-1.2 1.6 0V8h.5V3.7c0-1.2 1.6-1.2 1.6 0V8.8h.5V5.5c0-1.1 1.5-1.1 1.5 0v4.4c0 2.6-1.7 4.3-4.2 4.3z" />
  </Svg>
)

export const IcZoom = (p: P): JSX.Element => (
  <Svg {...p} fill="none" stroke="currentColor">
    <circle cx="6.7" cy="6.7" r="4.4" strokeWidth="1.6" />
    <path d="M10.2 10.2L14.4 14.4" strokeWidth="2" strokeLinecap="round" />
  </Svg>
)

// ── timeline chrome ──
export const IcMagnet = (p: P): JSX.Element => (
  <Svg {...p}>
    <path d="M3 1.8h3.6v6.4a1.4 1.4 0 0 0 2.8 0V1.8H13v6.4a5 5 0 0 1-10 0z" />
    <path d="M3 3.9h3.6v1.3H3zm6.4 0H13v1.3H9.4z" opacity=".35" />
  </Svg>
)

export const IcMarker = (p: P): JSX.Element => (
  <Svg {...p}><path d="M4.8 1.8h6.4v11.7L8 10.7l-3.2 2.8z" /></Svg>
)

export const IcLock = (p: P): JSX.Element => (
  <Svg {...p}>
    <rect x="3.4" y="7" width="9.2" height="7.2" rx="1.1" />
    <path d="M5.4 7V5.1a2.6 2.6 0 0 1 5.2 0V7" fill="none" stroke="currentColor" strokeWidth="1.5" />
  </Svg>
)

export const IcUnlock = (p: P): JSX.Element => (
  <Svg {...p}>
    <rect x="3.4" y="7" width="9.2" height="7.2" rx="1.1" />
    <path d="M5.4 7V5a2.6 2.6 0 0 1 5-.9" fill="none" stroke="currentColor" strokeWidth="1.5" />
  </Svg>
)

export const IcEye = (p: P): JSX.Element => (
  <Svg {...p}>
    <path
      d="M8 3.8c-3.6 0-6 2.8-6.9 4.2.9 1.4 3.3 4.2 6.9 4.2s6-2.8 6.9-4.2C14 6.6 11.6 3.8 8 3.8z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    />
    <circle cx="8" cy="8" r="2" />
  </Svg>
)

// ── transport ──
export const IcMarkIn = (p: P): JSX.Element => (
  <Svg {...p} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
    <path d="M10.2 1.8c-2.1 0-3.1.9-3.1 2.7v1.4c0 1.4-.7 2-2 2.1 1.3.1 2 .7 2 2.1v1.4c0 1.8 1 2.7 3.1 2.7" />
  </Svg>
)

export const IcMarkOut = (p: P): JSX.Element => (
  <Svg {...p} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
    <path d="M5.8 1.8c2.1 0 3.1.9 3.1 2.7v1.4c0 1.4.7 2 2 2.1-1.3.1-2 .7-2 2.1v1.4c0 1.8-1 2.7-3.1 2.7" />
  </Svg>
)

export const IcGoIn = (p: P): JSX.Element => (
  <Svg {...p}>
    <path d="M2.6 3h1.7v10H2.6z" />
    <path d="M14 7.1v1.8H9.6l1.9 1.9-1.3 1.3L5.9 8l4.3-4.1 1.3 1.3-1.9 1.9z" />
  </Svg>
)

export const IcGoOut = (p: P): JSX.Element => (
  <Svg {...p}>
    <path d="M11.7 3h1.7v10h-1.7z" />
    <path d="M2 7.1v1.8h4.4L4.5 10.8l1.3 1.3L10.1 8 5.8 3.9 4.5 5.2l1.9 1.9z" />
  </Svg>
)

export const IcStepBack = (p: P): JSX.Element => (
  <Svg {...p}>
    <path d="M4 3h1.7v10H4z" />
    <path d="M12.8 3.6v8.8L6.9 8z" />
  </Svg>
)

export const IcStepFwd = (p: P): JSX.Element => (
  <Svg {...p}>
    <path d="M10.3 3H12v10h-1.7z" />
    <path d="M3.2 3.6v8.8L9.1 8z" />
  </Svg>
)

export const IcPlay = (p: P): JSX.Element => (
  <Svg {...p}><path d="M4.6 2.4v11.2L14 8z" /></Svg>
)

export const IcStop = (p: P): JSX.Element => (
  <Svg {...p}><rect x="3.6" y="3.6" width="8.8" height="8.8" rx="0.8" /></Svg>
)

export const IcCamera = (p: P): JSX.Element => (
  <Svg {...p}>
    <path
      fillRule="evenodd"
      d="M5.9 2.6L6.8 1.4h2.4l.9 1.2H14c.6 0 1 .4 1 1v8.8c0 .6-.4 1-1 1H2c-.6 0-1-.4-1-1V3.6c0-.6.4-1 1-1zM8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0-1.4a1.6 1.6 0 1 1 0-3.2 1.6 1.6 0 0 1 0 3.2z"
    />
  </Svg>
)

// ── bins & media ──
export const IcList = (p: P): JSX.Element => (
  <Svg {...p}>
    <rect x="2" y="3" width="12" height="1.8" rx=".5" />
    <rect x="2" y="7.1" width="12" height="1.8" rx=".5" />
    <rect x="2" y="11.2" width="12" height="1.8" rx=".5" />
  </Svg>
)

export const IcGrid = (p: P): JSX.Element => (
  <Svg {...p}>
    <rect x="2" y="2" width="5.4" height="5.4" rx=".8" />
    <rect x="8.6" y="2" width="5.4" height="5.4" rx=".8" />
    <rect x="2" y="8.6" width="5.4" height="5.4" rx=".8" />
    <rect x="8.6" y="8.6" width="5.4" height="5.4" rx=".8" />
  </Svg>
)

export const IcNote = (p: P): JSX.Element => (
  <Svg {...p}>
    <circle cx="5.7" cy="12" r="2.2" />
    <path d="M7 12V2.6l5.6 1.6v2.4L8.4 5.4V12z" />
  </Svg>
)

export const IcFilm = (p: P): JSX.Element => (
  <Svg {...p}>
    <path
      fillRule="evenodd"
      d="M1.5 2.5h13v11h-13zM3 4h1.6v1.6H3zm0 3.2h1.6v1.6H3zm0 3.2h1.6V12H3zm8.4-6.4H13v1.6h-1.6zm0 3.2H13v1.6h-1.6zm0 3.2H13V12h-1.6zM6 4.2h4v3.2H6zm0 4.4h4v3.2H6z"
    />
  </Svg>
)

export const IcImage = (p: P): JSX.Element => (
  <Svg {...p}>
    <rect x="1.8" y="2.8" width="12.4" height="10.4" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
    <circle cx="5.6" cy="6.3" r="1.3" />
    <path d="M3.4 12l3.4-3.8 2.2 2.3 1.9-2 2.7 3.5z" />
  </Svg>
)

// ── effect controls ──
export const IcStopwatch = (p: P): JSX.Element => (
  <Svg {...p} fill="none" stroke="currentColor">
    <circle cx="8" cy="9.2" r="4.9" strokeWidth="1.5" />
    <path d="M6.6 1.6h2.8M8 1.8v2M8 9.2l2.2-2.2" strokeWidth="1.5" strokeLinecap="round" />
  </Svg>
)

export const IcDiamond = (p: P): JSX.Element => (
  <Svg {...p}><path d="M8 2.2L13.8 8 8 13.8 2.2 8z" /></Svg>
)

export const IcChevL = (p: P): JSX.Element => (
  <Svg {...p}><path d="M10.6 2.6L5.2 8l5.4 5.4 1.3-1.3L7.8 8l4.1-4.1z" /></Svg>
)

export const IcChevR = (p: P): JSX.Element => (
  <Svg {...p}><path d="M5.4 2.6L10.8 8l-5.4 5.4-1.3-1.3L8.2 8 4.1 3.9z" /></Svg>
)

export const IcTransition = (p: P): JSX.Element => (
  <Svg {...p}>
    <rect x="1.6" y="3.4" width="12.8" height="9.2" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
    <path d="M2.4 12.2L13.6 3.8" stroke="currentColor" strokeWidth="1.3" />
  </Svg>
)

export const IcCC = (p: P): JSX.Element => (
  <Svg {...p}>
    <rect x="1.4" y="3" width="13.2" height="10" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
    <path
      d="M7.3 6.4a2.2 2.2 0 0 0-1.6-.7C4.6 5.7 3.8 6.7 3.8 8s.8 2.3 1.9 2.3c.6 0 1.2-.3 1.6-.7M12.4 6.4a2.2 2.2 0 0 0-1.6-.7c-1.1 0-1.9 1-1.9 2.3s.8 2.3 1.9 2.3c.6 0 1.2-.3 1.6-.7"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
  </Svg>
)

export const IcPlus = (p: P): JSX.Element => (
  <Svg {...p}><path d="M7.1 2.5h1.8v4.6h4.6v1.8H8.9v4.6H7.1V8.9H2.5V7.1h4.6z" /></Svg>
)

export const IcCheck = (p: P): JSX.Element => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path d="M4.8 8.2l2.2 2.2 4.2-4.6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
)

export const IcWarn = (p: P): JSX.Element => (
  <Svg {...p}>
    <path d="M8 1.6L15.2 14H.8z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    <path d="M7.2 6h1.6v4H7.2z" />
    <circle cx="8" cy="11.9" r=".95" />
  </Svg>
)

// circular reset arrow (Premiere "reset parameter")
export const IcReset = (p: P): JSX.Element => (
  <Svg {...p}>
    <path d="M8 3.2A4.8 4.8 0 1 0 12.5 9.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M8 .8l2.4 2.4L8 5.6z" />
  </Svg>
)

export const IcLink = (p: P): JSX.Element => (
  <Svg {...p} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M6.5 9.5a3 3 0 0 0 4.2.1l2-2a3 3 0 0 0-4.2-4.2L7.4 4.5" />
    <path d="M9.5 6.5a3 3 0 0 0-4.2-.1l-2 2a3 3 0 0 0 4.2 4.2l1.1-1.1" />
  </Svg>
)

export const IcText = (p: P): JSX.Element => (
  <Svg {...p}>
    <path d="M2.5 2.5h11v2.4h-1.3l-.4-1H8.9v8.1l1.4.4v1H5.7v-1l1.4-.4V3.9H4.2l-.4 1H2.5z" />
  </Svg>
)

export const IcAdjust = (p: P): JSX.Element => (
  <Svg {...p}>
    <path d="M3 4.5h10M3 8h10M3 11.5h10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <circle cx="6" cy="4.5" r="1.7" /><circle cx="11" cy="8" r="1.7" /><circle cx="5" cy="11.5" r="1.7" />
  </Svg>
)

export const IcVolume = (p: P): JSX.Element => (
  <Svg {...p}>
    <path d="M2.5 6.2h2.3L8 3.4v9.2L4.8 9.8H2.5z" />
    <path d="M10 5.8a3 3 0 0 1 0 4.4M11.7 4.2a5.3 5.3 0 0 1 0 7.6" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </Svg>
)

export const IcType = (p: P): JSX.Element => (
  <Svg {...p}>
    <path d="M3 3h10v2.6h-1.4V4.4H8.7v7.2h1.5V13H5.8v-1.4h1.5V4.4H4.4v1.2H3z" />
  </Svg>
)

/** Rolling Edit — two adjacent clips with a moveable boundary bar. */
export const IcRolling = (p: P): JSX.Element => (
  <Svg {...p}>
    <rect x="1.5" y="4" width="5.5" height="8" rx=".6" fill="none" stroke="currentColor" strokeWidth="1.4" />
    <rect x="9" y="4" width="5.5" height="8" rx=".6" fill="none" stroke="currentColor" strokeWidth="1.4" />
    <path d="M8 2v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M5.5 8h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeDasharray="1.5 1.5" />
  </Svg>
)

/** Slip — clip moves inside its handles; arrows point inward. */
export const IcSlip = (p: P): JSX.Element => (
  <Svg {...p}>
    <rect x="2" y="5" width="12" height="6" rx=".6" fill="none" stroke="currentColor" strokeWidth="1.4" />
    <path d="M6 8l-2.5-1.8v3.6zM10 8l2.5-1.8v3.6z" />
    <path d="M6.5 8h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </Svg>
)

/** Slide — clip moves; arrows point outward from both edges. */
export const IcSlide = (p: P): JSX.Element => (
  <Svg {...p}>
    <rect x="4.5" y="5" width="7" height="6" rx=".6" fill="none" stroke="currentColor" strokeWidth="1.4" />
    <path d="M4 8L1.5 6.2v3.6zM12 8l2.5-1.8v3.6z" />
    <path d="M2 8h1.5M12.5 8H14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </Svg>
)
