/**
 * Interface icons as one table of 24×24 stroke paths. Controls and displays
 * take an `icon` name; nothing else draws its own glyphs.
 */
const PATHS = {
  gear: "M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1",
  pause: "M8.5 5v14M15.5 5v14",
  back: "M15 5l-7 7 7 7",
  next: "M9 5l7 7-7 7",
  close: "M6 6l12 12M18 6L6 18",
  copy: "M9 9h10v10H9zM5 15V5h10",
  check: "M5 12.5l4.5 4.5L19 7.5",
  crown: "M4 18h16M5 15l-1.5-8 5 4L12 5l3.5 6 5-4L19 15z",
  star: "M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z",
  play: "M8 5.5v13l10.5-6.5z",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.5a3.3 3.3 0 0 1 0 6.3M18 14.8c2 .7 3.2 2.5 3.5 5.2",
  swap: "M7 4L3.5 7.5 7 11M3.5 7.5h14M17 13l3.5 3.5L17 20M20.5 16.5h-14",
  shuffle: "M3.5 7h3.5c4.5 0 5.5 10 10 10h3.5M17.5 14l3 3-3 3M3.5 17h3.5c1.6 0 2.7-1.3 3.6-3M13.4 10c.9-1.7 2-3 3.6-3h3.5M17.5 4l3 3-3 3",
  chart: "M5 20V11M12 20V5M19 20v-7",
  warning: "M12 3.5L2.5 20h19zM12 10v4.5M12 17.2v.3",
  ball: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM3.5 9.5c5 1.5 12 1.5 17 0M3.5 14.5c5-1.5 12-1.5 17 0",
  lock: "M6 11h12v9.5H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  refresh: "M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4v4.5H15",
  leave: "M14 4.5h5.5v15H14M10 8l-4 4 4 4M6 12h10",
  bolt: "M13.5 2.5L5 13.5h6l-1.5 8L18 10.5h-6z",
  heart: "M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.6 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z",
  edit: "M4 20l1-4.5L15.5 5l3.5 3.5L8.5 19zM13 7.5L16.5 11",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  move: "M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3",
  aim: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM12 1.5V7M12 17v5.5M1.5 12H7M17 12h5.5",
  eye: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12ZM12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6Z",
  dot: "M12 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z",
  timer: "M12 7.5v5l3 2M9.5 2.5h5M12 21a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17Z",
  expand: "M9 4H4v5M15 4h5v5M20 15v5h-5M4 15v5h5",
  hook: "M15 2.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM15 5.5V15a5 5 0 0 1-10 0v-3.5l3 2.5",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      className={className ? `ui-icon ${className}` : "ui-icon"}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
