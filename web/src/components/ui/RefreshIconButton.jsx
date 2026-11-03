export default function RefreshIconButton({ busy = false, disabled = false, onClick, label = 'Refresh metrics', title }) {
  const text = title ?? label;
  return (
    <button
      type="button"
      className="btn-secondary !px-2"
      disabled={busy || disabled}
      onClick={onClick}
      title={text}
      aria-label={text}
    >
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={busy ? 'animate-spin' : ''}
        aria-hidden="true"
      >
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <path d="M21 3v6h-6" />
      </svg>
      <span className="sr-only">{text}</span>
    </button>
  );
}
