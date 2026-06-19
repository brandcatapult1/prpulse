export function Card({ children, className = '' }) {
  return <div className={`rounded-lg border border-surface-border bg-white ${className}`}>{children}</div>;
}

export function EmptyState({ title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-surface-border bg-white px-6 py-16 text-center">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = 'h-4 w-full' }) {
  return <div className={`animate-pulse rounded bg-slate-200 ${className}`} />;
}

export function Toast({ message, tone = 'info', onClose }) {
  const colors = tone === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-slate-200 bg-white text-slate-800';
  return (
    <div className={`fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border px-4 py-3 text-sm shadow-sm ${colors}`}>
      <div className="flex items-start justify-between gap-3">
        <span>{message}</span>
        {onClose && (
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ×
          </button>
        )}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, body, confirmLabel = 'Confirm', onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-lg border border-surface-border bg-white p-5">
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="mt-2 text-sm text-slate-600">{body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn-primary" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

export function Modal({ open, title, children, onClose, footer }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-lg rounded-lg border border-surface-border bg-white">
        <div className="flex items-center justify-between border-b border-surface-border px-5 py-4">
          <h3 className="text-base font-semibold">{title}</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">×</button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="border-t border-surface-border px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer({ open, title, children, footer, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/30">
      <div className="flex h-full w-full max-w-xl flex-col border-l border-surface-border bg-white shadow-none">
        <div className="flex items-center justify-between border-b border-surface-border px-5 py-4">
          <h3 className="text-base font-semibold">{title}</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-surface-border px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}
