'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowUpRight, Mail, Store } from 'lucide-react';
import type { Transmission } from '../../lib/contracts';
import { Button, EmptyState, PageHeading, Skeleton } from '../ui';
import { formatDate, ReadError, useResource } from './common';
import styles from './operations.module.css';

export function MerchantInbox() {
  const resource = useResource<{ transmissions: Transmission[] }>('/api/merchant/transmissions');
  const router = useRouter();
  const search = useSearchParams();
  const filter = search.get('reply') === 'unanswered' ? 'unanswered' : search.get('reply') === 'answered' ? 'answered' : 'all';
  const setFilter = (value: 'all' | 'unanswered' | 'answered') => router.replace(value === 'all' ? '/merchant' : `/merchant?reply=${value}`, { scroll: false });
  const transmissions = resource.data?.transmissions.filter(item => filter === 'all' || (filter === 'answered' ? item.replies.length > 0 : item.replies.length === 0)) ?? [];
  return <div className={styles.page}>
    <PageHeading eyebrow="상인 작업 공간" title="우리 점포에 온 이야기" description="전달받은 내용을 읽고, 점포의 입장과 가능한 대안을 알려 주세요." />
    <div className={styles.layout}><section aria-label="상인 전달 목록">
      <div className={styles.filterButtons} aria-label="답변 여부 필터">{([['all', '전체'], ['unanswered', '답변 전'], ['answered', '답변한 내용']] as const).map(([value, label]) => <button className={styles.filterButton} key={value} aria-pressed={filter === value} onClick={() => setFilter(value)} type="button">{label}</button>)}</div>
      {resource.error ? <ReadError error={resource.error} retry={resource.reload} back="/" /> : resource.loading ? <><p className={styles.subtle} role="status">점포에 전달된 이야기를 불러오고 있어요.</p><Skeleton rows={3} /></> : <><div className={styles.listHeading}><span aria-live="polite">전달된 이야기 <strong>{transmissions.length}건</strong></span><span className={styles.subtle}>최근 전달 순</span></div>{!transmissions.length ? <EmptyState icon={<Mail aria-hidden="true" />} title={filter === 'all' ? '아직 전달받은 이야기가 없어요' : '이 조건의 이야기가 없어요'} description={filter === 'all' ? '운영자가 점포와 관련된 내용을 전달하면 이곳에 보여요.' : '다른 답변 조건을 선택해 보세요.'} action={filter !== 'all' ? <Button variant="secondary" onClick={() => setFilter('all')}>전체 보기</Button> : undefined} /> : <div className={styles.list}>{transmissions.map(item => <article className={styles.row} key={item.id}>
        <div className={styles.rowMain}><Link className={styles.rowTitle} href={`/merchant/transmissions/${item.id}${filter === 'all' ? '' : `?reply=${filter}`}`}>{item.summary}</Link><div className={styles.meta}><span>{item.marketName} · {item.storeName}</span><span>{item.location}</span></div></div>
        <div className={styles.rowActions}><span className={styles.subtle}>{item.replies.length ? '답변 기록 있음' : '답변 전'}</span><time className={styles.subtle} dateTime={item.createdAt}>{formatDate(item.createdAt)}</time><ArrowUpRight size={18} aria-hidden="true" /></div>
      </article>)}</div>}</>}
    </section><aside className={styles.aside}><Store size={24} aria-hidden="true" /><h2 style={{ marginTop: 16 }}>작은 대화부터 시작해요</h2><p>상황이 다르게 전달됐다면 바로잡아 주세요. 지금 가능한 대안이 없어도 괜찮아요.</p><p className={styles.subtle}>답변은 담당 운영자에게 전달돼요. 시민에게는 운영자가 확인하고 별도로 게시한 내용만 보여요.</p></aside></div>
  </div>;
}
