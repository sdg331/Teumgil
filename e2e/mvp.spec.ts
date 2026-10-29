import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';

type Person = { role: string; email: string; password: string };
const base = process.env.TEUMGIL_E2E_URL ?? 'http://localhost:3000';
const registry = JSON.parse(await readFile('.harness/demo-accounts.json', 'utf8')) as { synthetic: boolean; accounts: Person[] };
if (!registry.synthetic) throw new Error('Only synthetic demo accounts may be used by the browser suite.');

async function session(browser: Browser, role: string) {
  const person = registry.accounts.find(p => p.role === role)!;
  const context = await browser.newContext({ baseURL: base, viewport: { width: 1440, height: 1000 }, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
  const page = await context.newPage();
  await page.goto('/login'); await page.getByLabel('이메일', { exact: false }).fill(person.email); await page.locator('#password').fill(person.password);
  await page.getByRole('button', { name: '로그인', exact: true }).click(); await expect(page).toHaveURL(base + '/');
  return { context, page };
}
async function get(context: BrowserContext, path: string) { const response = await context.request.get(path); expect(response.ok(), await response.text()).toBeTruthy(); return response.json(); }
async function confirm(page: Page, name = '확인하고 저장하기') { const modal = page.getByRole('dialog'); await expect(modal).toBeVisible(); await modal.getByRole('button', { name, exact: true }).click(); await expect(modal).not.toBeVisible(); }

test('시민 → 운영자 → 상인 → 시민: 같은 의견의 저장·최소 전달·검토 후 게시', async ({ browser }) => {
  const citizen = await session(browser, 'citizen'); const operator = await session(browser, 'operator'); const merchant = await session(browser, 'merchant');
  const p = citizen.page; const o = operator.page; const m = merchant.page;
  const title = `가상 검증 의견 ${randomUUID().slice(0, 8)}`;
  const errors: string[] = []; for (const page of [p, o, m]) page.on('pageerror', error => errors.push(error.message));
  try {
    await test.step('시장·점포를 탐색하고 재료 체크를 새로고침 뒤 확인', async () => {
      await p.getByRole('link', { name: /햇살시장/ }).click();
      await p.getByLabel('점포 또는 재료 검색').fill('대파'); await p.getByRole('button', { name: '검색', exact: true }).click();
      await expect(p.getByRole('link', { name: '상세 보기', exact: true })).toHaveCount(1);
      await p.getByRole('link', { name: '상세 보기' }).click(); await expect(p.getByRole('heading', { name: /푸른/ })).toBeVisible();
      await p.getByRole('button', { name: '대파 담기', exact: true }).click();
      await expect.poll(async () => (await get(citizen.context, '/api/cart')).items.some((item: { name: string }) => item.name === '대파')).toBe(true);
      await p.goto('/cart'); const name = `가상 재료 ${randomUUID().slice(0, 5)}`; await p.getByLabel('살 재료', { exact: true }).fill(name); await p.getByRole('button', { name: '추가', exact: true }).click();
      const checkbox = p.getByRole('checkbox', { name: `${name} 체크`, exact: true }); await checkbox.check(); await expect(checkbox).toBeChecked();
      await expect.poll(async () => (await get(citizen.context, '/api/cart')).items.find((item: { name: string }) => item.name === name)?.checked).toBe(true);
      await p.reload(); await expect(p.getByRole('checkbox', { name: `${name} 체크`, exact: true })).toBeChecked();
    });
    let id: string;
    await test.step('직접 작성한 초안을 검토하고 실제 접수번호 확인', async () => {
      await p.goto('/opinions/new?marketId=sample-haetsal'); await p.locator('#opinion-location').fill('가상 북문 앞 통로'); await p.locator('#opinion-situation').fill('[가상 검증 원문] 시민 연락처 대신 위치와 상황만 작성했어요.');
      await p.getByRole('button', { name: /내용 검토하기/ }).click(); await expect(p).toHaveURL(/\/opinions\/review$/);
      await p.locator('#opinion-title').fill(title); await p.locator('#opinion-description').fill('[가상 검증] 북문 앞 통행 공간을 확인해 주세요.'); await p.getByRole('checkbox', { name: '위치와 전달할 내용을 확인했어요.' }).check();
      await p.getByRole('button', { name: /틈길에 알리기/ }).click(); await expect(p).toHaveURL(/\/opinions\/[^/]+\/received$/); id = p.url().split('/').at(-2)!;
      const data = await get(citizen.context, `/api/opinions/${id}`); expect(data.opinion.title).toBe(title); expect(data.opinion.status).toBe('received');
    });
    await test.step('운영자가 확인을 시작하고 관계·전달 내용 미리보기', async () => {
      await o.goto(`/operator/opinions/${id}`); await expect(o.getByRole('heading', { name: title })).toBeVisible();
      await o.getByRole('button', { name: '처리 상태', exact: true }).click(); await o.locator('#op-content').fill('[가상 검증] 위치와 상황 확인을 시작합니다.'); await o.getByRole('button', { name: '상태 변경 확인하기' }).click(); await confirm(o);
      await o.getByRole('button', { name: '상인 전달', exact: true }).click(); await o.locator('#op-merchant').selectOption({ index: 1 }); await o.locator('#op-relationBasis').fill('[가상 검증 내부 근거] 점포와 구역 관계를 확인한 상황입니다.'); await o.locator('#op-location').fill('가상 북문'); await o.locator('#op-summary').fill('[가상 전달 요약] 북문 통행 공간에 관해 점포의 입장을 알려 주세요.');
      await o.getByRole('button', { name: '저장 전 내용 확인하기' }).click();
      const trigger = o.getByRole('button', { name: '저장 전 내용 확인하기' }); await o.keyboard.press('Escape'); await expect(trigger).toBeFocused(); await trigger.click(); await confirm(o, '상인에게 전달하기');
    });
    await test.step('상인은 최소 요약만 받고 실제 답변을 저장', async () => {
      const result = await get(merchant.context, '/api/merchant/transmissions'); const transmission = result.transmissions.find((t: { opinionId: string }) => t.opinionId === id);
      expect(transmission).toBeTruthy(); expect(transmission).not.toHaveProperty('original'); expect(transmission).not.toHaveProperty('attachments'); expect(transmission).not.toHaveProperty('relationBasis');
      await m.goto(`/merchant/transmissions/${transmission.id}`); await expect(m.getByText('[가상 검증 내부 근거]', { exact: false })).toHaveCount(0);
      await m.locator('#merchant-stance').fill('[가상 상인 답변 원문] 위치를 더 확인하고 싶어요.'); await m.getByRole('checkbox', { name: '지금 제안할 수 있는 대안이 없어요' }).check(); await m.getByRole('button', { name: '답변 내용 확인하기' }).click(); await confirm(m, '답변 전달하기');
      const citizenData = await get(citizen.context, `/api/opinions/${id}`); expect(citizenData.opinion.status).toBe('consulting'); expect(JSON.stringify(citizenData)).not.toContain('[가상 상인 답변 원문]');
    });
    await test.step('검토한 시민용 내용만 게시하고 별도 세션에서 다시 조회', async () => {
      await o.reload(); await o.getByRole('button', { name: '시민에게 게시', exact: true }).click(); await o.locator('#op-content').fill('[가상 게시 결과] 점포의 의견을 들었으며 위치를 추가 확인하고 있어요.'); await o.getByRole('button', { name: '저장 전 내용 확인하기' }).click(); await confirm(o, '시민에게 게시하기');
      await p.goto(`/opinions/${id}`); await expect(p.getByText('[가상 게시 결과] 점포의 의견을 들었으며 위치를 추가 확인하고 있어요.', { exact: true })).toBeVisible(); await p.reload(); await expect(p.getByText('[가상 게시 결과]', { exact: false })).toBeVisible();
      const anonymous = await browser.newContext({ baseURL: base }); expect((await anonymous.request.get(`/api/opinions/${id}`)).status()).toBe(401); await anonymous.close();
      expect((await citizen.context.request.get(`/api/operator/opinions/${id}`)).status()).toBe(403);
      await mkdir('.harness/product-qa', { recursive: true }); await writeFile('.harness/product-qa/journey.json', JSON.stringify({ testedAt: new Date().toISOString(), opinionId: id, title, errors }, null, 2));
    });
    expect(errors).toEqual([]);
  } finally {
    await citizen.context.close(); await operator.context.close(); await merchant.context.close();
  }
});

test('공개·인증 화면: 네 가지 너비, 접근성, 200% 글자, 줄인 모션', async ({ page }) => {
  await mkdir('.harness/product-qa', { recursive: true });
  const report: unknown[] = [];
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ['/', '/markets/sample-haetsal', '/stores/sample-pureun?marketId=sample-haetsal', '/login', '/signup']) {
        await page.goto(path); await page.waitForLoadState('networkidle');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        expect(axe.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
        await page.screenshot({ path: `.harness/product-qa/${path === '/' ? 'home' : path.split('/')[1]}-${width}.png`, fullPage: true }); report.push({ width, path, violations: axe.violations.length });
      }
    }
    await page.setViewportSize({ width: 390, height: 900 }); await page.goto('/login'); await page.evaluate(() => { const elements = [...document.querySelectorAll<HTMLElement>('main, main *, nav, nav *')]; const sizes = elements.map(el => parseFloat(getComputedStyle(el).fontSize)); elements.forEach((el, i) => { el.style.fontSize = `${sizes[i] * 2}px`; }); }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true); await page.screenshot({ path: '.harness/product-qa/login-text-200.png', fullPage: true });
    await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/'); expect(await page.locator('main').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
    await writeFile('.harness/product-qa/responsive-accessibility.json', JSON.stringify(report, null, 2));
});
