'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api, ApiError, useSession } from '../../lib/client';
import type { OpinionEvent } from '../../lib/contracts';
import { Button, ButtonLink, EmptyState, Notice } from '../ui';
import styles from './operations.module.css';

export function formatDate(value: string | null | undefined) {
  if (!value) return '미입력';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul' }).format(date);
}

export function useResource<T>(url: string) {
  const { user } = useSession();
  const scope = user ? `${user.id}:${user.role}` : 'anonymous';
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ url: string; scope: string; revision: number; data: T | null; error: Error | null } | null>(null);
  const reload = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    void api<T>(url, { signal: controller.signal }).then(result => {
      if (current) setResult({ url, scope, revision, data: result, error: null });
    }).catch((reason: unknown) => {
      if (current && !controller.signal.aborted) setResult({ url, scope, revision, data: null, error: reason instanceof Error ? reason : new Error('내용을 불러오지 못했어요.') });
    });
    return () => { current = false; controller.abort(); };
  }, [url, scope, revision]);
  const current = result?.url === url && result.scope === scope && result.revision === revision;
  const setData = (data: T) => setResult({ url, scope, revision, data, error: null });
  const deny = (error: Error) => setResult({ url, scope, revision, data: null, error });
  return { data: current ? result.data : null, previousData: result?.scope === scope ? result.data : null, setData, deny, loading: !current, error: current ? result.error : null, reload };
}

export function ReadError({ error, retry, back = '/operator' }: { error: Error; retry: () => void; back?: string }) {
  const status = error instanceof ApiError ? error.status : 0;
  const next = typeof window === 'undefined' ? back : `${window.location.pathname}${window.location.search}`;
  if (status === 401) return <EmptyState title="로그인이 필요해요" description="이 계정에 연결된 내용은 로그인 후 확인할 수 있어요." action={<ButtonLink href={`/login?next=${encodeURIComponent(next)}`}>로그인하기</ButtonLink>} />;
  if (status === 403 || status === 404) return <EmptyState title="이 내용을 열 수 없어요" description="계정에 연결되지 않았거나 더 이상 확인할 수 없는 내용이에요. 담당 범위를 확인해 주세요." action={<ButtonLink href={back} variant="secondary">목록으로 돌아가기</ButtonLink>} />;
  return <Notice variant="error" title="내용을 불러오지 못했어요"><p>연결 상태를 확인한 뒤 다시 시도해 주세요.</p><Button type="button" onClick={retry} variant="secondary">다시 불러오기</Button></Notice>;
}

export function MutationError({ error, reload }: { error: Error | null; reload?: () => void }) {
  if (!error) return null;
  const status = error instanceof ApiError ? error.status : 0;
  if (status === 409) return <Notice variant="error" title="다른 변경이 먼저 저장됐어요"><p>입력한 내용은 그대로 있어요. 최신 기록을 불러오고 내용을 확인한 뒤 다시 저장해 주세요.</p>{reload && <Button type="button" variant="secondary" onClick={reload}>최신 기록 확인하기</Button>}</Notice>;
  if (status === 401) return <Notice variant="error" title="로그인 시간이 만료됐어요"><p>작성한 내용은 이 화면에 남아 있어요. 새 탭에서 로그인한 뒤 다시 저장해 주세요.</p><a href={`/login?next=${encodeURIComponent(typeof window === 'undefined' ? '/' : window.location.pathname)}`} target="_blank" rel="noopener noreferrer">새 탭에서 로그인</a></Notice>;
  if (status === 403 || status === 404) return <Notice variant="error" title="지금은 저장할 수 없어요">계정에 연결된 권한이 변경됐거나 대상 기록에 접근할 수 없어요. 입력 내용은 유지했어요.</Notice>;
  if (status === 0 || status >= 500) return <Notice variant="error" title="저장 결과를 확인하지 못했어요">연결이 끊겼거나 서버 응답을 받지 못했어요. 같은 내용으로 다시 시도하면 중복 방지 번호로 기존 저장 결과를 확인해요. 확인 전에는 내용을 변경하지 말아 주세요.</Notice>;
  return <Notice variant="error" title="저장하지 못했어요">{error.message}</Notice>;
}

