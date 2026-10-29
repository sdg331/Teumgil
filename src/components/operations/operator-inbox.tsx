'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowUpRight, ChevronRight, Inbox, MapPin, Search } from 'lucide-react';
import { Button, ButtonLink, EmptyState, Field, PageHeading, Skeleton, StatusBadge } from '../ui';
import { STATUS_LABELS } from '../../lib/contracts';
import type { Market, OpinionStatus, OpinionSummary } from '../../lib/contracts';
import { formatDate, ReadError, useResource } from './common';
import styles from './operations.module.css';

export function OperatorInbox() {
  const search = useSearchParams();
  const router = useRouter();
  const marketId = search.get('marketId') ?? '';
  const status = search.get('status') ?? '';
  const query = search.get('q') ?? '';
  const [queryInput, setQueryInput] = useState(query);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const params = new URLSearchParams();
  if (marketId) params.set('marketId', marketId);
  if (status) params.set('status', status);
  if (query) params.set('q', query);
  const resource = useResource<{ opinions: OpinionSummary[]; markets: Market[] }>(`/api/operator/opinions?${params}`);
  const markets = resource.data?.markets ?? resource.previousData?.markets ?? [];
  const selected = resource.data?.opinions.find(item => item.id === selectedId) ?? resource.data?.opinions[0];
  const detailHref = (id: string) => `/operator/opinions/${id}?returnTo=${encodeURIComponent(`/operator?${params}#opinion-${id}`)}`;

  function filter(values: { marketId?: string; status?: string; q?: string }) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values)) { if (value) next.set(key, value); else next.delete(key); }
    router.replace(`/operator${next.size ? `?${next}` : ''}`, { scroll: false });
  }

  return <div className={styles.page}>
    <PageHeading eyebrow="운영자 작업 공간" title="차근차근, 함께 확인해요" description="담당 시장에 들어온 의견을 확인하고 대화를 이어가세요." />
    <div className={styles.layout}>
      <section aria-label="운영자 의견 목록">
        <form className={styles.toolbar} onSubmit={event => { event.preventDefault(); filter({ q: queryInput.trim() }); }}>
          <div><Field label="담당 시장" htmlFor="operator-market"><select className="select" id="operator-market" value={marketId} onChange={event => filter({ marketId: event.target.value })}><option value="">담당 시장 전체</option>{markets.map(market => <option key={market.id} value={market.id}>{market.name}</option>)}</select></Field></div>
          <div><Field label="의견 찾기" htmlFor="operator-search"><input className="input" id="operator-search" type="search" value={queryInput} onChange={event => setQueryInput(event.target.value)} placeholder="의견 제목 또는 접수번호" maxLength={100} /></Field></div>
          <Button type="submit" variant="secondary"><Search size={18} aria-hidden="true" />검색</Button>
        </form>
        <div className={styles.filterButtons} aria-label="처리 상태 필터"><button className={styles.filterButton} type="button" aria-pressed={!status} onClick={() => filter({ status: '' })}>전체 상태</button>{(Object.entries(STATUS_LABELS) as [OpinionStatus, string][]).map(([key, label]) => <button key={key} className={styles.filterButton} type="button" aria-pressed={status === key} onClick={() => filter({ status: key })}>{label}</button>)}</div>
        {resource.error ? <ReadError error={resource.error} retry={resource.reload} back="/" /> : resource.loading ? <><p className={styles.subtle} role="status">담당 시장의 의견을 불러오고 있어요.</p><Skeleton rows={4} /></> : resource.data && <>
          <div className={styles.listHeading}><span aria-live="polite">조건에 맞는 의견 <strong>{resource.data.opinions.length}건</strong></span><span className={styles.subtle}>최근 접수 순</span></div>
          {!resource.data.markets.length ? <EmptyState icon={<MapPin aria-hidden="true" />} title="아직 담당 시장이 없어요" description="관리자에게 시장 배정을 요청해 주세요. 시장이 연결되면 이곳에서 의견을 확인할 수 있어요." /> : !resource.data.opinions.length ? <EmptyState icon={<Inbox aria-hidden="true" />} title={query || status || marketId ? '조건에 맞는 의견이 없어요' : '아직 접수된 의견이 없어요'} description={query || status || marketId ? '검색어나 시장·상태 조건을 바꿔 보세요.' : '시민이 의견을 남기면 이곳에 보여요.'} action={(query || status || marketId) ? <Button variant="secondary" onClick={() => { setQueryInput(''); filter({ q: '', marketId: '', status: '' }); }}>전체 의견 보기</Button> : undefined} /> : <div className={styles.list}>{resource.data.opinions.map(opinion => <article key={opinion.id} id={`opinion-${opinion.id}`} className={styles.row} data-selected={selected?.id === opinion.id}>
            <div className={styles.rowMain}><Link className={styles.rowTitle} href={detailHref(opinion.id)}>{opinion.title}</Link><div className={styles.meta}><span>{opinion.marketName}{opinion.isSample ? ' · 가상 자료' : ''}</span><span>{opinion.location}</span></div><p className={styles.number}>{opinion.id}</p></div>
            <div className={styles.rowActions}><StatusBadge status={opinion.status} /><time className={styles.subtle} dateTime={opinion.createdAt}>{formatDate(opinion.createdAt)}</time><button className={styles.previewButton} type="button" aria-label={`${opinion.title} 요약 미리보기`} aria-pressed={selected?.id === opinion.id} onClick={() => setSelectedId(opinion.id)}><ChevronRight size={20} aria-hidden="true" /></button></div>
          </article>)}</div>}
        </>}
      </section>
      <aside className={styles.aside} aria-label="선택한 의견 요약"><div className={styles.inline}><Inbox size={19} aria-hidden="true" /><h2 style={{ margin: 0 }}>의견 미리보기</h2></div>{selected ? <><p className={styles.previewTitle}>{selected.title}</p><StatusBadge status={selected.status} /><p>{selected.marketName}<br />{selected.location}</p><p className={styles.subtle}>{formatDate(selected.createdAt)} 접수</p><ButtonLink href={detailHref(selected.id)}>내용 확인하기 <ArrowUpRight size={18} aria-hidden="true" /></ButtonLink><hr className={styles.divider} /><p className={styles.subtle}>원문과 확인 기록을 읽은 뒤 다음 행동을 선택해 주세요. 목록을 읽는 것만으로 상태는 바뀌지 않아요.</p></> : <p className={styles.subtle}>의견을 선택하면 위치와 현재 상태를 여기서 빠르게 확인할 수 있어요.</p>}</aside>
    </div>
  </div>;
}
