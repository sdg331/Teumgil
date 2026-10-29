import type { Metadata, Viewport } from 'next';
import { AppShell } from '../components/app-shell';
import { SessionProvider } from '../components/session-provider';
import './globals.css';

export const metadata: Metadata = { title: { default: '틈길 — 시장과 이웃 사이', template: '%s · 틈길' }, description: '시장을 둘러보고 장을 준비해요. 시장에서 느낀 불편은 차분히 전하고, 함께 확인해요.' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#fffdf8' };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="ko"><body><SessionProvider><AppShell>{children}</AppShell></SessionProvider></body></html>; }
