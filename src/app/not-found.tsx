import Link from 'next/link';
export default function NotFound() { return <section className="empty-state"><p className="eyebrow">페이지를 찾을 수 없어요</p><h1 tabIndex={-1}>다시 시장으로 돌아갈까요?</h1><p>주소가 올바른지 확인해 주세요.</p><div className="empty-action"><Link className="button button-primary" href="/">홈으로 가기</Link></div></section>; }
