import { useEffect, useRef } from 'react';

type Variant = 'danger' | 'warning' | 'info' | 'success';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: Variant;
  icon?: string;
  items?: string[];
  isPending?: boolean;
  /** If true, shows the "cannot be undone" warning footer */
  irreversible?: boolean;
}

const variantStyles: Record<Variant, { border: string; iconBg: string; confirmBtn: string; badge: string }> = {
  danger:  { border: 'border-red-500/30',    iconBg: 'bg-red-500/10',    confirmBtn: 'bg-red-600 hover:bg-red-500 text-white',           badge: 'bg-red-500/10 border-red-500/30 text-red-400' },
  warning: { border: 'border-yellow-500/30', iconBg: 'bg-yellow-500/10', confirmBtn: 'bg-yellow-500 hover:bg-yellow-400 text-black font-semibold', badge: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400' },
  info:    { border: 'border-brand-500/30',  iconBg: 'bg-brand-500/10',  confirmBtn: 'bg-brand-600 hover:bg-brand-500 text-white',        badge: 'bg-brand-500/10 border-brand-500/30 text-brand-400' },
  success: { border: 'border-green-500/30',  iconBg: 'bg-green-500/10',  confirmBtn: 'bg-green-600 hover:bg-green-500 text-white',        badge: 'bg-green-500/10 border-green-500/30 text-green-400' },
};

const defaultIcons: Record<Variant, string> = {
  danger:  '🗑️',
  warning: '⚠️',
  info:    'ℹ️',
  success: '✅',
};

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  icon,
  items = [],
  isPending = false,
  irreversible = true,
}: ConfirmDialogProps) {
  const styles = variantStyles[variant];
  const displayIcon = icon ?? defaultIcons[variant];
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Focus cancel button when opened (safer default)
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => cancelRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className={`relative bg-surface-800 border ${styles.border} rounded-2xl shadow-2xl max-w-md w-full overflow-hidden`}
        style={{ animation: 'dialogIn 0.18s cubic-bezier(0.175,0.885,0.32,1.275)' }}
      >
        {/* Coloured top stripe */}
        <div className={`h-1 w-full ${variant === 'danger' ? 'bg-red-500' : variant === 'warning' ? 'bg-yellow-500' : variant === 'success' ? 'bg-green-500' : 'bg-brand-500'}`} />

        <div className="p-6 space-y-5">
          {/* Icon + heading */}
          <div className="flex items-start gap-4">
            <div className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${styles.iconBg} border ${styles.border}`}>
              {displayIcon}
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <h3 id="confirm-dialog-title" className="text-lg font-bold text-gray-100 leading-snug">
                {title}
              </h3>
              <p className="text-sm text-gray-400 mt-1 leading-relaxed">{message}</p>
            </div>
          </div>

          {/* Optional bullet list */}
          {items.length > 0 && (
            <ul className="rounded-xl bg-surface-700/60 border border-gray-700/50 divide-y divide-gray-700/30 overflow-hidden">
              {items.map((item, i) => (
                <li key={i} className="flex items-start gap-3 px-4 py-2.5 text-sm text-gray-300">
                  <span className="mt-0.5 text-gray-500 shrink-0">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Irreversible warning */}
          {irreversible && (
            <div className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 ${styles.badge}`}>
              <span className="text-base shrink-0">⚠️</span>
              <p className="text-xs font-medium">This action cannot be undone.</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              ref={cancelRef}
              onClick={onClose}
              disabled={isPending}
              className="flex-1 px-4 py-2.5 rounded-xl bg-surface-700 hover:bg-surface-600 text-gray-300 font-medium transition-colors text-sm disabled:opacity-50"
            >
              {cancelText}
            </button>
            <button
              onClick={() => { onConfirm(); onClose(); }}
              disabled={isPending}
              className={`flex-1 px-4 py-2.5 rounded-xl font-medium transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-50 ${styles.confirmBtn}`}
            >
              {isPending && (
                <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
              )}
              {confirmText}
            </button>
          </div>
        </div>
      </div>

      {/* Keyframe animation injected inline */}
      <style>{`
        @keyframes dialogIn {
          from { opacity: 0; transform: scale(0.92) translateY(8px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);   }
        }
      `}</style>
    </div>
  );
}