const EVENT_NAMES: Record<string, string> = {
  received: '틈길에 접수', submitted: '틈길에 접수', note: '내부 확인 기록', question: '추가 질문', response: '시민 답변', 'citizen-response': '시민 답변', status: '상태 변경', 'status-reason': '상태 변경 근거', transmit: '상인에게 전달', transmission: '상인에게 전달', 'merchant-reply': '상인 답변', publish: '시민용 내용 게시', 'followup-plan': '후속 확인 예정', 'followup-result': '후속 확인 기록', 'official-guidance': '공식 신고 창구 안내',
};

export function Timeline({ events, empty = '아직 기록이 없어요.' }: { events: OpinionEvent[]; empty?: string }) {
  const [initialIds] = useState(() => new Set(events.map(event => event.id)));
  if (!events.length) return <p className={styles.emptyText}>{empty}</p>;
  return <ol className={styles.timeline} aria-live="polite" aria-relevant="additions">{[...events].reverse().map(event => <li key={event.id} className={initialIds.has(event.id) ? undefined : styles.newEvent}>
    <p className={styles.timelineTitle}>{EVENT_NAMES[event.kind] ?? '처리 기록'}{event.correctsId ? ' · 정정' : ''}</p>
    <div className={styles.meta}><time dateTime={event.createdAt}>{formatDate(event.createdAt)}</time>{event.actorName && <span>{event.actorName}</span>}</div>
    <p className={styles.eventBody}>{event.content}</p>
    {event.assignee && <p className={styles.subtle}>담당: {event.assignee}</p>}
    {event.scheduledAt && <p className={styles.subtle}>예정 시각: {formatDate(event.scheduledAt)}</p>}
    {event.occurredAt && <p className={styles.subtle}>실제 확인 시각: {formatDate(event.occurredAt)}</p>}
  </li>)}</ol>;
}

/** Retains the same request ID after an ambiguous failure, including retries. */
export function useRequestKey() {
  const { user } = useSession();
  const saved = useRef<{ signature: string; id: string; storageKey: string } | null>(null);
  const get = async (payload: unknown) => {
    const signature = JSON.stringify(payload);
    if (!saved.current || saved.current.signature !== signature) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(signature));
      if (saved.current?.signature === signature) return saved.current.id;
      const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      const storageKey = `teumgil:request:${user?.id ?? 'anonymous'}:${location.pathname}:${hash}`;
      let id = crypto.randomUUID();
      try { id = sessionStorage.getItem(storageKey) || id; sessionStorage.setItem(storageKey, id); } catch { /* This tab still retains the ID when browser storage is unavailable. */ }
      saved.current = { signature, id, storageKey };
    }
    return saved.current.id;
  };
  const clear = () => { if (saved.current) { try { sessionStorage.removeItem(saved.current.storageKey); } catch { /* Nothing was persisted. */ } } saved.current = null; };
  return { get, clear };
}

export function useUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    const beforeLink = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement).closest('a');
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download') || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const url = new URL(anchor.href, location.href);
      if (url.pathname === location.pathname && url.search === location.search) return;
      if (!window.confirm('저장하지 않은 입력이 있어요. 이 화면을 나가면 입력한 내용이 사라져요. 이동할까요?')) { event.preventDefault(); event.stopPropagation(); }
    };
    const beforeLeave = (event: Event) => {
      const detail = (event as CustomEvent<{ promises: Promise<void>[] }>).detail;
      if (!window.confirm('저장하지 않은 입력이 있어요. 계속하면 입력한 내용이 사라져요. 계속할까요?')) detail.promises.push(Promise.reject(new Error('입력 내용을 유지하기 위해 이동을 취소했어요.')));
    };
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('teumgil:before-leave', beforeLeave);
    document.addEventListener('click', beforeLink, true);
    return () => { window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('teumgil:before-leave', beforeLeave); document.removeEventListener('click', beforeLink, true); };
  }, [dirty]);
}

export function Section({ title, children, description }: { title: string; children: ReactNode; description?: string }) {
  return <section className={styles.section}><h2>{title}</h2>{description && <p className={styles.subtle}>{description}</p>}{children}</section>;
}
