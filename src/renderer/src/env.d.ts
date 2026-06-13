/// <reference types="vite/client" />
import type { SwiftApi } from '../../preload'
import type { JSX as ReactJSX } from 'react'

declare global {
  interface Window {
    swift: SwiftApi
  }

  // React 19 relocated the global JSX namespace under React.JSX.
  // Re-expose it globally so `JSX.Element` keeps resolving.
  namespace JSX {
    type Element = ReactJSX.Element
    type ElementClass = ReactJSX.ElementClass
    type IntrinsicElements = ReactJSX.IntrinsicElements
  }
}

export {}
