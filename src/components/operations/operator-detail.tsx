'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, Eye, LockKeyhole, Send } from 'lucide-react';
import { api, ApiError, useSession } from '../../lib/client';
import { STATUS_LABELS } from '../../lib/contracts';
import type { OpinionStatus, OperatorAction, OperatorOpinion } from '../../lib/contracts';
import { Button, Field, Modal, Notice, PageHeading, Skeleton, StatusBadge } from '../ui';
import { formatDate, MutationError, ReadError, Section, Timeline, useRequestKey, useResource, useUnsavedChanges } from './common';
import styles from './operations.module.css';

type ActionKind = OperatorAction['kind'];
type FormValues = Record<string, string>;
const ACTIONS: { kind: ActionKind; label: string; title: string; help: string }[] = [
  { kind: 'note', label: '확인 기록', title: '확인한 내용을 남겨요', help: '확인한 사실과 아직 알 수 없는 내용을 구분해 주세요. 이 기록은 담당 운영자만 볼 수 있어요.' },
  { kind: 'question', label: '추가 질문', title: '시민에게 더 물어볼 내용', help: '이 의견을 남긴 시민에게 질문이 보여요. 외부 알림은 발송되지 않아요.' },
  { kind: 'transmit', label: '상인 전달', title: '관련 점포와 이야기를 나눠요', help: '관련성을 확인한 점포를 선택하고 필요한 내용만 직접 정리해 주세요.' },
  { kind: 'publish', label: '시민에게 게시', title: '확인한 내용을 시민에게 알려요', help: '내부 기록과 상인 답변을 검토한 뒤, 이 의견을 남긴 시민에게 보여 줄 내용을 별도로 작성해 주세요.' },
  { kind: 'status', label: '처리 상태', title: '근거와 함께 상태를 바꿔요', help: '예정된 일과 실제로 확인한 사실을 구분해 주세요. 변경 사유는 내부 기록에 남아요.' },
  { kind: 'followup-plan', label: '후속 계획', title: '다음 확인을 약속해요', help: '확인할 내용과 담당자, 예정 시각을 남겨요. 계획은 완료로 표시되지 않아요.' },
  { kind: 'followup-result', label: '후속 결과', title: '실제로 확인한 결과를 남겨요', help: '이미 등록한 계획을 선택하고, 실제로 확인한 시각과 내용을 적어 주세요.' },
  { kind: 'official-guidance', label: '공식 안내', title: '별도의 공식 창구를 안내해요', help: '이 안내는 시민에게 보이며 틈길 내부 처리 상태를 바꾸지 않아요. 실제로 공식 접수를 대신한 것처럼 적지 않아요.' },
];
const NEXT_STATUS: Record<OpinionStatus, OpinionStatus[]> = { received: ['verifying'], verifying: ['needs_info', 'consulting', 'action_confirmed', 'unresolved'], needs_info: ['verifying', 'consulting', 'unresolved'], consulting: ['verifying', 'needs_info', 'action_confirmed', 'unresolved'], action_confirmed: ['verifying'], unresolved: ['verifying'] };
function koreaIso(value: string) { return new Date(`${value}:00+09:00`).toISOString(); }
function isFuture(date: Date) { return date.getTime() > Date.now(); }

export function OperatorDetail({ id }: { id: string }) {
  const { user, loading } = useSession();
  const [owner, setOwner] = useState<string | null>(user?.id ?? null);
  if (user && owner !== user.id) setOwner(user.id);
  if (loading && !owner && !user) return <div className={styles.page}><p role="status">계정을 확인하고 있어요.</p><Skeleton rows={4} /></div>;
  return <OperatorDetailContent key={user?.id ?? owner ?? 'anonymous'} id={id} />;
}

