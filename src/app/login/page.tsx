import { Suspense } from 'react';
import { AuthForm } from '../../components/auth-form';
export const metadata = { title: '로그인' };
export default function Login() { return <Suspense fallback={<p>로그인 화면을 준비하고 있어요.</p>}><AuthForm mode="login" /></Suspense>; }
