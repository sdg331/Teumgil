'use client';

import { useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, LockKeyhole, Send } from 'lucide-react';
import { api, ApiError, useSession } from '../../lib/client';
import type { MerchantReplyInput, Transmission } from '../../lib/contracts';
import { Button, Field, Modal, Notice, PageHeading, Skeleton } from '../ui';
import { formatDate, MutationError, ReadError, Section, useRequestKey, useResource, useUnsavedChanges } from './common';
import styles from './operations.module.css';

export function MerchantDetail({ id }: { id: string }) {
  const { user, loading } = useSession();
  const [owner, setOwner] = useState<string | null>(user?.id ?? null);
  if (user && owner !== user.id) setOwner(user.id);
  if (loading && !owner && !user) return <div className={styles.page}><p role="status">계정을 확인하고 있어요.</p><Skeleton rows={4} /></div>;
  return <MerchantDetailContent key={user?.id ?? owner ?? 'anonymous'} id={id} />;
}

function MerchantDetailContent({ id }: { id: string }) {
  const search = useSearchParams();
  const replyFilter = search.get('reply');
  const back = replyFilter === 'unanswered' || replyFilter === 'answered' ? `/merchant?reply=${replyFilter}` : '/merchant';
  const resource = useResource<{ transmission: Transmission }>(`/api/merchant/transmissions/${encodeURIComponent(id)}`);
  const [stance, setStance] = useState('');
  const [alternative, setAlternative] = useState('');
  const [noAlternative, setNoAlternative] = useState(false);
  const [correctsId, setCorrectsId] = useState('');
  const [preview, setPreview] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const key = useRequestKey();
  const successRef = useRef<HTMLDivElement>(null);
  const transmission = resource.data?.transmission;
  const uncertain = !!error && (!(error instanceof ApiError) || error.status === 0 || error.status >= 500);
  useUnsavedChanges(!!(stance || alternative || noAlternative));

  function review(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!stance.trim()) next.stance = '점포의 입장이나 확인한 상황을 적어 주세요.';
    if (!noAlternative && !alternative.trim()) next.alternative = '가능한 대안을 적거나, 지금 제안할 대안이 없음을 선택해 주세요.';
    setFields(next);
    if (Object.keys(next).length) { document.getElementById(`merchant-${Object.keys(next)[0]}`)?.focus(); return; }
    setPreview(true);
  }

  async function submit() {
    if (!transmission || pending) return;
    const payload = { version: transmission.version, stance: stance.trim(), noAlternative, ...(noAlternative ? {} : { alternative: alternative.trim() }), ...(correctsId ? { correctsId } : {}) };
    setPending(true);
    setError(null);
    try {
      const body: MerchantReplyInput = { ...payload, requestId: await key.get(payload) };
      const result = await api<{ transmission: Transmission }>(`/api/merchant/transmissions/${encodeURIComponent(id)}/replies`, { method: 'POST', body });
      resource.setData(result); key.clear(); setPreview(false); setStance(''); setAlternative(''); setNoAlternative(false); setCorrectsId(''); setSaved(true);
      requestAnimationFrame(() => successRef.current?.focus());
    } catch (reason) {
      setError(reason instanceof Error ? reason : new Error('저장 결과를 확인하지 못했어요.'));
      if (reason instanceof ApiError && [401, 403, 404].includes(reason.status)) resource.deny(reason);
      if (reason instanceof ApiError && reason.fields) { setFields(reason.fields); requestAnimationFrame(() => document.getElementById(`merchant-${Object.keys(reason.fields!)[0]}`)?.focus()); }
      setPreview(false);
    }
    finally { setPending(false); }
  }

  async function refreshConflict() {
    if (pending) return;
    setPending(true);
    try { resource.setData(await api<{ transmission: Transmission }>(`/api/merchant/transmissions/${encodeURIComponent(id)}`)); key.clear(); setError(null); }
    catch (reason) { setError(reason instanceof Error ? reason : new Error('최신 내용을 읽지 못했어요.')); if (reason instanceof ApiError && [401, 403, 404].includes(reason.status)) resource.deny(reason); }
    finally { setPending(false); }
  }

  return <div className={styles.page}><div className={styles.merchantDetail}>
    <PageHeading eyebrow="상인 작업 공간" title="점포의 이야기를 들려주세요" back={{ href: back, label: '전달 목록' }} />
    {resource.error ? <ReadError error={resource.error} retry={resource.reload} back="/merchant" /> : !transmission ? <><p className={styles.subtle} role="status">전달받은 내용을 불러오고 있어요.</p><Skeleton rows={4} /></> : <div className={styles.stack}>
      <Section title="운영자가 전한 내용">
        <div className={styles.meta}><span>{transmission.marketName} · {transmission.storeName}</span><time dateTime={transmission.createdAt}>{formatDate(transmission.createdAt)}</time></div>
        <p className={styles.copy}>{transmission.summary}</p>
        <dl className={styles.definition}><div><dt>전달된 위치 설명</dt><dd>{transmission.location}</dd></div><div><dt>전달번호</dt><dd className={styles.number}>{transmission.id}</dd></div></dl>
        <p className={styles.privacy}><LockKeyhole size={15} aria-hidden="true" />이 내용은 운영자가 점포에 필요한 범위로 정리해 전달했어요.</p>
      </Section>
      {saved && <div className={`${styles.success} ${styles.focusHeading}`} ref={successRef} tabIndex={-1}><Notice variant="success" title="답변이 운영자에게 전달됐어요"><div className={styles.inline}><Check size={18} aria-hidden="true" /><span>아래 답변 기록에서 내용을 다시 확인할 수 있어요. 답변만으로 처리 상태가 바뀌지는 않아요.</span></div></Notice></div>}
      <Section title={transmission.replies.length ? '답변을 이어서 남기기' : '우리 점포의 입장'} description="내용이 다르게 전달됐거나 점포와 무관하다면, 그 사정을 함께 적어 주세요.">
        <form className={styles.form} onSubmit={review}>
          <MutationError error={error} reload={() => void refreshConflict()} />
          {uncertain && <p className={styles.subtle}>같은 내용을 다시 보내 저장 결과를 확인할 때까지 입력을 잠시 유지해요.</p>}
          <fieldset disabled={pending || uncertain} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }} className={styles.form}>
            {transmission.replies.length > 0 && <Field label="답변 방식" htmlFor="merchant-correction"><select id="merchant-correction" className="select" value={correctsId} onChange={event => setCorrectsId(event.target.value)}><option value="">새로운 답변 남기기</option>{transmission.replies.map((reply, index) => <option key={reply.id} value={reply.id}>{index + 1}번째 답변 정정 · {formatDate(reply.createdAt)}</option>)}</select></Field>}
            {correctsId && <Notice>이전 답변은 남겨두고, 정정한 내용을 새 기록으로 연결해요.</Notice>}
            <Field label="입장과 확인한 상황" htmlFor="merchant-stance" required error={fields.stance}><textarea className="textarea" id="merchant-stance" value={stance} onChange={event => { setStance(event.target.value); setSaved(false); if (fields.stance) setFields({ ...fields, stance: '' }); }} maxLength={4000} placeholder="점포에서 확인한 상황을 말씀해 주세요." aria-describedby={fields.stance ? 'merchant-stance-error' : undefined} aria-invalid={!!fields.stance} /></Field>
            <Field label="가능한 대안" htmlFor="merchant-alternative" hint="지금 가능한 방법이 있다면 알려 주세요." error={fields.alternative}><textarea className="textarea" id="merchant-alternative" value={alternative} onChange={event => { setAlternative(event.target.value); if (fields.alternative) setFields({ ...fields, alternative: '' }); }} maxLength={3000} disabled={noAlternative} placeholder="예: 사람이 많은 시간에는 물건을 점포 안쪽에 두겠습니다." aria-invalid={!!fields.alternative} aria-describedby={fields.alternative ? 'merchant-alternative-error' : 'merchant-alternative-hint'} /></Field>
            <label className={styles.checkLabel}><input type="checkbox" checked={noAlternative} onChange={event => { setNoAlternative(event.target.checked); if (event.target.checked) setFields({ ...fields, alternative: '' }); }} /><span>지금 제안할 수 있는 대안이 없어요</span></label>
          </fieldset>
          <p className={styles.privacy}><LockKeyhole size={15} aria-hidden="true" />답변 원문은 담당 운영자에게만 보여요. 시민용 결과는 운영자가 따로 확인하고 게시해요.</p>
          <div className={styles.actions}><Button type="submit" loading={pending} disabled={pending || (error instanceof ApiError && error.status === 409)}>{uncertain ? '같은 답변으로 다시 확인' : '답변 내용 확인하기'}</Button></div>
          <p className={styles.subtle}>입력은 저장 전까지 이 화면에만 남아요.</p>
        </form>
      </Section>
      {transmission.replies.length > 0 && <Section title="내가 남긴 답변"><div>{[...transmission.replies].reverse().map(reply => <article className={styles.question} key={reply.id}><div className={styles.meta}><strong>{reply.correctsId ? '이전 답변 정정' : '답변'}</strong><time dateTime={reply.createdAt}>{formatDate(reply.createdAt)}</time></div><p className={styles.copy}>{reply.stance}</p><div className={styles.reply}><span className={styles.subtle}>가능한 대안</span><p className={styles.copy}>{reply.noAlternative ? '지금 제안할 수 있는 대안 없음' : reply.alternative || '기재하지 않음'}</p></div></article>)}</div></Section>}
      <Modal open={preview} onClose={() => { if (!pending) setPreview(false); }} title="운영자에게 전달할 답변" description={`${transmission.storeName}의 답변으로 저장돼요.`} footer={<><Button variant="secondary" onClick={() => setPreview(false)} disabled={pending}>다시 수정</Button><Button onClick={() => void submit()} loading={pending}><Send size={17} aria-hidden="true" />답변 전달하기</Button></>}>
        <div className={styles.preview}><h3>입장과 확인한 상황</h3><p className={styles.copy}>{stance}</p><h3>가능한 대안</h3><p className={styles.copy}>{noAlternative ? '지금 제안할 수 있는 대안 없음' : alternative}</p></div><p className={styles.subtle}>시민에게 자동 공개되지 않으며, 의견 처리 상태도 바뀌지 않아요.</p>
      </Modal>
    </div>}
  </div></div>;
}
