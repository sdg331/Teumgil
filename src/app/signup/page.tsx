import { Suspense } from 'react';
import { AuthForm } from '../../components/auth-form';
export const metadata = { title: '가입하기' };
export default function Signup() { return <Suspense fallback={<p>가입 화면을 준비하고 있어요.</p>}><AuthForm mode="signup" /></Suspense>; }
