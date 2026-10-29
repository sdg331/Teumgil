"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Check,
  CheckCheck,
  ChevronRight,
  Clock3,
  FileText,
  MapPin,
  MessageSquareText,
} from "lucide-react";
import { api, ApiError, useApi, useSession } from "../../lib/client";
import type {
  CitizenOpinion,
  OpinionQuestion,
  OpinionSummary,
} from "../../lib/contracts";
import {
  Button,
  EmptyState,
  Field,
  Notice,
  PageHeading,
  Panel,
  StatusBadge,
} from "../ui";
import {
  BackLink,
  OfficialGuidance,
  prettyDate,
  ReadState,
  SaveError,
  shortName,
} from "./shared";
import "./citizen.css";

const eventLabels: Record<string, string> = {
  received: "틈길에 접수했어요",
  status: "확인 상태가 바뀌었어요",
  question: "추가 확인이 필요해요",
  response: "추가 정보를 보냈어요",
  publish: "운영자가 확인 내용을 게시했어요",
  "followup-plan": "후속 확인이 예정돼 있어요",
  "followup-result": "후속 확인 내용을 살펴보세요",
  "official-guidance": "공식 신고 창구 안내",
};

export function MyScreen() {
  const { user } = useSession();
  const source = useApi<{ opinions: OpinionSummary[] }>("/api/opinions");
  return (
    <div className="citizen-page citizen-narrow">
      <PageHeading
        eyebrow="내가 남긴 이야기"
        title="마이"
        description={
          user
            ? `${user.name}님의 의견과 확인 과정을 모았어요.`
            : "내 의견의 확인 과정을 살펴보세요."
        }
      />
      <ReadState
        loading={source.loading && !source.data}
        error={source.error}
        retry={source.reload}
        next="/my"
      />
      {source.data && !source.error && (
        <>
          {user && (
            <div className="citizen-profile-strip">
              <span className="citizen-profile-initial" aria-hidden="true">
                {user.name.slice(0, 1)}
              </span>
              <div>
                <strong>{user.name}</strong>
                <p>{user.email}</p>
              </div>
            </div>
          )}
          <div className="citizen-section-heading">
            <h2>내 의견</h2>
            <span className="citizen-count">
              {source.data.opinions.length}건
            </span>
          </div>
          {source.data.opinions.length ? (
            <ul className="citizen-opinion-list">
              {source.data.opinions.map((opinion) => (
                <li key={opinion.id}>
                  <Link href={`/opinions/${opinion.id}`}>
                    <div className="citizen-opinion-row-content">
                      <div className="citizen-opinion-row-top">
                        <span>{shortName(opinion.marketName)}</span>
                        <StatusBadge status={opinion.status} />
                      </div>
                      <h3>{opinion.title}</h3>
                      <p className="citizen-opinion-location">
                        <MapPin size={14} aria-hidden="true" />
                        {opinion.location}
                      </p>
                      <time dateTime={opinion.createdAt}>
                        {prettyDate(opinion.createdAt)} 접수
                      </time>
                    </div>
                    <ChevronRight size={20} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={<MessageSquareText size={35} strokeWidth={1.5} />}
              title="아직 남긴 의견이 없어요"
              description="시장에서 불편을 겪으셨다면 위치와 상황을 알려 주세요. 장보기만 이용하셔도 괜찮아요."
              action={
                <Link href="/opinions/new" className="button button-secondary">
                  의견 작성하기
                </Link>
              }
            />
          )}
          <p className="citizen-footnote">
            내 계정으로 남긴 의견만 보여요. 운영자가 게시한 확인 내용을 여기서
            살펴볼 수 있어요.
          </p>
        </>
      )}
    </div>
  );
}

export function ReceiptScreen({ id }: { id: string }) {
  const source = useApi<{ opinion: CitizenOpinion }>(
    `/api/opinions/${encodeURIComponent(id)}`,
  );
  return (
    <div className="citizen-page citizen-narrow">
      <ReadState
        loading={source.loading && !source.data}
        error={source.error}
        retry={source.reload}
        next={`/opinions/${id}/received`}
      />
      {source.data && !source.error && (
        <>
          <section className="citizen-receipt">
            <div className="citizen-receipt-check" aria-hidden="true">
              <Check size={38} strokeWidth={2} />
            </div>
            <p className="citizen-kicker">틈길 내부 접수</p>
            <h1 tabIndex={-1}>의견이 접수됐어요</h1>
            <p>
              알려 주셔서 고마워요.
              <br />
              확인 과정은 마이에서 볼 수 있어요.
            </p>
            <div className="citizen-receipt-record">
              <h2>{source.data.opinion.title}</h2>
              <dl>
                <div>
                  <dt>접수번호</dt>
                  <dd className="citizen-id">{source.data.opinion.id}</dd>
                </div>
                <div>
                  <dt>접수 시각</dt>
                  <dd>{prettyDate(source.data.opinion.createdAt)}</dd>
                </div>
                <div>
                  <dt>시장</dt>
                  <dd>{shortName(source.data.opinion.marketName)}</dd>
                </div>
                <div>
                  <dt>첨부</dt>
                  <dd>
                    {source.data.opinion.attachments.length
                      ? `비공개 사진 ${source.data.opinion.attachments.length}개`
                      : "첨부 없음"}
                  </dd>
                </div>
              </dl>
            </div>
            <Link href={`/opinions/${id}`} className="button button-primary">
              내 의견 보기 <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link
              href={`/markets/${source.data.opinion.marketId}`}
              className="citizen-receipt-return"
            >
              시장으로 돌아가기
            </Link>
            <p className="citizen-footnote">
              공식 민원으로 자동 접수되지 않아요.
            </p>
          </section>
          <OfficialGuidance />
        </>
      )}
    </div>
  );
}

function QuestionForm({
  question,
  opinionId,
  onSaved,
}: {
  question: OpinionQuestion;
  opinionId: string;
  onSaved: () => Promise<void>;
}) {
  const { user } = useSession();
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [fieldError, setFieldError] = useState("");
  const [success, setSuccess] = useState(false);
  const request = useRef<{ content: string; id: string } | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setFieldError("");
    setError(null);
    if (!content.trim()) {
      setFieldError("질문에 대한 답변을 적어 주세요.");
      document.getElementById(`answer-${question.id}`)?.focus();
      return;
    }
    setBusy(true);
    if (request.current?.content !== content)
      request.current = { content, id: crypto.randomUUID() };
    try {
      await api(`/api/opinions/${opinionId}/responses`, {
        method: "POST",
        headers: { "X-Teumgil-Account": user?.id ?? "" },
        body: {
          questionId: question.id,
          content,
          requestId: request.current.id,
        },
      });
      setSuccess(true);
      await onSaved();
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="citizen-question">
      <div className="citizen-question-heading">
        <MessageSquareText size={20} aria-hidden="true" />
        <h3>운영자의 질문</h3>
      </div>
      <p className="citizen-prewrap">{question.content}</p>
      <time dateTime={question.createdAt}>
        {prettyDate(question.createdAt)}
      </time>
      {question.responses.length ? (
        <div className="citizen-answers">
          {question.responses.map((response) => (
            <div key={response.id}>
              <p className="citizen-answer-label">
                <CheckCheck size={16} aria-hidden="true" />
                내가 보낸 추가 정보
              </p>
              <p className="citizen-prewrap">{response.content}</p>
              <time dateTime={response.createdAt}>
                {prettyDate(response.createdAt)}
              </time>
            </div>
          ))}
        </div>
      ) : success ? (
        <Notice variant="success">
          추가 정보를 보냈어요. 운영자가 별도로 확인해요.
        </Notice>
      ) : (
        <form onSubmit={submit}>
          <Field
            label="추가 정보"
            htmlFor={`answer-${question.id}`}
            error={fieldError}
            required
          >
            <textarea
              id={`answer-${question.id}`}
              className="textarea"
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={5000}
              disabled={busy}
              aria-invalid={!!fieldError}
              aria-describedby={
                fieldError ? `answer-${question.id}-error` : undefined
              }
            />
          </Field>
          {error && (
            <SaveError message={error.message} expired={error.status === 401} />
          )}
          <Button type="submit" loading={busy}>
            추가 정보 보내기
          </Button>
          <p className="citizen-subtle">
            답변을 보내도 처리 상태가 자동으로 바뀌지는 않아요.
          </p>
        </form>
      )}
    </section>
  );
}

export function OpinionDetailScreen({ id }: { id: string }) {
  const source = useApi<{ opinion: CitizenOpinion }>(
    `/api/opinions/${encodeURIComponent(id)}`,
  );
  const opinion = source.data?.opinion;
  return (
    <div className="citizen-page citizen-detail-page">
      <BackLink href="/my">내 의견 목록</BackLink>
      <ReadState
        loading={source.loading && !source.data}
        error={source.error}
        retry={source.reload}
        next={`/opinions/${id}`}
      />
      {opinion && !source.error && (
        <>
          <header className="citizen-detail-heading">
            <div>
              <span className="citizen-kicker">
                {shortName(opinion.marketName)}
              </span>
              <h1 tabIndex={-1}>{opinion.title}</h1>
              <p>
                <MapPin size={16} aria-hidden="true" />
                {opinion.location}
              </p>
            </div>
            <StatusBadge status={opinion.status} />
          </header>
          <p className="citizen-receipt-date">
            {prettyDate(opinion.createdAt)} 접수 · 틈길 내부 의견
          </p>
          <div className="citizen-detail-columns">
            <div>
              {opinion.questions.length > 0 && (
                <section
                  aria-labelledby="questions-title"
                  className="citizen-detail-section"
                >
                  <h2 id="questions-title">추가 확인</h2>
                  {opinion.questions.map((question) => (
                    <QuestionForm
                      key={question.id}
                      question={question}
                      opinionId={id}
                      onSaved={source.reload}
                    />
                  ))}
                </section>
              )}
              <section
                aria-labelledby="my-submission-title"
                className="citizen-detail-section"
              >
                <h2 id="my-submission-title">내가 전달한 내용</h2>
                <Panel className="citizen-submission">
                  <div className="citizen-section-heading">
                    <h3>{opinion.submission.title}</h3>
                    <span className="citizen-tag">직접 작성</span>
                  </div>
                  <p className="citizen-prewrap">
                    {opinion.submission.description}
                  </p>
                  {opinion.submission.request && (
                    <div className="citizen-request">
                      <h4>바라는 점</h4>
                      <p className="citizen-prewrap">
                        {opinion.submission.request}
                      </p>
                    </div>
                  )}
                  <dl className="citizen-original-details">
                    <div>
                      <dt>발견 시점</dt>
                      <dd>{opinion.original.observedAt || "입력하지 않음"}</dd>
                    </div>
                  </dl>
                  <details className="citizen-original-disclosure">
                    <summary>
                      <FileText size={16} aria-hidden="true" />
                      작성 원문 보기
                    </summary>
                    <p className="citizen-prewrap">
                      {opinion.original.situation}
                    </p>
                    <p>원문 위치: {opinion.original.location}</p>
                  </details>
                  {opinion.attachments.length > 0 && (
                    <div className="citizen-saved-attachments">
                      <h4>비공개 사진 · {opinion.attachments.length}개</h4>
                      <div className="citizen-photo-grid">
                        {opinion.attachments.map((attachment, index) => (
                          <a
                            key={attachment.id}
                            href={`/api/attachments/${attachment.id}`}
                            target="_blank"
                            rel="noopener"
                            aria-label={`첨부 사진 ${index + 1} 원본 열기`}
                            className="citizen-photo"
                          >
                            <Image
                              unoptimized
                              width={116}
                              height={116}
                              src={`/api/attachments/${attachment.id}`}
                              alt={`첨부 사진 ${index + 1}`}
                            />
                          </a>
                        ))}
                      </div>
                      <p className="citizen-subtle">
                        본인과 담당 운영자만 볼 수 있어요.
                      </p>
                    </div>
                  )}
                </Panel>
              </section>
            </div>
            <aside className="citizen-detail-section">
              <div className="citizen-section-heading">
                <h2>확인 과정</h2>
                <Button
                  variant="ghost"
                  onClick={() => void source.reload()}
                  loading={source.loading}
                >
                  새로고침
                </Button>
              </div>
              <p className="citizen-subtle">
                시민에게 공개된 기록을 보여 드려요.
              </p>
              {opinion.timeline.length ? (
                <ol className="citizen-timeline">
                  {opinion.timeline.map((event) => (
                    <li key={event.id}>
                      <span
                        className="citizen-timeline-dot"
                        aria-hidden="true"
                      />
                      <div>
                        <h3>{eventLabels[event.kind] ?? "공개된 확인 기록"}</h3>
                        {event.status && <StatusBadge status={event.status} />}
                        <p className="citizen-prewrap">{event.content}</p>
                        {event.correctsId && (
                          <p className="citizen-subtle">
                            앞선 기록을 정정한 내용이에요.
                          </p>
                        )}
                        {event.scheduledAt && (
                          <p className="citizen-timeline-detail">
                            <Clock3 size={14} aria-hidden="true" />
                            예정: {prettyDate(event.scheduledAt)}
                            {event.assignee ? ` · 담당 ${event.assignee}` : ""}
                          </p>
                        )}
                        {event.occurredAt && (
                          <p className="citizen-timeline-detail">
                            실제 확인: {prettyDate(event.occurredAt)}
                          </p>
                        )}
                        <time dateTime={event.createdAt}>
                          {prettyDate(event.createdAt)}
                        </time>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="citizen-footnote">
                  아직 공개된 확인 기록이 없어요.
                </p>
              )}
              <p className="citizen-id citizen-detail-id">
                접수번호 {opinion.id}
              </p>
            </aside>
          </div>
          <OfficialGuidance />
        </>
      )}
    </div>
  );
}
