import { chromium } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Public reference evidence only. Do not point this at authenticated or user-data pages.
const references = [
  { id: 'toss-search', brand: 'toss', url: 'https://tossmini-docs.toss.im/tds-mobile/components/search-field/', kind: '공식 컴포넌트 예제', mode: 'main' },
  { id: 'toss-list', brand: 'toss', url: 'https://tossmini-docs.toss.im/tds-mobile/components/ListRow/list-row-components/', kind: '공식 컴포넌트 예제', mode: 'list-demo' },
  { id: 'toss-field', brand: 'toss', url: 'https://tossmini-docs.toss.im/tds-mobile/components/TextField/text-field/', kind: '공식 컴포넌트 예제', mode: 'main' },
  { id: 'toss-sheet', brand: 'toss', url: 'https://tossmini-docs.toss.im/tds-mobile/components/bottom-sheet/', kind: '공식 컴포넌트 실행 예제', mode: 'open-sheet' },
  { id: 'toss-result', brand: 'toss', url: 'https://tossmini-docs.toss.im/tds-mobile/components/result/', kind: '공식 컴포넌트 예제', mode: 'main' },
  { id: 'gov-check', brand: 'govuk', url: 'https://design-system.service.gov.uk/patterns/check-answers/default/', kind: '공식 패턴의 실행 예제', mode: 'main' },
  { id: 'gov-confirm', brand: 'govuk', url: 'https://design-system.service.gov.uk/patterns/confirmation-pages/default/', kind: '공식 패턴의 실행 예제', mode: 'main' },
  { id: 'moj-timeline', brand: 'govuk', url: 'https://design-patterns.service.justice.gov.uk/components/timeline/examples/default/', kind: '공식 패턴의 실행 예제', mode: 'main' },
  { id: 'linear-triage', brand: 'linear.app', url: 'https://linear.app/docs/triage', kind: '공식 문서에 게시된 제품 이미지', mode: 'large-image', alt: 'Triage' },
  { id: 'naver-map', brand: 'naver', url: 'https://apps.apple.com/kr/app/naver-map-navigation/id311867728', kind: '개발사 게시 App Store 홍보 화면', mode: 'naver-gallery' }
];
const root = resolve('assets/_reference');
const browser = await chromium.launch();
const only = process.argv.find(arg => arg.startsWith('--only='))?.slice(7).split(',');
const previous = await readFile(resolve(root, 'capture-index.json'), 'utf8').then(JSON.parse).catch(() => ({ references: [] }));
const results = previous.references.filter(ref => !references.some(next => next.id === ref.id && (!only || only.includes(next.id))));
for (const ref of references.filter(ref => !only || only.includes(ref.id))) {
  const dir = resolve(root, ref.brand);
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, 'LICENSE-NOTE.md'), '# 연구용 참고 화면\n\n원본 권리는 각 사이트와 게시자에게 있습니다. 공개 페이지의 구조를 검토하는 내부 자료이며 제품 에셋·로고·카피로 재배포하지 않습니다. 재사용 허락을 취득했다는 의미가 아닙니다. 캡처 시각·URL·범위는 capture-index.json에 기록합니다.\n');
  const record = { ...ref, viewport: { width: 1280, height: 900 }, deviceScaleFactor: ref.mode === 'naver-gallery' ? 2 : 1, capturedAt: new Date().toISOString() };
  const page = await browser.newPage({ viewport: record.viewport, deviceScaleFactor: record.deviceScaleFactor });
  try {
    const robotsURL = new URL('/robots.txt', ref.url).href;
    const robots = await fetch(robotsURL, { signal: AbortSignal.timeout(15000) });
    const robotsText = robots.ok ? await robots.text() : '';
    record.robots = { url: robotsURL, status: robots.status };
    if (!robots.ok && robots.status !== 404) throw new Error('robots could not be checked');
    let star = false;
    const pathname = new URL(ref.url).pathname;
    for (const line of robotsText.split(/\r?\n/)) {
      const match = /^\s*(user-agent|disallow)\s*:\s*([^#]*)/i.exec(line);
      if (!match) continue;
      if (match[1].toLowerCase() === 'user-agent') star = match[2].trim() === '*';
      else if (star && match[2].trim()) {
        const pattern = match[2].trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*');
        if (new RegExp('^' + pattern).test(pathname)) throw new Error('robots disallows this path');
      }
    }
    const response = await page.goto(ref.url, { waitUntil: 'domcontentloaded', timeout: 35000 });
    if (!response?.ok()) throw new Error('page status ' + response?.status());
    await page.waitForTimeout(1200);
    record.resolvedURL = page.url();
    record.title = await page.title();
    const cookieReject = page.getByRole('button', { name: 'Reject analytics cookies', exact: true });
    if (await cookieReject.isVisible()) await cookieReject.click();
    const shots = [];
    if (ref.mode === 'open-sheet') {
      await page.getByRole('button', { name: 'BottomSheet 열기', exact: true }).first().click();
      await page.waitForTimeout(400);
      record.interaction = 'clicked first BottomSheet 열기 button';
    }
    if (ref.mode === 'naver-gallery') {
      const images = page.locator('img');
      const candidates = await images.evaluateAll(es => es.map((e, i) => ({ i, src: e.currentSrc, w: e.width, h: e.height })).filter(e => e.src.includes('PurpleSource') && e.h > 350));
      for (const [n, candidate] of candidates.slice(0, 3).entries()) {
        const filename = ref.id + '-' + (n + 1) + '.png';
        await images.nth(candidate.i).screenshot({ path: resolve(dir, filename) });
        shots.push({ file: 'assets/_reference/' + ref.brand + '/' + filename, scope: 'App Store gallery image ' + (n + 1), sourceImage: candidate.src });
      }
      if (!shots.length) throw new Error('No visible gallery images');
    } else if (ref.mode === 'large-image') {
      const images = page.locator('img');
      const index = await images.evaluateAll((es, alt) => es.findIndex(e => e.alt === alt && e.width > 400), ref.alt);
      if (index < 0) throw new Error('Published product image missing');
      const filename = ref.id + '.png';
      await images.nth(index).screenshot({ path: resolve(dir, filename) });
      shots.push({ file: 'assets/_reference/' + ref.brand + '/' + filename, scope: 'published product image; alt=' + ref.alt });
    } else if (ref.mode === 'list-demo') {
      const target = page.locator('.preview').filter({ has: page.locator('[data-tds-mobile-component="ListRowTexts"]') }).first();
      const filename = ref.id + '.png';
      await target.screenshot({ path: resolve(dir, filename) });
      shots.push({ file: 'assets/_reference/' + ref.brand + '/' + filename, scope: 'first .preview containing ListRowTexts (live example)' });
    } else {
      const target = (await page.locator('main').count() ? page.locator('main') : page.locator('body')).first();
      await target.scrollIntoViewIfNeeded();
      const box = await target.boundingBox();
      if (!box) throw new Error('Reference region not visible');
      const filename = ref.id + '.png';
      await page.screenshot({ path: resolve(dir, filename), clip: { x: Math.max(0,box.x), y: Math.max(0,box.y), width: Math.min(box.width,1280), height: Math.min(box.height,1000) } });
      shots.push({ file: 'assets/_reference/' + ref.brand + '/' + filename, scope: 'main region, first up to 1000 CSS px', bounds: box });
    }
    record.status = 'captured'; record.shots = shots;
  } catch (error) { record.status = 'unavailable'; record.reason = error.message; }
  finally { await page.close(); }
  results.push(record);
  console.log(ref.id + ': ' + record.status + (record.reason ? ' (' + record.reason + ')' : ''));
}
await browser.close();
await writeFile(resolve(root, 'capture-index.json'), JSON.stringify({ capturedAt: new Date().toISOString(), references: results }, null, 2) + '\n');
console.log('Local research evidence: assets/_reference/capture-index.json');
if (results.some(ref => ref.status !== 'captured')) process.exitCode = 1;
