'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { api, ApiError, safeNext, useSession } from '../lib/client';
import { Button, Field, Notice } from './ui';

const authMessages: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: '이메일 또는 비밀번호를 확인해 주세요.',
  USER_ALREADY_EXISTS: '이미 가입한 이메일이에요. 로그인해 주세요.',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: '이미 가입한 이메일이에요. 로그인해 주세요.',
  PASSWORD_TOO_SHORT: '비밀번호는 12자 이상으로 입력해 주세요.',
  TOO_MANY_REQUESTS: '잠시 요청이 많아요. 잠깐 기다린 뒤 다시 시도해 주세요.',
};
export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const signup = mode === 'signup'; const params = useSearchParams(); const router = useRouter(); const { reload } = useSession();
  const next = safeNext(params.get('next'));
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [show, setShow] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [fields, setFields] = useState<Record<string, string>>({});
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const issues: Record<string, string> = {};
    if (signup && !name.trim()) issues.name = '화면에서 사용할 이름을 입력해 주세요.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) issues.email = '이메일 주소를 확인해 주세요.';
    if (password.length < 12 || password.length > 128) issues.password = '비밀번호는 12~128자로 입력해 주세요.';
    setFields(issues); setError('');
    if (Object.keys(issues).length) { document.getElementById(Object.keys(issues)[0])?.focus(); return; }
    setBusy(true);
    try {
      await api(signup ? '/api/auth/sign-up/email' : '/api/auth/sign-in/email', { method: 'POST', body: { email: email.trim(), password, ...(signup ? { name: name.trim() } : {}), callbackURL: next } });
      await reload(); router.replace(next); router.refresh();
    } catch (cause) {
      const failure = cause instanceof ApiError ? cause : null;
      setError(failure?.status === 429 ? '요청이 많아요. 잠시 기다린 뒤 다시 시도해 주세요.' : failure?.code && authMessages[failure.code] ? authMessages[failure.code] : failure?.status === 0 ? failure.message : signup ? '가입을 완료하지 못했어요. 이미 가입했다면 로그인해 주세요.' : '로그인하지 못했어요. 이메일과 비밀번호를 확인해 주세요.');
    } finally { setBusy(false); }
  }
  return <div className="auth-page"><section className="auth-intro"><p className="eyebrow">시장과 이웃 사이, 틈길</p><h1 tabIndex={-1}>{signup ? <>우리 동네 시장을<br />함께 살펴봐요</> : <>반가워요.<br />이어서 이용해요</>}</h1><p>{signup ? '장을 준비하고, 시장에서 느낀 작은 불편을 차분히 전해요.' : '다른 기기에서도 같은 장바구니와 내 의견을 확인할 수 있어요.'}</p><div className="auth-principle">의견은 본인과 담당 운영자가 확인해요.<br />상인에게는 확인에 필요한 요약만 전달돼요.</div></section><form className="auth-form" onSubmit={submit} noValidate aria-busy={busy}>{error && <Notice variant="error">{error}</Notice>}
    {signup && <Field label="이름" htmlFor="name" error={fields.name} required><input className="input" id="name" autoComplete="nickname" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!fields.name} aria-describedby={fields.name ? 'name-error' : undefined} disabled={busy} /></Field>}
    <Field label="이메일" htmlFor="email" error={fields.email} required><input className="input" id="email" type="email" inputMode="email" autoComplete="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!fields.email} aria-describedby={fields.email ? 'email-error' : undefined} disabled={busy} placeholder="name@example.com" /></Field>
    <Field label="비밀번호" htmlFor="password" hint={signup ? '12~128자로 입력해 주세요.' : undefined} error={fields.password} required><div className="password-control"><input className="input" id="password" type={show ? 'text' : 'password'} autoComplete={signup ? 'new-password' : 'current-password'} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!fields.password} aria-describedby={fields.password ? 'password-error' : signup ? 'password-hint' : undefined} disabled={busy} /><button type="button" aria-label={show ? '비밀번호 숨기기' : '비밀번호 보기'} aria-pressed={show} onClick={() => setShow(!show)}>{show ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}</button></div></Field>
    {signup && <p className="auth-note">현재는 가상 자료로 체험하는 MVP예요. 실제 개인정보나 민감한 의견을 입력하지 말아 주세요. 이메일 인증·비밀번호 재설정 메일은 아직 제공하지 않아요.</p>}
    <Button loading={busy} type="submit">{busy ? (signup ? '계정을 만들고 있어요' : '로그인하고 있어요') : signup ? '시작하기' : '로그인'}{!busy && <ArrowRight size={18} aria-hidden="true" />}</Button>
    <p className="auth-switch">{signup ? '이미 계정이 있나요?' : '틈길이 처음인가요?'}{' '}<Link href={`/${signup ? 'login' : 'signup'}?next=${encodeURIComponent(next)}`}>{signup ? '로그인' : '가입하기'}</Link></p>
    {!signup && <p className="auth-note">비밀번호 재설정 메일은 아직 제공하지 않아요. 시연 계정은 프로젝트 관리 명령으로 다시 준비할 수 있어요.</p>}
  </form></div>;
}