function OperatorDetailContent({ id }: { id: string }) {
  const search = useSearchParams();
  const returnTo = search.get('returnTo');
  const back = returnTo && (returnTo === '/operator' || returnTo.startsWith('/operator?')) ? returnTo : '/operator';
  const resource = useResource<{ opinion: OperatorOpinion }>(`/api/operator/opinions/${encodeURIComponent(id)}`);
  const opinion = resource.data?.opinion;
  const [kind, setKind] = useState<ActionKind>('note');
  const [forms, setForms] = useState<Partial<Record<ActionKind, FormValues>>>({});
  const form = forms[kind] ?? {};
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [preview, setPreview] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');
  const successRef = useRef<HTMLDivElement>(null);
  const actionHeading = useRef<HTMLHeadingElement>(null);
  const key = useRequestKey();
  const uncertain = !!error && (!(error instanceof ApiError) || error.status === 0 || error.status >= 500);
  const action = ACTIONS.find(item => item.kind === kind)!;
  const formDirty = Object.values(forms).some(values => values && Object.values(values).some(Boolean));
  useUnsavedChanges(formDirty);

  const nextStatuses = opinion ? NEXT_STATUS[opinion.status].filter(status => status !== 'needs_info' || opinion.questions.length > 0).filter(status => status !== 'consulting' || opinion.transmissions.length > 0) : [];
  const nextStatus = nextStatuses.includes(form.status as OpinionStatus) ? form.status as OpinionStatus : nextStatuses[0];
  const selectedMerchant = opinion?.merchantOptions.find(item => `${item.merchantId}:${item.storeId}` === form.merchant);
  const followupPlans = opinion?.timeline.filter(item => item.kind === 'followup-plan') ?? [];
  const actionRestricted = opinion && (kind === 'question' || kind === 'transmit') && !['verifying', 'needs_info', 'consulting'].includes(opinion.status);
  const noMerchant = kind === 'transmit' && opinion && !opinion.merchantOptions.length;
  const noPlan = kind === 'followup-result' && !followupPlans.length;
  const canReview = !pending && !actionRestricted && !noMerchant && !noPlan && !(error instanceof ApiError && error.status === 409);

  function update(name: string, value: string) {
    setForms(previous => ({ ...previous, [kind]: { ...previous[kind], [name]: value } }));
    if (fields[name]) setFields(previous => ({ ...previous, [name]: '' }));
    setSavedMessage('');
  }

  function chooseAction(next: ActionKind) {
    if (pending || uncertain) return;
    setKind(next); setFields({}); setError(null); setSavedMessage('');
    requestAnimationFrame(() => actionHeading.current?.focus());
  }

  function review(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors: Record<string, string> = {};
    const required = (name: string, message: string) => { if (!form[name]?.trim()) errors[name] = message; };
    if (kind === 'transmit') {
      if (!selectedMerchant) errors.merchant = '전달할 점포와 상인을 선택해 주세요.';
      required('relationBasis', '이 점포와 관련이 있다고 확인한 근거를 적어 주세요.');
      required('location', '상인에게 전달할 위치 설명을 적어 주세요.');
      required('summary', '상인에게 전달할 내용을 직접 정리해 주세요.');
    } else required('content', '기록할 내용을 적어 주세요.');
    if (kind === 'status' && !nextStatus) errors.status = '변경할 상태를 선택해 주세요.';
    if (kind === 'status' && nextStatus === 'action_confirmed') required('occurredAt', '실제로 확인한 시각을 입력해 주세요.');
    if (kind === 'followup-plan') { required('scheduledAt', '확인할 예정 시각을 입력해 주세요.'); required('assignee', '후속 확인 담당자를 적어 주세요.'); }
    if (kind === 'followup-result') { required('planId', '확인한 계획을 선택해 주세요.'); required('occurredAt', '실제로 확인한 시각을 입력해 주세요.'); }
    for (const name of ['occurredAt', 'scheduledAt']) if (form[name]) {
      const date = new Date(`${form[name]}:00+09:00`);
      if (Number.isNaN(date.getTime())) errors[name] = '올바른 날짜와 시간을 입력해 주세요.';
      else if (name === 'occurredAt' && isFuture(date)) errors[name] = '실제 확인 시각은 미래일 수 없어요.';
    }
    setFields(errors);
    if (Object.keys(errors).length) { document.getElementById(`op-${Object.keys(errors)[0]}`)?.focus(); return; }
    if (['transmit', 'publish', 'question', 'followup-plan', 'followup-result', 'official-guidance', 'status'].includes(kind)) setPreview(true);
    else void submit();
  }

  function payload(): Omit<OperatorAction, 'requestId'> | null {
    if (!opinion) return null;
    const base = { version: opinion.version, kind };
    const content = form.content?.trim() ?? '';
    switch (kind) {
      case 'transmit': return selectedMerchant ? { ...base, kind, merchantId: selectedMerchant.merchantId, storeId: selectedMerchant.storeId, relationBasis: form.relationBasis.trim(), summary: form.summary.trim(), location: form.location.trim() } as Omit<OperatorAction, 'requestId'> : null;
      case 'status': return { ...base, kind, content, status: nextStatus, ...(form.occurredAt && nextStatus === 'action_confirmed' ? { occurredAt: koreaIso(form.occurredAt) } : {}) } as Omit<OperatorAction, 'requestId'>;
      case 'note': case 'publish': return { ...base, kind, content, ...(form.correctsId ? { correctsId: form.correctsId } : {}) } as Omit<OperatorAction, 'requestId'>;
      case 'followup-plan': return { ...base, kind, content, scheduledAt: koreaIso(form.scheduledAt), assignee: form.assignee.trim() } as Omit<OperatorAction, 'requestId'>;
      case 'followup-result': return { ...base, kind, content, occurredAt: koreaIso(form.occurredAt), planId: form.planId } as Omit<OperatorAction, 'requestId'>;
      default: return { ...base, kind, content } as Omit<OperatorAction, 'requestId'>;
    }
  }

  async function submit() {
    if (pending) return;
    const input = payload();
    if (!input) return;
    setPending(true); setError(null);
    try {
      const result = await api<{ opinion: OperatorOpinion }>(`/api/operator/opinions/${encodeURIComponent(id)}/actions`, { method: 'POST', body: { ...input, requestId: await key.get(input) } });
      resource.setData(result); key.clear(); setPreview(false); setForms(previous => ({ ...previous, [kind]: {} })); setFields({});
      const messages: Record<ActionKind, string> = { note: '내부 확인 기록을 저장했어요.', question: '시민이 확인할 질문을 저장했어요.', transmit: '선택한 상인에게 전달했어요.', publish: '이 의견을 남긴 시민에게 내용을 게시했어요.', status: '상태와 변경 이력을 함께 저장했어요.', 'followup-plan': '후속 확인 계획을 등록했어요. 아직 수행 완료는 아니에요.', 'followup-result': '실제 후속 확인 결과를 저장했어요.', 'official-guidance': '공식 창구 안내를 기록했어요. 내부 상태는 그대로예요.' };
      setSavedMessage(messages[kind]); requestAnimationFrame(() => successRef.current?.focus());
    } catch (reason) {
      setError(reason instanceof Error ? reason : new Error('저장 결과를 확인하지 못했어요.'));
      if (reason instanceof ApiError && [401, 403, 404].includes(reason.status)) resource.deny(reason);
      if (reason instanceof ApiError && reason.fields) { const errors = { ...reason.fields }; if (errors.merchantId) { errors.merchant = errors.merchantId; delete errors.merchantId; } setFields(errors); requestAnimationFrame(() => document.getElementById(`op-${Object.keys(errors)[0]}`)?.focus()); }
      setPreview(false);
    }
    finally { setPending(false); }
  }

  async function refreshConflict() {
    if (pending) return;
    setPending(true);
    try { resource.setData(await api<{ opinion: OperatorOpinion }>(`/api/operator/opinions/${encodeURIComponent(id)}`)); key.clear(); setError(null); }
    catch (reason) { setError(reason instanceof Error ? reason : new Error('최신 내용을 읽지 못했어요.')); if (reason instanceof ApiError && [401, 403, 404].includes(reason.status)) resource.deny(reason); }
    finally { setPending(false); }
  }

  const commonContentLabel = kind === 'question' ? '시민에게 물어볼 내용' : kind === 'publish' ? '시민에게 보여 줄 내용' : kind === 'status' ? (opinion && ['action_confirmed', 'unresolved'].includes(opinion.status) ? '다시 확인하는 이유' : '확인 내용 또는 변경 사유') : kind === 'followup-plan' ? '다음에 확인할 내용' : kind === 'followup-result' ? '실제로 확인한 결과' : kind === 'official-guidance' ? '공식 창구 안내 내용' : '확인 내용';

  return <div className={styles.page}>
    <PageHeading eyebrow="운영자 작업 공간" title={opinion?.title ?? '의견 확인'} back={{ href: back, label: '접수함으로' }} />
    {resource.error ? <ReadError error={resource.error} retry={resource.reload} /> : !opinion ? <><p className={styles.subtle} role="status">의견과 확인 기록을 불러오고 있어요.</p><Skeleton rows={5} /></> : <>
      <div className={`${styles.meta} ${styles.header}`}><StatusBadge status={opinion.status} /><span>{opinion.marketName}{opinion.isSample ? ' · 가상 자료' : ''}</span><span>{formatDate(opinion.createdAt)} 접수</span><span className={styles.number}>{opinion.id}</span></div>
      <div className={styles.detailLayout}>
        <div className={styles.stack}>
          <Section title="이용자가 남긴 이야기">
            <dl className={styles.definition}><div><dt>위치</dt><dd>{opinion.original.location}</dd></div><div><dt>상황 원문</dt><dd>{opinion.original.situation}</dd></div><div><dt>발견 시점</dt><dd>{opinion.original.observedAt || '입력하지 않음'}</dd></div></dl>
            <details className={styles.disclosure}><summary>이용자가 검토한 제출 내용</summary><dl className={styles.definition}><div><dt>정리한 상황 · 직접 작성</dt><dd>{opinion.submission.description}</dd></div><div><dt>바라는 점</dt><dd>{opinion.submission.request || '입력하지 않음'}</dd></div></dl></details>
            {opinion.attachments.length > 0 && <><hr className={styles.divider} /><h3>첨부 사진</h3><div className={styles.attachments}>{opinion.attachments.map((attachment, index) => <a className={styles.attachment} key={attachment.id} href={`/api/attachments/${attachment.id}`} target="_blank" rel="noopener noreferrer"><Image src={`/api/attachments/${attachment.id}`} alt={`이용자가 첨부한 사진 ${index + 1}`} width={attachment.width} height={attachment.height} unoptimized />사진 {index + 1} 크게 보기</a>)}</div><p className={styles.privacy}><LockKeyhole size={15} aria-hidden="true" />사진은 작성 시민과 담당 운영자만 볼 수 있어요.</p></>}
          </Section>
          <Section title="추가 질문과 시민 답변">{!opinion.questions.length ? <p className={styles.emptyText}>아직 추가로 요청한 정보가 없어요.</p> : opinion.questions.map(question => <article key={question.id} className={styles.question}><p className={styles.copy}>{question.content}</p><time className={styles.subtle} dateTime={question.createdAt}>{formatDate(question.createdAt)} 질문</time>{question.responses.length ? question.responses.map(response => <div className={styles.reply} key={response.id}><span className={styles.subtle}>시민 답변 · {formatDate(response.createdAt)}</span><p className={styles.copy}>{response.content}</p></div>) : <p className={styles.subtle}>아직 답변이 없어요.</p>}</article>)}</Section>
          <Section title="상인과 나눈 이야기" description="전달별 답변은 운영자만 확인해요. 시민용 내용은 별도로 게시해 주세요.">{!opinion.transmissions.length ? <p className={styles.emptyText}>아직 상인에게 전달한 내용이 없어요.</p> : [...opinion.transmissions].reverse().map(transmission => <article className={styles.question} key={transmission.id}><h3>{transmission.storeName} · {transmission.merchantName}</h3><div className={styles.meta}><time dateTime={transmission.createdAt}>{formatDate(transmission.createdAt)} 전달</time><span>{transmission.replies.length ? `답변 ${transmission.replies.length}건` : '답변 전'}</span></div><p className={styles.copy}>{transmission.summary}</p><p className={styles.subtle}>전달 위치: {transmission.location}</p><details className={styles.disclosure}><summary>관련성 근거와 전달번호</summary><p className={styles.copy}>{transmission.relationBasis}</p><p className={styles.number}>{transmission.id}</p></details>{transmission.replies.map(reply => <div className={styles.reply} key={reply.id}><div className={styles.meta}><strong>{reply.correctsId ? '상인 답변 정정' : '상인 답변'}</strong><time dateTime={reply.createdAt}>{formatDate(reply.createdAt)}</time></div><p className={styles.copy}>{reply.stance}</p><p className={styles.subtle}>가능한 대안</p><p className={styles.copy}>{reply.noAlternative ? '지금 제안할 수 있는 대안 없음' : reply.alternative || '기재하지 않음'}</p></div>)}</article>)}</Section>
        </div>
        <div className={styles.stack}>
          <section className={styles.section} aria-label="의견 처리 작업">
            <div className={styles.actionTabs} aria-label="처리 작업 선택">{ACTIONS.map(item => <button key={item.kind} type="button" className={styles.actionTab} aria-pressed={kind === item.kind} onClick={() => chooseAction(item.kind)} disabled={pending || uncertain}>{item.label}</button>)}</div>
            <h2 ref={actionHeading} className={styles.focusHeading} tabIndex={-1}>{action.title}</h2><p className={styles.subtle}>{action.help}</p>
            {savedMessage && <div className={`${styles.success} ${styles.focusHeading}`} ref={successRef} tabIndex={-1}><Notice variant="success"><div className={styles.inline}><Check size={18} aria-hidden="true" /><span>{savedMessage}</span></div></Notice></div>}
            <form className={styles.form} onSubmit={review}>
              <MutationError error={error} reload={() => void refreshConflict()} />
              {actionRestricted && <Notice title="먼저 확인 중으로 변경해 주세요">{opinion.status === 'received' ? '원문을 읽고 확인을 시작한 뒤 질문하거나 상인에게 전달할 수 있어요.' : '재개 사유를 남기고 확인 중으로 바꾼 뒤 이야기를 이어갈 수 있어요.'}<div className={styles.actions}><Button type="button" variant="secondary" onClick={() => chooseAction('status')}>처리 상태로 이동</Button></div></Notice>}
              {noMerchant && <Notice title="전달할 상인 계정이 없어요">이 시장의 점포에 연결된 상인 계정이 필요해요. 관리자에게 연결을 요청하고 관련성을 확인해 주세요.</Notice>}
              {noPlan && <Notice title="먼저 후속 확인 계획을 남겨 주세요"><Button type="button" variant="secondary" onClick={() => chooseAction('followup-plan')}>후속 계획 작성하기</Button></Notice>}
              <fieldset disabled={pending || uncertain || !!actionRestricted || !!noMerchant || noPlan} className={styles.form} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
                {(kind === 'note' || kind === 'publish') && <Field label="기록 방식" htmlFor="op-correctsId"><select className="select" id="op-correctsId" value={form.correctsId ?? ''} onChange={event => update('correctsId', event.target.value)}><option value="">새 기록 남기기</option>{(kind === 'note' ? opinion.internalHistory : opinion.timeline).filter(event => event.kind === kind).map(event => <option key={event.id} value={event.id}>{formatDate(event.createdAt)} 기록 정정</option>)}</select></Field>}
                {form.correctsId && <Notice>기존 기록은 보존되고 정정한 새 기록이 연결돼요. 무엇을 바로잡는지도 함께 적어 주세요.</Notice>}
                {kind === 'transmit' && <>
                  <Field label="전달할 점포·상인" htmlFor="op-merchant" required error={fields.merchant}><select className="select" id="op-merchant" value={form.merchant ?? ''} onChange={event => update('merchant', event.target.value)} aria-invalid={!!fields.merchant} aria-describedby={fields.merchant ? 'op-merchant-error' : undefined}><option value="">관련성을 확인한 대상을 선택해 주세요</option>{opinion.merchantOptions.map(item => <option key={`${item.merchantId}:${item.storeId}`} value={`${item.merchantId}:${item.storeId}`}>{item.storeName} · {item.merchantName}</option>)}</select></Field>
                  <Field label="관련성을 확인한 근거" htmlFor="op-relationBasis" required error={fields.relationBasis} hint="이 근거는 내부 기록에만 남고 상인에게 자동 전달되지 않아요."><textarea className="textarea" id="op-relationBasis" value={form.relationBasis ?? ''} onChange={event => update('relationBasis', event.target.value)} maxLength={2000} aria-invalid={!!fields.relationBasis} aria-describedby={fields.relationBasis ? 'op-relationBasis-error' : undefined} /></Field>
                  <Field label="상인에게 전달할 위치 설명" htmlFor="op-location" required error={fields.location}><input className="input" id="op-location" value={form.location ?? ''} onChange={event => update('location', event.target.value)} maxLength={500} aria-invalid={!!fields.location} aria-describedby={fields.location ? 'op-location-error' : undefined} /></Field>
                  <Field label="상인에게 전달할 내용" htmlFor="op-summary" required error={fields.summary} hint="시민의 이름·연락처나 불필요한 개인정보를 넣지 마세요. 원문·사진은 자동으로 함께 전달되지 않아요."><textarea className="textarea" id="op-summary" value={form.summary ?? ''} onChange={event => update('summary', event.target.value)} maxLength={4000} aria-invalid={!!fields.summary} aria-describedby={fields.summary ? 'op-summary-error' : undefined} /></Field>
                  <p className={styles.subtle}>실제 전달 기록이 저장되면 상태는 ‘협의 중’이 돼요.</p>
                </>}
                {kind === 'status' && <><Field label="변경할 상태" htmlFor="op-status" required error={fields.status}><select className="select" id="op-status" value={nextStatus ?? ''} onChange={event => update('status', event.target.value)}>{nextStatuses.map(status => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select></Field>{!opinion.questions.length && ['verifying', 'consulting'].includes(opinion.status) && <p className={styles.subtle}>‘추가 정보 필요’로 바꾸려면 추가 질문을 먼저 작성해 주세요.</p>}{!opinion.transmissions.length && ['verifying', 'needs_info'].includes(opinion.status) && <p className={styles.subtle}>‘협의 중’은 관련성을 확인한 상인에게 실제로 전달할 때 선택할 수 있어요.</p>}{nextStatus === 'action_confirmed' && <Notice>이미 확인한 조치가 있을 때 선택해요. 조치 예정이나 상인의 답변만으로 확인을 대신하지 않아요.</Notice>}</>}
                {kind === 'followup-result' && <Field label="확인한 계획" htmlFor="op-planId" required error={fields.planId}><select className="select" id="op-planId" value={form.planId ?? ''} onChange={event => update('planId', event.target.value)}><option value="">후속 확인 계획 선택</option>{followupPlans.map(plan => <option key={plan.id} value={plan.id}>{formatDate(plan.scheduledAt)} · {plan.content.slice(0, 70)}</option>)}</select></Field>}
                {kind !== 'transmit' && <Field label={commonContentLabel} htmlFor="op-content" required error={fields.content}><textarea id="op-content" className="textarea" value={form.content ?? ''} onChange={event => update('content', event.target.value)} maxLength={4000} aria-invalid={!!fields.content} aria-describedby={fields.content ? 'op-content-error' : undefined} /></Field>}
                {kind === 'question' && <p className={styles.subtle}>질문이 저장되면 상태는 ‘추가 정보 필요’가 돼요. 시민의 응답은 이후에 직접 검토해 주세요.</p>}
                {kind === 'followup-plan' && <><Field label="확인 담당자" htmlFor="op-assignee" required error={fields.assignee}><input className="input" id="op-assignee" value={form.assignee ?? ''} onChange={event => update('assignee', event.target.value)} maxLength={100} aria-invalid={!!fields.assignee} aria-describedby={fields.assignee ? 'op-assignee-error' : undefined} /></Field><Field label="예정 시각 · 한국 시간" htmlFor="op-scheduledAt" required error={fields.scheduledAt}><input className="input" type="datetime-local" id="op-scheduledAt" value={form.scheduledAt ?? ''} onChange={event => update('scheduledAt', event.target.value)} aria-invalid={!!fields.scheduledAt} aria-describedby={fields.scheduledAt ? 'op-scheduledAt-error' : undefined} /></Field></>}
                {(kind === 'followup-result' || (kind === 'status' && nextStatus === 'action_confirmed')) && <Field label="실제 확인 시각 · 한국 시간" htmlFor="op-occurredAt" required error={fields.occurredAt}><input className="input" type="datetime-local" id="op-occurredAt" value={form.occurredAt ?? ''} onChange={event => update('occurredAt', event.target.value)} aria-invalid={!!fields.occurredAt} aria-describedby={fields.occurredAt ? 'op-occurredAt-error' : undefined} /></Field>}
              </fieldset>
              <div className={styles.actions}><Button type="submit" loading={pending} disabled={!canReview}>{uncertain ? '같은 내용으로 다시 확인' : kind === 'note' ? '내부 기록 저장하기' : kind === 'status' ? '상태 변경 확인하기' : '저장 전 내용 확인하기'}</Button></div>
              <p className={styles.subtle}>입력은 저장 전까지 이 화면에만 남아요.</p>
            </form>
          </section>
          <Section title="시민에게 보이는 기록" description="이 의견을 남긴 시민이 확인할 질문·게시·처리 과정이에요."><Timeline events={opinion.timeline} /></Section>
          <Section title="운영자 내부 이력" description="작업 주체와 시각, 확인·전달·정정의 근거를 함께 확인해요."><Timeline events={opinion.internalHistory} /></Section>
        </div>
      </div>
      <Modal open={preview} onClose={() => { if (!pending) setPreview(false); }} title={kind === 'transmit' ? '상인에게 전달할 내용' : kind === 'status' ? '처리 상태 변경 확인' : '저장할 내용 확인'} description={kind === 'transmit' ? `${selectedMerchant?.storeName ?? ''} · ${selectedMerchant?.merchantName ?? ''}에게만 전달돼요.` : kind === 'status' ? '상태와 변경 이력을 함께 저장해요.' : '이 의견을 남긴 시민에게 보이는 내용이에요.'} footer={<><Button variant="secondary" disabled={pending} onClick={() => setPreview(false)}>다시 수정</Button><Button loading={pending} onClick={() => void submit()}>{kind === 'transmit' ? <Send size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}{kind === 'transmit' ? '상인에게 전달하기' : kind === 'publish' ? '시민에게 게시하기' : '확인하고 저장하기'}</Button></>}>
        <div className={styles.preview}>{kind === 'transmit' ? <><h3>전달할 위치</h3><p className={styles.copy}>{form.location}</p><h3>전달할 내용</h3><p className={styles.copy}>{form.summary}</p></> : <>{kind === 'status' && <p className={styles.inline}><StatusBadge status={opinion.status} /><span>→</span><StatusBadge status={nextStatus} /></p>}<p className={styles.copy}>{form.content}</p>{form.scheduledAt && kind === 'followup-plan' && <p>예정: {formatDate(koreaIso(form.scheduledAt))} · {form.assignee}</p>}{form.occurredAt && (kind === 'followup-result' || (kind === 'status' && nextStatus === 'action_confirmed')) && <p>실제 확인: {formatDate(koreaIso(form.occurredAt))}</p>}</>}</div>
        <p className={styles.privacy}><LockKeyhole size={15} aria-hidden="true" />{kind === 'transmit' ? '시민 원문·사진과 내부 관련성 근거는 함께 전달하지 않아요. 저장하면 협의 중으로 바뀌어요.' : kind === 'status' ? '상태는 시민에게 보이고, 작성한 상세 사유는 내부 기록에 남아요. 시민에게 설명할 내용은 별도로 게시해 주세요.' : '전체 공개 게시판이 아니에요. 이 의견을 남긴 시민에게만 보여요.'}</p>
      </Modal>
    </>}
  </div>;
}
