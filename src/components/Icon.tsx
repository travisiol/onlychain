import type { SVGProps } from "react";

/**
 * The icon set, hand-drawn on a 24-grid with a 2px stroke so every glyph
 * has the same weight. Names are the vocabulary of the shell.
 */
const PATHS: Record<string, string> = {
  home: "M3 11.5 12 4l9 7.5M5 10v10h5v-6h4v6h5V10",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16ZM10 20a2 2 0 0 0 4 0",
  message: "M4 5h16v11H9l-5 4V5Z",
  bookmark: "M6 4h12v17l-6-4-6 4V4Z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0",
  compass: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm3.5-12.5-2 5-5 2 2-5 5-2Z",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  wallet: "M3 7h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Zm0 0a2 2 0 0 1 2-2h11v2M16 13h2",
  studio: "M4 20V10m6 10V4m6 16v-7m4 7H3",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.2-1.6l2-1.5-2-3.4-2.3 1a7.5 7.5 0 0 0-2.8-1.6L13.7 2h-3.4l-.4 2.9a7.5 7.5 0 0 0-2.8 1.6l-2.3-1-2 3.4 2 1.5A7.4 7.4 0 0 0 4.6 12c0 .5.1 1.1.2 1.6l-2 1.5 2 3.4 2.3-1a7.5 7.5 0 0 0 2.8 1.6l.4 2.9h3.4l.4-2.9a7.5 7.5 0 0 0 2.8-1.6l2.3 1 2-3.4-2-1.5c.1-.5.2-1.1.2-1.6Z",
  heart: "M12 20s-7-4.4-7-9.5A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7 2.5C19 15.6 12 20 12 20Z",
  comment: "M20 12a8 8 0 0 1-11.5 7.2L4 20l1-4A8 8 0 1 1 20 12Z",
  coin: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm2.5-11.5c0-1.4-1.1-2-2.5-2s-2.5.6-2.5 1.8c0 2.6 5 1.4 5 4.2 0 1.2-1.1 2-2.5 2s-2.5-.7-2.5-2M12 6v1.5M12 16.5V18",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5V11Zm7 4v3",
  unlock: "M7 11V8a5 5 0 0 1 9.6-2M5 11h14v10H5V11Zm7 4v3",
  image: "M4 5h16v14H4V5Zm4 5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm-4 6 5-5 4 4 3-3 4 4",
  send: "M21 3 10 14M21 3l-7 18-4-7-7-4 18-7Z",
  plus: "M12 5v14M5 12h14",
  x: "M6 6l12 12M18 6 6 18",
  check: "M5 12.5 10 17.5 19 7",
  verified: "M12 2l2.4 2.1 3.1-.4 1 3 2.9 1.3-.6 3.1 1.8 2.6-2.3 2.2.2 3.2-3.1.6-1.6 2.8-3-1.2-3 1.2-1.6-2.8-3.1-.6.2-3.2L2.9 13l1.8-2.6-.6-3.1L7 6l1-3 3.1.4L12 2Zm-3 10.5 2.2 2.2L15.5 10",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5-2 4 4",
  back: "M15 5l-7 7 7 7",
  chevron: "M9 5l7 7-7 7",
  spinner: "M12 3a9 9 0 1 0 9 9",
  external: "M14 4h6v6m0-6-9 9M19 14v5H5V5h5",
  copy: "M9 9h11v11H9V9Zm-5 6V4h11",
  logout: "M15 17l5-5-5-5m5 5H9M13 21H5V3h8",
  trash: "M5 7h14M9 7V4h6v3m-7 0 1 13h6l1-13",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  users: "M16 20a4 4 0 0 0-8 0m8 0h4a4 4 0 0 0-3-3.9M8 20H4a4 4 0 0 1 3-3.9M12 13a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm6-1a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM6 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  star: "M12 3l2.8 5.8 6.2.9-4.5 4.4 1.1 6.3L12 17.4l-5.6 3 1.1-6.3L3 9.7l6.2-.9L12 3Z",
  gift: "M4 11h16v10H4V11Zm-1-4h18v4H3V7Zm9 0v14m0-14c-2-2.5-5-3-5-1s3 1.5 5 1c2 .5 5 1 5-1s-3-1.5-5 1Z",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-9v5m0-8v.5",
  warn: "M12 3 2 21h20L12 3Zm0 7v5m0 3v.5",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  shield: "M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6l8-3Z",
  video: "M3 7h12v10H3V7Zm12 3 6-3v10l-6-3",
  menu: "M4 7h16M4 12h16M4 17h16",
  fire: "M12 22c4 0 7-3 7-7 0-3-2-5-3-6 0 2-1 3-2 3 0-3-1-6-4-8 0 3-1 4-2 6-1 1-3 3-3 6 0 4 3 6 7 6Z",
  filter: "M4 5h16l-6 8v6l-4-2v-4L4 5Z",
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22, className, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  const d = PATHS[name];
  const filled = name === "heart" && className?.includes("is-filled");
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={name === "more" ? 3 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      <path d={d} />
    </svg>
  );
}
