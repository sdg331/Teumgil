'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, MapPin, ShoppingBasket, MessageSquare, LogOut, ArrowUpRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api, useSession } from '../lib/client';
import { Button, Modal, Notice } from './ui';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname(); const router = useRouter();
  const { user, loading, reload } = useSession();
  const [market, setMarket] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false); const [busy, setBusy] = useState(false); const [failure, setFailure] = useState('');
  const previous = useRef(pathname);
  useEffect(() => {
    const read = () => { try { setMarket(localStorage.getItem('teumgil:selected-market')); } catch { setMarket(null); } };
    read(); window.addEventListener('teumgil:market', read); window.addEventListener('storage', read);
    return () => { window.removeEventListener('teumgil:market', read); window.removeEventListener('storage', read); };
  }, []);
  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    const id = requestAnimationFrame(() => { document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true }); });
    return () => cancelAnimationFrame(id);
  }, [pathname]);
  const links = [
    { href: '/', label: '홈', icon: Home, active: pathname === '/' },
    { href: market ? `/markets/${encodeURIComponent(market)}` : '/?choose=market', label: '시장 찾기', icon: MapPin, active: /^\/(markets|stores)/.test(pathname) },
    { href: '/cart', label: '장바구니', icon: ShoppingBasket, active: pathname === '/cart' },
    { href: '/my', label: '내 의견', icon: MessageSquare, active: pathname === '/my' || pathname.startsWith('/opinions') },
  ];
  async function logout() {
    setBusy(true); setFailure('');
    try {
      const detail: { promises: Promise<unknown>[] } = { promises: [] };
      window.dispatchEvent(new CustomEvent('teumgil:before-leave', { detail }));
      await Promise.all(detail.promises);
      await api('/api/auth/sign-out', { method: 'POST', body: {} }); await reload(); setConfirm(false); router.push('/'); router.refresh();
    }
    catch { setFailure('입력 저장 또는 로그아웃을 확인하지 못했어요. 현재 화면을 유지했으니 연결을 확인한 뒤 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  }
  return <>
    <a className="skip-link" href="#main">본문으로 바로 가기</a>
    <header className="site-header"><div className="header-inner">
      <Link className="brand" href="/" aria-label="틈길 홈"><svg viewBox="0 0 32 32" width="32" height="32" fill="none" aria-hidden="true"><path d="M5 25V9a4 4 0 0 1 4-4h5v7H9v13M27 7v16a4 4 0 0 1-4 4h-5v-7h5V7" stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round" /></svg><span>틈길</span></Link>
      <span className="brand-purpose">시장과 이웃 사이</span>
      <nav className="desktop-nav" aria-label="주요 메뉴">{links.map(({ icon: Icon, ...link }) => <Link key={link.label} href={link.href} aria-current={link.active ? 'page' : undefined}><Icon size={17} aria-hidden="true" />{link.label}</Link>)}</nav>
      <div className="account-nav">{user ? <><span className="account-name">{user.name} 님</span>{user.role !== 'citizen' && <Link className="workspace-link" href={user.role === 'operator' ? '/operator' : '/merchant'}>{user.role === 'operator' ? '운영 공간' : '상인 공간'}<ArrowUpRight size={14} aria-hidden="true" /></Link>}<Button variant="ghost" aria-label="로그아웃" onClick={() => setConfirm(true)}><LogOut size={18} aria-hidden="true" /></Button></> : !loading && <Link className="login-link" href={`/login?next=${encodeURIComponent(pathname)}`}>로그인</Link>}</div>
    </div></header>
    <main id="main" className="app-main" tabIndex={-1}>{children}</main>
    <footer className="site-footer"><span className="footer-brand">틈길 <span>TEUMGIL</span></span><p>로컬솔루션데이 · 가상 자료로 체험하는 MVP</p><p>틈길의 의견 접수는 공식 신고와 별도로 진행돼요.</p></footer>
    <nav className="mobile-nav" aria-label="하단 메뉴">{links.map(({ icon: Icon, ...link }) => <Link key={link.label} href={link.href} aria-current={link.active ? 'page' : undefined}><Icon size={22} aria-hidden="true" /><span>{link.label}</span></Link>)}</nav>
    <Modal open={confirm} onClose={() => { if (!busy) setConfirm(false); }} title="로그아웃할까요?" description="저장하지 않은 입력이 있다면 먼저 저장해 주세요." footer={<><Button variant="secondary" disabled={busy} onClick={() => setConfirm(false)}>계속 이용하기</Button><Button loading={busy} onClick={() => void logout()}>로그아웃</Button></>}>{failure && <Notice variant="error">{failure}</Notice>}</Modal>
  </>;
}
