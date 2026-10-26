'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { useTranslation } from '@/context/TranslationContext';
import styles from './Feedback.module.css';

// App-wide toasts and confirm dialogs (instead of the browser's alert/confirm).
// Call toast() / confirmDialog() from anywhere; <FeedbackHost /> (in the root layout) renders them.

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem { id: number; message: string; kind: ToastKind }

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}
interface ConfirmRequest extends ConfirmOptions { resolve: (ok: boolean) => void }

const TOAST_EVENT = 'app:toast';
const CONFIRM_EVENT = 'app:confirm';

export function toast(message: string, kind: ToastKind = 'info') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { message, kind } }));
}

/** Resolves true when the person confirms. Falls back to window.confirm if no host is mounted. */
export function confirmDialog(options: ConfirmOptions | string): Promise<boolean> {
  const opts = typeof options === 'string' ? { message: options } : options;
  if (typeof window === 'undefined') return Promise.resolve(false);
  return new Promise((resolve) => {
    const handled = !window.dispatchEvent(new CustomEvent(CONFIRM_EVENT, { detail: { ...opts, resolve }, cancelable: true }));
    if (!handled) resolve(window.confirm(opts.message));
  });
}

export const FeedbackHost: React.FC = () => {
  const { t } = useTranslation();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let nextId = 1;
    const onToast = (e: Event) => {
      const { message, kind } = (e as CustomEvent).detail as { message: string; kind: ToastKind };
      const id = nextId++;
      setToasts((list) => [...list.slice(-2), { id, message, kind }]);
      setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), kind === 'error' ? 6000 : 3500);
    };
    const onConfirm = (e: Event) => {
      e.preventDefault(); // tells confirmDialog() a host is handling it
      setRequest((e as CustomEvent).detail as ConfirmRequest);
    };
    window.addEventListener(TOAST_EVENT, onToast);
    window.addEventListener(CONFIRM_EVENT, onConfirm);
    return () => {
      window.removeEventListener(TOAST_EVENT, onToast);
      window.removeEventListener(CONFIRM_EVENT, onConfirm);
    };
  }, []);

  useEffect(() => {
    if (!request) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') answer(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  const answer = (ok: boolean) => {
    request?.resolve(ok);
    setRequest(null);
  };

  return (
    <>
      <div className={styles.toasts} aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`${styles.toast} ${styles[t.kind]}`} role={t.kind === 'error' ? 'alert' : 'status'}>
            <Icon name={t.kind === 'success' ? 'check' : t.kind === 'error' ? 'alert' : 'info'} size={16} />
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      {request && (
        <div className={styles.overlay} onClick={() => answer(false)}>
          <div
            className={styles.dialog}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="confirm-title" className={styles.title}>{request.title || request.message}</h2>
            {request.title && <p className={styles.message}>{request.message}</p>}
            <div className="btn-row">
              <button type="button" className="btn" onClick={() => answer(false)}>
                {request.cancelLabel || t('feedback.cancel')}
              </button>
              <button
                ref={confirmRef}
                type="button"
                className={`btn ${request.danger ? styles.dangerBtn : 'btn-primary'}`}
                onClick={() => answer(true)}
              >
                {request.confirmLabel || t('feedback.ok')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
