import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

export function IconChat(props: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M2.5 2.5h11a1 1 0 011 1v7a1 1 0 01-1 1H5l-2.5 2V3.5a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="5.5" cy="7" r="0.75" fill="currentColor"/>
      <circle cx="8" cy="7" r="0.75" fill="currentColor"/>
      <circle cx="10.5" cy="7" r="0.75" fill="currentColor"/>
    </svg>
  )
}

export function IconSearch(props: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <circle cx="7" cy="7" r="4.25" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M10.25 10.25L13.5 13.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
}

export function IconAgent(props: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="3" y="2.5" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <circle cx="6" cy="6.5" r="1" fill="currentColor"/>
      <circle cx="10" cy="6.5" r="1" fill="currentColor"/>
      <path d="M5 13l1.5-2.5h3L11 13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export function IconFolder(props: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M2 4.5a1 1 0 011-1h3.17a1 1 0 01.78.37L8 5.25h5a1 1 0 011 1v5.25a1 1 0 01-1 1H3a1 1 0 01-1-1V4.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    </svg>
  )
}

export function IconTool(props: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M9.8 3.2a3.2 3.2 0 00-4.1 4.1L3 10l-.5.5v2h2L5 12l1.7-1.7a3.2 3.2 0 004.1-4.1L9 8 8 7l1.8-1.8z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export function IconSettings(props: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M8 1.5v1.25M8 13.25V14.5M1.5 8h1.25M13.25 8H14.5M3.4 3.4l.88.88M11.72 11.72l.88.88M3.4 12.6l.88-.88M11.72 4.28l.88-.88" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
}

export function IconSend(props: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M8 13V3M8 3L4 7M8 3l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export function IconSuggestionCode(props: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M5.5 4.5L2.5 8l3 3.5M10.5 4.5l3 3.5-3 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M9 2.5L7 13.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
}

export function IconSuggestionExplore(props: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M9.5 6.5l-1 3-3 1 1-3 3-1z" fill="currentColor"/>
    </svg>
  )
}

export function IconSuggestionDebug(props: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="5" y="5" width="6" height="7" rx="3" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M3 7.5h2M11 7.5h2M3.5 10.5H5M11 10.5h1.5M6 5V3.5a2 2 0 014 0V5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
}

export function IconSuggestionGenerate(props: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3M3.8 3.8l2.1 2.1M10.1 10.1l2.1 2.1M3.8 12.2l2.1-2.1M10.1 5.9l2.1-2.1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
}

export function IconChevronRight(props: IconProps) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M4.5 2.5L7.5 6L4.5 9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export function IconChevronDown(props: IconProps) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M2.5 4.5L6 7.5L9.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export function IconCheck(props: IconProps) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M3 7.5L5.5 10L11 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export function IconCross(props: IconProps) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M3.5 3.5L10.5 10.5M10.5 3.5L3.5 10.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  )
}

export function IconPlus(props: IconProps) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M7 2.75v8.5M2.75 7h8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}
