"use client";

import Link from "next/link";
import { ArrowLeft, ArrowUpRight, LogIn, MapPin } from "lucide-react";
import { EmptyState, Notice, Button, Skeleton } from "../ui";
import { ApiError } from "../../lib/client";

export function prettyDate(value: string | null) {
  if (!value) return "미확인";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "미확인";
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(date);
}

export function shortName(name: string) {
  return name.replace(/\s*\(가상\)$/, "");
}

export function rememberMarket(id: string) {
  try {
    localStorage.setItem("teumgil:selected-market", id);
  } catch {
    /* Browsing remains available without storage. */
  }
  window.dispatchEvent(new CustomEvent("teumgil:market", { detail: id }));
}

export function selectedMarket() {
  try {
    return localStorage.getItem("teumgil:selected-market");
  } catch {
    return null;
  }
}

export function ReadState({
  loading,
  error,
  retry,
  next,
}: {
  loading: boolean;
  error: ApiError | null;
  retry: () => void;
  next: string;
}) {
  if (loading)
    return (
      <div aria-busy="true">
        <span className="sr-only">내용을 불러오고 있어요.</span>
        <Skeleton rows={3} />
      </div>
    );
  if (error?.status === 401)
    return (
      <EmptyState
        icon={<LogIn size={30} />}
        title="로그인하고 이어서 이용해요"
        description="내 장바구니와 의견은 계정에 안전하게 보관돼요."
        action={
          <Link
            className="button button-primary"
            href={`/login?next=${encodeURIComponent(next)}`}
          >
            로그인하기
          </Link>
        }
      />
    );
  if (error?.status === 404 || error?.status === 403)
    return (
      <EmptyState
        title="이 내용을 열 수 없어요"
        description="주소를 확인하거나 본인의 계정으로 다시 로그인해 주세요."
        action={
          <Link className="button button-secondary" href="/">
            홈으로 가기
          </Link>
        }
      />
    );
  if (error)
    return (
      <Notice variant="error" title="내용을 불러오지 못했어요">
        <p>{error.message}</p>
        <Button variant="secondary" onClick={retry}>
          다시 불러오기
        </Button>
      </Notice>
    );
  return null;
}

export function SaveError({
  message,
  expired,
}: {
  message: string;
  expired?: boolean;
}) {
  return (
    <Notice variant="error">
      <p>{message}</p>
      {expired && (
        <p>
          <Link
            href="/login"
            target="_blank"
            rel="noopener"
            className="text-link"
          >
            새 탭에서 로그인하기
          </Link>
          <span> · 로그인 후 이 화면에서 다시 저장해 주세요.</span>
        </p>
      )}
    </Notice>
  );
}

export function OfficialGuidance() {
  return (
    <aside className="citizen-official" aria-label="별도 공식 신고 안내">
      <h2>공식 신고가 필요하신가요?</h2>
      <p>
        틈길의 확인을 기다리지 않고 별도 창구를 이용할 수 있어요. 외부 창구에서
        요건을 확인하고 직접 제출해 주세요.
      </p>
      <a
        href="https://www.epeople.go.kr"
        target="_blank"
        rel="noopener noreferrer"
        className="text-link"
      >
        국민신문고 이용하기 <ArrowUpRight size={15} aria-hidden="true" />
      </a>
      <p className="citizen-emergency">
        즉각적인 긴급 위험이 있다면 틈길 처리를 기다리지 말고 119 또는 112에
        연락해 주세요.
      </p>
    </aside>
  );
}

export function BackLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className="citizen-back">
      <ArrowLeft size={17} aria-hidden="true" />
      {children}
    </Link>
  );
}

export function SampleNote({ compact = false }: { compact?: boolean }) {
  return (
    <p className={compact ? "citizen-sample compact" : "citizen-sample"}>
      <MapPin size={14} aria-hidden="true" />
      {compact ? "가상 자료" : "시연을 위해 만든 가상 시장과 점포예요."}
    </p>
  );
}
