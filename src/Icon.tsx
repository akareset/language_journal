import type { CSSProperties } from 'react';

const paths = {
  feather: 'M20 4c-4-4-12 3-12 9v3h3c6 0 13-8 9-12ZM4 20 15 9M8 13h5',
  home: 'm3 10 9-7 9 7M5 9v11h5v-6h4v6h5V9',
  calendar: 'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2ZM7 14h2m6 0h2m-10 3h2',
  book: 'M12 5v16M3 4h5a4 4 0 0 1 4 2 4 4 0 0 1 4-2h5v15h-5a4 4 0 0 0-4 2 4 4 0 0 0-4-2H3Z',
  chart: 'M4 13h3v7H4Zm6-8h3v15h-3Zm6 4h3v11h-3Z',
  sparkles: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4m-2-2h4',
  tag: 'M3 3h8l10 10-8 8L3 11ZM7 7h.01',
  settings: 'm10 3 4 0 1 3 3 1 3 3-2 2 0 3-3 2-1 4h-4l-1-3-3-1-3-3 2-2V9l3-2ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  search: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 6 6',
  chevron: 'm9 5 7 7-7 7',
  edit: 'm14 5 5 5M4 20l5-1L21 7l-5-5L4 14Z',
  clock: 'M9 2h6m-3 4v3m0 3v4l3 2M12 6a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z',
  flame: 'M13 2c1 5-4 6-4 10-2-1-2-3-2-3s-3 3-3 6a8 8 0 0 0 16 0c0-5-4-8-7-13ZM12 13c0 3-3 3-3 5a3 3 0 0 0 6 0c0-2-1-3-3-5Z',
  check: 'm5 12 4 4L19 6',
  plus: 'M12 5v14M5 12h14',
  close: 'm6 6 12 12M6 18 18 6',
  lock: 'M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5Zm7 4v3',
  bold: 'M6 4h7a4 4 0 0 1 0 8H6Zm0 8h8a4 4 0 0 1 0 8H6Z',
  italic: 'M10 4h9M5 20h9M15 4 9 20',
  underline: 'M6 3v8a6 6 0 0 0 12 0V3M4 21h16',
  list: 'M9 6h12M9 12h12M9 18h12M3 6h1m-1 6h1m-1 6h1',
  numbered: 'M10 6h11M10 12h11M10 18h11M3 4h1v4M2 12c0-3 4-3 4 0l-4 4h4m-4 3h3l-2 2h2',
  quote: 'M4 6h6v7H4Zm0 7c0 4 2 5 4 5M14 6h6v7h-6Zm0 7c0 4 2 5 4 5',
  undo: 'M8 4 3 9l5 5M3 9h11a6 6 0 0 1 0 12',
  redo: 'm16 4 5 5-5 5m5-5H10a6 6 0 0 0 0 12',
} as const;
export type IconName = keyof typeof paths;
export function Icon({ name, size = 19, style }: { name: IconName; size?: number; style?: CSSProperties }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" style={style}><path d={paths[name]} /></svg>;
}
