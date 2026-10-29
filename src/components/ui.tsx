'use client';

import Link from 'next/link';
import { ArrowLeft, LoaderCircle, X, Inbox } from 'lucide-react';
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';
import { STATUS_LABELS, type OpinionStatus } from '../lib/contracts';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
export function Button({ variant = 'primary', loading, children, className = '', disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return <button className={`button button-${variant} ${className}`} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>{loading && <LoaderCircle size={18} className="spinner" aria-hidden="true" />}{children}</button>;
}
export function ButtonLink({ href, variant = 'primary', children, className = '' }: { href: string; variant?: Variant; children: ReactNode; className?: string }) { return <Link className={`button button-${variant} ${className}`} href={href}>{children}</Link>; }
export function Field({ label, htmlFor, hint, error, required, children }: { label: string; htmlFor: string; hint?: ReactNode; error?: string; required?: boolean; children: ReactNode }) {
  return <div className="field"><label className="field-label" htmlFor={htmlFor}>{label}{required && <span className="required-mark"> (필수)</span>}</label>{children}{hint && <div id={`${htmlFor}-hint`} className="field-hint">{hint}</div>}{error && <p className="field-error" id={`${htmlFor}-error`} role="alert">{error}</p>}</div>;
}
export function Notice({ variant = 'info', title, children }: { variant?: 'info' | 'error' | 'success'; title?: string; children: ReactNode }) { return <div className={`notice notice-${variant}`} role={variant === 'error' ? 'alert' : 'status'}>{title && <strong>{title}</strong>}{children}</div>; }
export const Alert = Notice;
export function EmptyState({ title, description, icon, action }: { title: string; description?: string; icon?: ReactNode; action?: ReactNode }) { return <div className="empty-state"><div className="empty-icon" aria-hidden="true">{icon ?? <Inbox size={30} />}</div><h2>{title}</h2>{description && <p>{description}</p>}{action && <div className="empty-action">{action}</div>}</div>; }
export function PageHeading({ eyebrow, title, description, actions, back }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode; back?: { href: string; label: string } }) { return <header className="page-heading">{back && <Link className="back-link" href={back.href}><ArrowLeft size={16} aria-hidden="true" />{back.label}</Link>}<div className="heading-row"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1 tabIndex={-1}>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{actions && <div className="heading-actions">{actions}</div>}</div></header>; }
export function StatusBadge({ status }: { status: string }) { return <span className={`status-badge status-${status}`}>{STATUS_LABELS[status as OpinionStatus] ?? status}</span>; }
export function Panel({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) { return <div className={`panel ${className}`} {...props} />; }
export const Card = Panel;
export function Skeleton({ rows = 3, className = '' }: { rows?: number; className?: string }) { return <div className={`skeleton-stack ${className}`} aria-hidden="true">{Array.from({ length: rows }, (_, i) => <div className="skeleton-row" key={i}><span /><span /></div>)}</div>; }
export function Modal({ open, onClose, title, description, children, footer }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const closing = useRef(false);
  const titleId = useId(); const descriptionId = useId();
  useEffect(() => {
    const dialog = ref.current; if (!dialog) return;
    closing.current = false; dialog.style.pointerEvents = '';
    if (open && !dialog.open) { returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; dialog.showModal(); }
    if (!open && dialog.open) {
      const finish = () => { closing.current = false; dialog.style.pointerEvents = ''; dialog.close(); if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true }); };
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { finish(); return; }
      closing.current = true; dialog.style.pointerEvents = 'none';
      const animation = dialog.animate([{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(8px)' }], { duration: 200, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
      animation.onfinish = finish;
      return () => { animation.onfinish = null; animation.cancel(); closing.current = false; dialog.style.pointerEvents = ''; };
    }
  }, [open]);
  return <dialog ref={ref} className="modal" tabIndex={-1} aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} onKeyDown={(e) => {
    if (closing.current) { e.preventDefault(); return; }
    if (e.key !== 'Tab') return;
    const targets = [...e.currentTarget.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input:not(:disabled):not([type=hidden]),textarea:not(:disabled),select:not(:disabled),[tabindex]:not([tabindex="-1"])')].filter(el => el.getClientRects().length > 0);
    const first = targets[0], last = targets.at(-1);
    if (!first) { e.preventDefault(); e.currentTarget.focus(); return; }
    if (e.shiftKey && (document.activeElement === first || document.activeElement === e.currentTarget)) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || document.activeElement === e.currentTarget)) { e.preventDefault(); first.focus(); }
  }} onCancel={(e) => { e.preventDefault(); onClose(); }} onClick={(e) => { if (e.target === ref.current) { const rect = ref.current.getBoundingClientRect(); if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) onClose(); } }}><div className="modal-head"><h2 id={titleId}>{title}</h2><Button variant="ghost" aria-label="닫기" onClick={onClose}><X size={20} aria-hidden="true" /></Button></div>{description && <p id={descriptionId} className="muted">{description}</p>}<div className="modal-body">{children}</div>{footer && <div className="modal-footer">{footer}</div>}</dialog>;
}
