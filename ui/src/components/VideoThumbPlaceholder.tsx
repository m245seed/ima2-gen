type VideoThumbPlaceholderProps = {
  className?: string;
};

export function VideoThumbPlaceholder({ className }: VideoThumbPlaceholderProps) {
  return (
    <span
      className={["video-thumb-placeholder", className].filter(Boolean).join(" ")}
      aria-hidden="true"
    />
  );
}
