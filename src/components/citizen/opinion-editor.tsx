"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, FileText, ImagePlus, LockKeyhole, X } from "lucide-react";
import { api, ApiError, useApi, useSession } from "../../lib/client";
import type {
  Attachment,
  CitizenOpinion,
  DraftContent,
  Identity,
  Market,
  OpinionDraft,
} from "../../lib/contracts";
import { Button, Field, Modal, Notice, PageHeading } from "../ui";
import { OfficialGuidance, ReadState, SaveError, shortName } from "./shared";
import {
  confirmDraft,
  forgetDraft,
  pendingDraft,
  preserveDraft,
  recoveredDraft,
} from "./draft-recovery";
import "./citizen.css";

const blank: DraftContent = {
  marketId: "",
  location: "",
  situation: "",
  observedAt: "",
  title: "",
  description: "",
  request: "",
  generationMode: "manual",
  attachmentIds: [],
};

function useDraft(initialMarket: string, initialLocation: string) {
  const router = useRouter();
  const [owner, setOwner] = useState("");
  const ownerId = useRef("");
  const [content, setContent] = useState<DraftContent>(blank);
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState<ApiError | null>(null);
  const [saveError, setSaveError] = useState<ApiError | null>(null);
  const [status, setStatus] = useState<"saved" | "saving" | "editing">("saved");
  const [restored, setRestored] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
  const [version, setVersion] = useState(0);
  const [revision, setRevision] = useState(0);
  const current = useRef(content);
  const persisted = useRef(JSON.stringify(blank));
  const serverVersion = useRef(0);
  const saving = useRef<Promise<number> | null>(null);
  const ready = useRef(false);
  useEffect(() => {
    let cancelled = false;
    ready.current = false;
    void api<{ user: Identity }>("/api/me")
      .then(async (identity) => {
        // A previous screen may still be flushing its last keystroke after browser Back.
        await recoveredDraft(identity.user.id)?.pending?.catch(() => {});
        const value = await api<{
          draft: OpinionDraft | null;
          version?: number;
        }>("/api/draft", {
          headers: { "X-Teumgil-Account": identity.user.id },
        });
        if (!cancelled) {
          ownerId.current = identity.user.id;
          setOwner(identity.user.id);
        }
        return value;
      })
      .then(({ draft, version: revisionVersion }) => {
        if (cancelled) return;
        const cached = recoveredDraft(ownerId.current);
        const persistedContent = draft?.content ?? blank;
        const same =
          cached &&
          JSON.stringify(cached.content) === JSON.stringify(persistedContent);
        if (same) forgetDraft(ownerId.current);
        const recovery = same ? undefined : cached;
        const next = recovery?.content ??
          draft?.content ?? {
            ...blank,
            marketId: initialMarket,
            location: initialLocation,
          };
        current.current = next;
        persisted.current = JSON.stringify(persistedContent);
        serverVersion.current =
          recovery?.version ?? draft?.version ?? revisionVersion ?? 0;
        setContent(next);
        setVersion(serverVersion.current);
        setRestored(Boolean(draft));
        setRecovered(Boolean(recovery));
        setHasSaved(Boolean(draft));
        setReadError(null);
        setSaveError(null);
        ready.current = true;
      })
      .catch((error) => {
        if (!cancelled) setReadError(error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialMarket, initialLocation, revision]);
  const save = useCallback(async () => {
    if (saving.current) return saving.current;
    const operation = async () => {
      try {
        while (JSON.stringify(current.current) !== persisted.current) {
          setStatus("saving");
          setSaveError(null);
          const snapshot = structuredClone(current.current);
          preserveDraft(
            ownerId.current,
            snapshot,
            serverVersion.current,
            saving.current,
          );
          const { draft } = await api<{ draft: OpinionDraft }>("/api/draft", {
            method: "PUT",
            keepalive: true,
            headers: { "X-Teumgil-Account": ownerId.current },
            body: { version: serverVersion.current, content: snapshot },
          });
          serverVersion.current = draft.version;
          persisted.current = JSON.stringify(snapshot);
          confirmDraft(ownerId.current, snapshot, draft.version);
          setVersion(draft.version);
          setHasSaved(true);
          setRecovered(false);
        }
        setStatus("saved");
        return serverVersion.current;
      } catch (error) {
        setSaveError(error as ApiError);
        setStatus("editing");
        throw error;
      }
    };
    const pending = operation();
    saving.current = pending;
    pendingDraft(ownerId.current, pending);
    try {
      return await pending;
    } finally {
      if (saving.current === pending) saving.current = null;
      if (recoveredDraft(ownerId.current)?.pending === pending)
        pendingDraft(ownerId.current, null);
    }
  }, []);
  useEffect(() => {
    if (!ready.current || JSON.stringify(content) === persisted.current) return;
    setStatus("editing");
    const timer = setTimeout(() => {
      void save().catch(() => {});
    }, 650);
    return () => clearTimeout(timer);
  }, [content, save]);
  useEffect(
    () => () => {
      if (
        ready.current &&
        JSON.stringify(current.current) !== persisted.current
      ) {
        preserveDraft(
          ownerId.current,
          current.current,
          serverVersion.current,
          saving.current,
        );
        void save().catch(() => {});
      }
    },
    [save],
  );
  useEffect(() => {
    function warn(event: BeforeUnloadEvent) {
      if (JSON.stringify(current.current) !== persisted.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  useEffect(() => {
    function navigate(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor = (event.target as Element | null)?.closest("a");
      if (
        !anchor ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download")
      )
        return;
      const url = new URL(anchor.href, window.location.href);
      if (
        url.origin !== window.location.origin ||
        (url.hash &&
          url.pathname === window.location.pathname &&
          url.search === window.location.search)
      )
        return;
      if (
        !ready.current ||
        JSON.stringify(current.current) === persisted.current
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      void save()
        .then(() => router.push(url.pathname + url.search + url.hash))
        .catch(() => {});
    }
    function beforeLeave(event: Event) {
      const detail = (event as CustomEvent<{ promises: Promise<unknown>[] }>)
        .detail;
      if (
        ready.current &&
        JSON.stringify(current.current) !== persisted.current
      )
        detail.promises.push(save());
    }
    document.addEventListener("click", navigate, true);
    window.addEventListener("teumgil:before-leave", beforeLeave);
    return () => {
      document.removeEventListener("click", navigate, true);
      window.removeEventListener("teumgil:before-leave", beforeLeave);
    };
  }, [router, save]);
  function change<K extends keyof DraftContent>(
    key: K,
    value: DraftContent[K],
  ) {
    const next = { ...current.current, [key]: value };
    current.current = next;
    if (JSON.stringify(next) === persisted.current)
      forgetDraft(ownerId.current);
    else
      preserveDraft(
        ownerId.current,
        next,
        serverVersion.current,
        saving.current,
      );
    setContent(next);
  }
  return {
    content,
    change,
    loading,
    readError,
    saveError,
    status,
    restored,
    recovered,
    hasSaved,
    version,
    save,
    owner,
    reload: (discardLocal = false) => {
      if (discardLocal) forgetDraft(ownerId.current);
      setLoading(true);
      setRevision((value) => value + 1);
    },
  };
}

export function OpinionEditor({ stage }: { stage: "write" | "review" }) {
  const router = useRouter();
  const { user } = useSession();
  const params = useSearchParams();
  const draft = useDraft(
    params.get("marketId") ?? "",
    params.get("location") ?? "",
  );
  const markets = useApi<{ markets: Market[] }>("/api/markets");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [fileError, setFileError] = useState("");
  const [confirmExit, setConfirmExit] = useState(false);
  const [confirmReload, setConfirmReload] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [failedFile, setFailedFile] = useState<File | null>(null);
  const uploadRequest = useRef<{ file: File; id: string } | null>(null);
  const staged = useApi<{ attachments: Attachment[] }>(
    draft.owner ? "/api/attachments" : null,
  );
  const unattached =
    staged.data?.attachments.filter(
      (file) => !draft.content.attachmentIds.includes(file.id),
    ) ?? [];
  const submitKey = useRef<{ fingerprint: string; key: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const c = draft.content;
  const currentMarket = markets.data?.markets.find(
    (market) => market.id === c.marketId,
  );
  const visibleError = error ?? draft.saveError;
  const identityChanged = !!(user && draft.owner && user.id !== draft.owner);
  function focusField(id: string) {
    requestAnimationFrame(() => document.getElementById(id)?.focus());
  }
  function valid(review = false) {
    const next: Record<string, string> = {};
    if (!c.marketId) next.marketId = "어느 시장에서 겪은 일인지 선택해 주세요.";
    if (!c.location.trim()) next.location = "위치를 설명해 주세요.";
    if (!c.situation.trim()) next.situation = "어떤 상황이었는지 적어 주세요.";
    if (review && !c.title.trim()) next.title = "의견의 제목을 적어 주세요.";
    if (review && !c.description.trim())
      next.description = "전달할 상황을 적어 주세요.";
    setErrors(next);
    const first = Object.keys(next)[0];
    if (first) focusField(`opinion-${first}`);
    return !first;
  }
  async function review(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!valid()) return;
    setBusy(true);
    try {
      await draft.save();
      router.push("/opinions/review");
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(false);
    }
  }
  async function backToWrite() {
    setBusy(true);
    try {
      await draft.save();
      router.push("/opinions/new");
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(false);
    }
  }
  async function leave() {
    setBusy(true);
    try {
      await draft.save();
      router.push(c.marketId ? `/markets/${c.marketId}` : "/");
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(false);
      setConfirmExit(false);
    }
  }
  async function upload(file: File) {
    setFailedFile(null);
    setFileError("");
    if (c.attachmentIds.length >= 3 && uploadRequest.current?.file !== file) {
      setFileError("사진은 최대 3개까지 첨부할 수 있어요.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setFileError(`${file.name}: 2MiB 이하의 사진을 선택해 주세요.`);
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setFileError(`${file.name}: JPEG, PNG, WebP 사진을 선택해 주세요.`);
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      if (uploadRequest.current?.file !== file)
        uploadRequest.current = { file, id: crypto.randomUUID() };
      form.set("requestId", uploadRequest.current.id);
      const result = await api<{ attachment: Attachment }>("/api/attachments", {
        method: "POST",
        headers: { "X-Teumgil-Account": draft.owner },
        body: form,
      });
      draft.change(
        "attachmentIds",
        Array.from(new Set([...c.attachmentIds, result.attachment.id])),
      );
      await draft.save();
      await staged.reload();
    } catch (e) {
      setFailedFile(file);
      setFileError(`${file.name}: ${(e as ApiError).message}`);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  async function removeAttachment(id: string) {
    setError(null);
    setUploading(true);
    try {
      draft.change(
        "attachmentIds",
        c.attachmentIds.filter((value) => value !== id),
      );
      await draft.save();
      await api(`/api/attachments/${id}`, {
        method: "DELETE",
        headers: { "X-Teumgil-Account": draft.owner },
      });
      await staged.reload();
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setUploading(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!valid(true)) return;
    if (!acknowledged) {
      setErrors((previous) => ({
        ...previous,
        acknowledged: "전달할 내용을 확인해 주세요.",
      }));
      focusField("opinion-confirm");
      return;
    }
    setBusy(true);
    try {
      const version = await draft.save();
      const fingerprint = JSON.stringify(c);
      const hash = Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(fingerprint),
          ),
        ),
      )
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
      const keyName = `teumgil:submission:${draft.owner}:${hash}`;
      if (submitKey.current?.fingerprint !== fingerprint) {
        let key: string | null = null;
        try {
          key = sessionStorage.getItem(keyName);
        } catch {}
        submitKey.current = { fingerprint, key: key ?? crypto.randomUUID() };
        try {
          sessionStorage.setItem(keyName, submitKey.current.key);
        } catch {}
      }
      const result = await api<{ opinion: CitizenOpinion }>("/api/opinions", {
        method: "POST",
        headers: { "X-Teumgil-Account": draft.owner },
        body: {
          idempotencyKey: submitKey.current.key,
          content: c,
          draftVersion: version,
        },
      });
      try {
        sessionStorage.removeItem(keyName);
      } catch {}
      router.replace(`/opinions/${result.opinion.id}/received`);
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`citizen-page ${stage === "write" ? "citizen-narrow" : "citizen-review-page"}`}
    >
      <div className="citizen-editor-top">
        <button
          type="button"
          className="citizen-back"
          onClick={() =>
            stage === "review" ? void backToWrite() : setConfirmExit(true)
          }
          disabled={busy}
        >
          {stage === "review" ? "← 원문 수정하기" : "← 시장으로 돌아가기"}
        </button>
        {!draft.loading && !draft.readError && (
          <span className="citizen-autosave" role="status">
            {draft.saveError
              ? "저장 필요"
              : draft.status === "saving"
                ? "초안 저장 중"
                : draft.status === "editing"
                  ? "입력 중"
                  : draft.hasSaved
                    ? "초안 저장됨"
                    : "입력하면 자동 저장"}
          </span>
        )}
      </div>
      <PageHeading
        eyebrow={stage === "write" ? "의견 작성 · 1 / 2" : "내용 확인 · 2 / 2"}
        title={
          stage === "write"
            ? "어떤 불편을 겪으셨나요?"
            : "전달할 내용을 확인해 주세요"
        }
        description={
          stage === "write"
            ? "위치와 상황을 알려 주세요. 함께 사용할 길을 살펴볼게요."
            : "원문을 살펴보고, 전달할 내용을 직접 정리해 주세요."
        }
      />
      <ReadState
        loading={draft.loading}
        error={draft.readError}
        retry={draft.reload}
        next={stage === "write" ? "/opinions/new" : "/opinions/review"}
      />
      {!draft.loading && !draft.readError && (
        <>
          {identityChanged && (
            <Notice variant="error">
              로그인 계정이 달라졌어요. 이 초안은 처음 작성한 계정의 내용이에요.
              처음 계정으로 로그인한 뒤 저장해 주세요.
            </Notice>
          )}
          {visibleError && (
            <SaveError
              message={
                visibleError.status === 409
                  ? "다른 화면에서 초안이 바뀌었어요. 지금 입력은 이 화면에 남아 있어요. 서버의 최신 초안을 확인한 후 다시 작성해 주세요."
                  : visibleError.message
              }
              expired={visibleError.status === 401}
            />
          )}{" "}
          {visibleError?.status === 409 && (
            <Button variant="secondary" onClick={() => setConfirmReload(true)}>
              최신 초안 불러오기
            </Button>
          )}
          {stage === "write" ? (
            <form onSubmit={review} noValidate>
              <div className="citizen-form-stack">
                {(draft.restored || draft.recovered) && (
                  <p className="citizen-restored">
                    <FileText size={16} aria-hidden="true" />
                    {draft.recovered
                      ? "이 탭에 남아 있던 미저장 입력을 복원했어요. 다시 저장해 주세요."
                      : "계정에 저장된 작성 중 의견을 불러왔어요."}
                  </p>
                )}
                <Field
                  htmlFor="opinion-marketId"
                  label="시장"
                  required
                  error={errors.marketId}
                >
                  <select
                    id="opinion-marketId"
                    className="select"
                    value={c.marketId}
                    onChange={(e) => {
                      draft.change("marketId", e.target.value);
                      draft.change("location", "");
                    }}
                    aria-invalid={!!errors.marketId}
                    aria-describedby={
                      errors.marketId ? "opinion-marketId-error" : undefined
                    }
                    disabled={busy}
                  >
                    <option value="">시장을 선택해 주세요</option>
                    {markets.data?.markets.map((market) => (
                      <option value={market.id} key={market.id}>
                        {market.name}
                      </option>
                    ))}
                  </select>
                  {markets.error && (
                    <p className="citizen-field-error">
                      시장 목록을 불러오지 못했어요.{" "}
                      <button
                        type="button"
                        onClick={() => void markets.reload()}
                      >
                        다시 불러오기
                      </button>
                    </p>
                  )}
                </Field>
                <Field
                  htmlFor="opinion-location"
                  label="어디에서 겪으셨나요?"
                  required
                  error={errors.location}
                  hint="입구, 골목, 주변 점포처럼 찾을 수 있는 단서를 적어 주세요."
                >
                  <input
                    id="opinion-location"
                    className="input"
                    value={c.location}
                    onChange={(e) => draft.change("location", e.target.value)}
                    placeholder="예: 시장 입구에서 안쪽으로 들어가는 길"
                    maxLength={500}
                    aria-invalid={!!errors.location}
                    aria-describedby={
                      errors.location
                        ? "opinion-location-hint opinion-location-error"
                        : "opinion-location-hint"
                    }
                    disabled={busy}
                  />
                </Field>
                <Field
                  htmlFor="opinion-situation"
                  label="어떤 상황이었나요?"
                  required
                  error={errors.situation}
                  hint="직접 겪은 상황을 편하게 적어 주세요."
                >
                  <textarea
                    id="opinion-situation"
                    className="textarea"
                    rows={6}
                    value={c.situation}
                    onChange={(e) => draft.change("situation", e.target.value)}
                    placeholder="어떤 점이 불편했는지 알려 주세요."
                    maxLength={5000}
                    aria-invalid={!!errors.situation}
                    aria-describedby={
                      errors.situation
                        ? "opinion-situation-hint opinion-situation-error"
                        : "opinion-situation-hint"
                    }
                    disabled={busy}
                  />
                  <span className="citizen-input-count">
                    {c.situation.length.toLocaleString()} / 5,000
                  </span>
                </Field>
                <Field
                  htmlFor="opinion-observedAt"
                  label="발견한 시점"
                  hint="선택 · 모르면 비워 두셔도 돼요."
                >
                  <input
                    id="opinion-observedAt"
                    aria-describedby="opinion-observedAt-hint"
                    className="input"
                    value={c.observedAt}
                    onChange={(e) => draft.change("observedAt", e.target.value)}
                    maxLength={200}
                    placeholder="예: 어제 오후, 10월 29일 저녁"
                    disabled={busy}
                  />
                </Field>
                <section
                  className="citizen-photo-section"
                  aria-labelledby="photo-title"
                >
                  <div className="citizen-section-heading">
                    <h2 id="photo-title">
                      사진 <span className="citizen-optional">선택</span>
                    </h2>
                    <span className="citizen-count">
                      {c.attachmentIds.length} / 3
                    </span>
                  </div>
                  <p className="citizen-subtle">
                    JPEG·PNG·WebP, 사진당 2MiB 이하. 사진 없이도 접수할 수
                    있어요.
                  </p>
                  <div className="citizen-photo-grid">
                    {c.attachmentIds.map((id, index) => (
                      <div className="citizen-photo" key={id}>
                        {/* Authorized endpoint validates every image request. */}
                        <Image
                          unoptimized
                          width={116}
                          height={116}
                          src={`/api/attachments/${id}`}
                          alt={`첨부한 사진 ${index + 1}`}
                        />
                        <button
                          type="button"
                          onClick={() => void removeAttachment(id)}
                          disabled={uploading || busy}
                          aria-label={`사진 ${index + 1} 제거`}
                        >
                          <X size={16} aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                    {c.attachmentIds.length < 3 && (
                      <button
                        className="citizen-photo-add"
                        type="button"
                        onClick={() => fileInput.current?.click()}
                        disabled={uploading || busy}
                      >
                        <ImagePlus size={25} aria-hidden="true" />
                        <span>{uploading ? "처리 중" : "사진 선택"}</span>
                      </button>
                    )}
                  </div>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    tabIndex={-1}
                    aria-label="첨부할 사진"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void upload(file);
                    }}
                  />
                  {unattached.length > 0 && (
                    <div className="citizen-upload-recovery">
                      <h3>아직 연결하지 않은 사진</h3>
                      <p className="citizen-subtle">
                        이 계정에서 업로드한 사진이에요. 이번 의견에 넣거나
                        삭제할 수 있어요.
                      </p>
                      {unattached.map((file, index) => (
                        <div
                          className="citizen-upload-recovery-row"
                          key={file.id}
                        >
                          <Image
                            unoptimized
                            width={56}
                            height={56}
                            src={`/api/attachments/${file.id}`}
                            alt={`미연결 사진 ${index + 1}`}
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={uploading || c.attachmentIds.length >= 3}
                            onClick={() =>
                              draft.change("attachmentIds", [
                                ...c.attachmentIds,
                                file.id,
                              ])
                            }
                          >
                            의견에 넣기
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={uploading}
                            onClick={() => void removeAttachment(file.id)}
                          >
                            삭제
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  {fileError && (
                    <Notice variant="error">
                      <p>{fileError}</p>
                      {failedFile && (
                        <div className="citizen-form-actions">
                          <Button
                            variant="secondary"
                            onClick={() => void upload(failedFile)}
                            disabled={uploading}
                          >
                            다시 시도
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => {
                              setFailedFile(null);
                              setFileError("");
                            }}
                          >
                            이 사진 없이 계속
                          </Button>
                        </div>
                      )}
                    </Notice>
                  )}
                  <p className="citizen-private-note">
                    <LockKeyhole size={14} aria-hidden="true" />
                    사진은 본인과 담당 운영자만 볼 수 있어요. 상인에게 전달하지
                    않아요.
                  </p>
                </section>
                <div className="citizen-ai-note">
                  <p>
                    <strong>직접 작성으로 이어가요</strong>
                  </p>
                  <p>
                    AI 정리는 아직 연결되지 않았어요. 다음 화면에서 원문을 보며
                    내용을 정리할 수 있어요.
                  </p>
                </div>
                <div className="citizen-editor-footer">
                  <p>
                    아직 접수하지 않아요. 다음 화면에서 확인한 뒤 직접 제출해
                    주세요.
                  </p>
                  <Button type="submit" loading={busy} disabled={uploading}>
                    내용 검토하기 <ArrowRight size={18} aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </form>
          ) : (
            <form onSubmit={submit} noValidate>
              <div className="citizen-review-columns">
                <aside className="citizen-original">
                  <div className="citizen-section-heading">
                    <h2>내가 적은 원문</h2>
                    <span className="citizen-tag">직접 작성</span>
                  </div>
                  <dl className="citizen-original-details">
                    <div>
                      <dt>시장</dt>
                      <dd>
                        {currentMarket
                          ? shortName(currentMarket.name)
                          : c.marketId || "선택 필요"}
                      </dd>
                    </div>
                    <div>
                      <dt>위치</dt>
                      <dd>{c.location || "입력 필요"}</dd>
                    </div>
                    <div>
                      <dt>발견 시점</dt>
                      <dd>{c.observedAt || "입력하지 않음"}</dd>
                    </div>
                  </dl>
                  <p className="citizen-original-text">
                    {c.situation || "아직 적은 상황이 없어요."}
                  </p>
                  {c.attachmentIds.length > 0 && (
                    <p className="citizen-private-note">
                      <LockKeyhole size={14} aria-hidden="true" />
                      사진 {c.attachmentIds.length}개 첨부 · 비공개
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => void backToWrite()}
                    disabled={busy}
                    className="text-link"
                  >
                    원문·위치·사진 수정
                  </button>
                </aside>
                <section
                  className="citizen-form-stack"
                  aria-labelledby="submission-title"
                >
                  <h2 id="submission-title">전달할 내용</h2>
                  <Field
                    label="의견 제목"
                    htmlFor="opinion-title"
                    required
                    error={errors.title}
                  >
                    <input
                      id="opinion-title"
                      className="input"
                      value={c.title}
                      onChange={(e) => {
                        draft.change("title", e.target.value);
                        setAcknowledged(false);
                      }}
                      maxLength={120}
                      placeholder="어떤 불편인지 짧게 적어 주세요"
                      disabled={busy}
                      aria-invalid={!!errors.title}
                      aria-describedby={
                        errors.title ? "opinion-title-error" : undefined
                      }
                    />
                  </Field>
                  <Field
                    label="상황 설명"
                    htmlFor="opinion-description"
                    required
                    error={errors.description}
                  >
                    <textarea
                      id="opinion-description"
                      className="textarea"
                      rows={7}
                      value={c.description}
                      onChange={(e) => {
                        draft.change("description", e.target.value);
                        setAcknowledged(false);
                      }}
                      maxLength={5000}
                      placeholder="원문을 바탕으로 전달할 상황을 적어 주세요."
                      disabled={busy}
                      aria-invalid={!!errors.description}
                      aria-describedby={
                        errors.description
                          ? "opinion-description-error"
                          : undefined
                      }
                    />
                  </Field>
                  {!c.description && c.situation && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => draft.change("description", c.situation)}
                    >
                      원문을 상황 설명에 가져오기
                    </Button>
                  )}
                  <Field
                    label="바라는 점"
                    htmlFor="opinion-request"
                    hint="선택 · 확인해 주었으면 하는 점이 있다면 적어 주세요."
                  >
                    <textarea
                      id="opinion-request"
                      aria-describedby="opinion-request-hint"
                      className="textarea"
                      rows={3}
                      value={c.request}
                      onChange={(e) => {
                        draft.change("request", e.target.value);
                        setAcknowledged(false);
                      }}
                      maxLength={2000}
                      disabled={busy}
                    />
                  </Field>
                  {(errors.marketId || errors.location || errors.situation) && (
                    <Notice variant="error">
                      <p>시장·위치·원문을 먼저 작성해 주세요.</p>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => void backToWrite()}
                      >
                        원문 작성으로 돌아가기
                      </Button>
                    </Notice>
                  )}
                  <div className="citizen-submit-note">
                    <h3>틈길 내부에 접수돼요</h3>
                    <p>
                      작성한 내용은 틈길에 전달되며 공식 민원으로 자동 접수되지
                      않아요. 상인에게 필요한 내용을 전달할 때는 운영자가 별도로
                      확인해요.
                    </p>
                  </div>
                  <label className="citizen-confirm-check">
                    <input
                      id="opinion-confirm"
                      type="checkbox"
                      checked={acknowledged}
                      onChange={(e) => setAcknowledged(e.target.checked)}
                      disabled={busy}
                    />
                    <span>위치와 전달할 내용을 확인했어요.</span>
                  </label>
                  {errors.acknowledged && !acknowledged && (
                    <p className="citizen-field-error" role="alert">
                      {errors.acknowledged}
                    </p>
                  )}
                  <Button type="submit" loading={busy} disabled={uploading}>
                    틈길에 알리기 <ArrowRight size={18} aria-hidden="true" />
                  </Button>
                </section>
              </div>
            </form>
          )}
          <OfficialGuidance />
        </>
      )}
      <Modal
        open={confirmExit}
        onClose={() => setConfirmExit(false)}
        title="작성한 내용은 초안으로 남겨 둘까요?"
        description="계정에 저장한 뒤 시장으로 돌아가요. 다음에 의견 작성에서 이어 쓸 수 있어요."
      >
        <div className="citizen-form-actions">
          <Button variant="secondary" onClick={() => setConfirmExit(false)}>
            계속 작성하기
          </Button>
          <Button loading={busy} onClick={leave}>
            저장하고 나가기
          </Button>
        </div>
      </Modal>
      <Modal
        open={confirmReload}
        onClose={() => setConfirmReload(false)}
        title="서버의 최신 초안을 불러올까요?"
        description="이 화면에서 아직 저장하지 못한 입력은 바뀌어요. 필요한 내용은 먼저 따로 복사해 두세요."
      >
        <div className="citizen-form-actions">
          <Button variant="secondary" onClick={() => setConfirmReload(false)}>
            지금 입력 유지
          </Button>
          <Button
            onClick={() => {
              setConfirmReload(false);
              setError(null);
              draft.reload(true);
            }}
          >
            최신 초안 불러오기
          </Button>
        </div>
      </Modal>
    </div>
  );
}
