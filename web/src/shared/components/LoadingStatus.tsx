export function LoadingStatus({
  loading,
  text = "Loading new range...",
  className = "",
}: {
  loading: boolean;
  text?: string;
  className?: string;
}) {
  if (!loading) return null;
  return <span className={`text-xs text-sky-300 tabular-nums ${className}`.trim()}>{text}</span>;
}
