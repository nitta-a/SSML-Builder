export type StudioIconName =
  | "wave"
  | "file"
  | "plus"
  | "import"
  | "download"
  | "copy"
  | "play"
  | "stop"
  | "check"
  | "sun"
  | "moon"
  | "code"
  | "speaker"
  | "video"
  | "book"
  | "close"
  | "arrow";

const ICON_PATHS: Readonly<Record<StudioIconName, string>> = {
  wave: "M4 10v4m4-7v10m4-14v18m4-14v10m4-7v4",
  file: "M14 2H5v20h14V7l-5-5Zm0 0v5h5M8 12h8M8 16h6",
  plus: "M12 5v14M5 12h14",
  import: "M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5",
  download: "M12 3v12m-5-5 5 5 5-5M4 20h16",
  copy: "M8 8h13v13H8V8ZM16 8V3H3v13h5",
  play: "m8 4 12 8-12 8V4Z",
  stop: "M6 6h12v12H6V6Z",
  check: "m5 12 4 4L19 6",
  sun: "M12 3V1m0 22v-2M3 12H1m22 0h-2M5.6 5.6 4.2 4.2m15.6 15.6-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  moon: "M21 13a9 9 0 0 1-10-10 9 9 0 1 0 10 10Z",
  code: "m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18",
  speaker: "M11 4 5 9H2v6h3l6 5V4Zm4 4a5 5 0 0 1 0 8m3-11a9 9 0 0 1 0 14",
  video: "M3 4h18v16H3V4Zm0 5h18M8 4l4 5m2-5 4 5",
  book: "M12 5C9 3 5 3 2 4v16c3-1 7-1 10 1m0-16c3-2 7-2 10-1v16c-3-1-7-1-10 1V5Z",
  close: "m6 6 12 12M6 18 18 6",
  arrow: "M4 12h16m-6-6 6 6-6 6",
};

interface StudioIconProps {
  name: StudioIconName;
  className?: string;
}

export function StudioIcon({ name, className }: StudioIconProps) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}
