/** Same chevron as the Reports menu: points down when closed, up when open. */
export default function AccordionChevron({ open }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-4 w-4 shrink-0 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
      aria-hidden
    >
      <path d="M5 8l5 5 5-5" />
    </svg>
  );
}
