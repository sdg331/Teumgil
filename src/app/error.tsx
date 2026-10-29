'use client';
import { Button, Notice } from '../components/ui';
export default function ErrorPage({ reset }: { reset: () => void }) { return <section><h1 tabIndex={-1}>화면을 불러오지 못했어요</h1><Notice variant="error"><p>잠시 후 다시 시도해 주세요. 서버에 저장된 내용은 그대로 남아 있어요.</p><Button onClick={reset}>다시 불러오기</Button></Notice></section>; }
