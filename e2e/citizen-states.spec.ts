import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

test("시민 입력·응답 유실·모션·반응형을 실제 저장과 함께 확인한다", async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  test.setTimeout(420_000);
  const evidence: Record<string, unknown> = { checks: [], viewports: [] };
  const checks = evidence.checks as string[];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const folder = testInfo.outputPath("citizen-evidence");
  await mkdir(folder, { recursive: true });
  async function capture(name: string) {
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.locator("main h1")).toBeVisible();
      await expect
        .poll(async () =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        )
        .toBe(true);
      const axe = await new AxeBuilder({ page }).analyze();
      expect(axe.violations, `${name} at ${width}px`).toEqual([]);
      await page.screenshot({
        path: `${folder}/${name}-${width}.png`,
        fullPage: true,
        animations: "disabled",
      });
      (evidence.viewports as unknown[]).push({
        name,
        width,
        overflow: false,
        axeViolations: axe.violations.length,
      });
    }
    await writeFile(
      `${folder}/results.json`,
      JSON.stringify(evidence, null, 2),
    );
    await page.setViewportSize({ width: 390, height: 844 });
  }
  const signup = await context.request.post("/api/auth/sign-up/email", {
    data: {
      name: "시민 상태 검증",
      email: `citizen-state-${randomUUID()}@example.test`,
      password: randomUUID() + "Aa1!",
    },
    headers: { origin: baseURL! },
  });
  expect(signup.status()).toBe(200);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/cart");
  await expect(
    page.getByRole("heading", { name: "아직 담은 재료가 없어요" }),
  ).toBeVisible();

  let failAdd = true;
  await page.route("**/api/cart", async (route) => {
    if (route.request().method() === "POST" && failAdd)
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "검증용 저장 실패" }),
      });
    else await route.continue();
  });
  await page.getByLabel("살 재료", { exact: true }).fill("가상 재료 대파");
  await page.getByRole("button", { name: "추가", exact: true }).click();
  await expect(
    page
      .locator(".citizen-page > .notice")
      .filter({ hasText: "검증용 저장 실패" }),
  ).toBeVisible();
  await expect(page.getByLabel("살 재료", { exact: true })).toHaveValue(
    "가상 재료 대파",
  );
  await expect(
    page.getByRole("checkbox", { name: "가상 재료 대파 체크" }),
  ).toHaveCount(0);
  checks.push("failed cart write preserves input without a fabricated row");
  failAdd = false;
  await page.getByRole("button", { name: "추가", exact: true }).click();
  const checkbox = page.getByRole("checkbox", { name: "가상 재료 대파 체크" });
  await expect(checkbox).toBeVisible();
  await page.route("**/api/cart/*", async (route) => {
    if (route.request().method() === "PATCH")
      await new Promise((resolve) => setTimeout(resolve, 180));
    await route.continue();
  });
  await checkbox.check();
  await checkbox.uncheck();
  await checkbox.check();
  await expect(page.getByText("가상 재료 대파, 체크했어요.")).toBeVisible();
  const cart = await (await context.request.get("/api/cart")).json();
  expect(cart.items).toHaveLength(1);
  expect(cart.items[0].checked).toBe(true);
  checks.push("serialized checkbox writes preserve the final intent");
  await page
    .getByRole("button", { name: "가상 재료 대파 수정 및 삭제" })
    .click();
  await page.getByRole("button", { name: "이름 수정하기" }).click();
  await page
    .getByLabel("재료 이름", { exact: true })
    .fill("가상 재료 대파 한 단");
  await page.getByRole("button", { name: "저장하기", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "가상 재료 대파 한 단 체크" }),
  ).not.toBeChecked();
  checks.push("renaming preserves the item ID and clears its check");
  await capture("S04-cart");

  await page.goto("/markets/sample-haetsal");
  const trigger = page.getByRole("button", { name: /푸른채소/ });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Tab");
    expect(
      await sheet.evaluate((node) => node.contains(document.activeElement)),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(sheet).not.toBeVisible();
  await expect(trigger).toBeFocused();
  checks.push(
    "mobile store sheet traps keyboard focus and restores it on Escape",
  );

  await page.goto("/opinions/new?marketId=sample-haetsal");
  let failDraft = true;
  await page.route("**/api/draft", async (route) => {
    if (route.request().method() === "PUT" && failDraft)
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "검증용 초안 저장 실패" }),
      });
    else await route.continue();
  });
  await page
    .getByLabel("어디에서 겪으셨나요?", { exact: false })
    .fill("가상 도식 A구역");
  await page
    .getByLabel("어떤 상황이었나요?", { exact: false })
    .fill("입력 보존 검증용 가상 상황입니다.");
  await page
    .getByRole("navigation", { name: "하단 메뉴" })
    .getByRole("link", { name: "장바구니" })
    .click();
  await expect(
    page.getByText("검증용 초안 저장 실패", { exact: true }),
  ).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/opinions/new");
  await expect(
    page.getByLabel("어떤 상황이었나요?", { exact: false }),
  ).toHaveValue("입력 보존 검증용 가상 상황입니다.");
  failDraft = false;
  await page
    .getByRole("navigation", { name: "하단 메뉴" })
    .getByRole("link", { name: "장바구니" })
    .click();
  await expect(page).toHaveURL(/\/cart$/);
  const savedDraft = await (await context.request.get("/api/draft")).json();
  expect(savedDraft.draft.content.situation).toBe(
    "입력 보존 검증용 가상 상황입니다.",
  );
  checks.push(
    "internal navigation blocks on failed autosave and flushes immediately when retry succeeds",
  );

  await page
    .getByRole("navigation", { name: "하단 메뉴" })
    .getByRole("link", { name: "내 의견" })
    .click();
  await page.getByRole("link", { name: "의견 작성하기" }).click();
  await expect(
    page.getByLabel("어떤 상황이었나요?", { exact: false }),
  ).toHaveValue("입력 보존 검증용 가상 상황입니다.");
  await capture("S05-opinion-write");
  failDraft = true;
  await page
    .getByLabel("어떤 상황이었나요?", { exact: false })
    .fill("브라우저 뒤로가기 직전의 미저장 가상 입력입니다.");
  await page.goBack();
  await expect(page).toHaveURL(/\/my$/);
  await page.getByRole("link", { name: "의견 작성하기" }).click();
  await expect(
    page.getByLabel("어떤 상황이었나요?", { exact: false }),
  ).toHaveValue("브라우저 뒤로가기 직전의 미저장 가상 입력입니다.");
  await expect(
    page.getByText(
      "이 탭에 남아 있던 미저장 입력을 복원했어요. 다시 저장해 주세요.",
    ),
  ).toBeVisible();
  failDraft = false;
  checks.push(
    "browser Back during failed autosave restores unsaved input from account-scoped tab memory",
  );
  await page.getByRole("button", { name: "내용 검토하기" }).click();
  await expect(page).toHaveURL(/\/opinions\/review$/);
  await page
    .getByLabel("의견 제목", { exact: false })
    .fill("응답 유실 검증용 가상 의견");
  await page
    .getByRole("button", { name: "원문을 상황 설명에 가져오기" })
    .click();
  await page.getByLabel("위치와 전달할 내용을 확인했어요.").check();
  await expect(page.getByText("초안 저장됨", { exact: true })).toBeVisible();
  await capture("S06-opinion-review");
  let loseReceipt = true;
  await page.route("**/api/opinions", async (route) => {
    if (route.request().method() === "POST" && loseReceipt) {
      loseReceipt = false;
      const committed = await route.fetch();
      expect(committed.ok()).toBe(true);
      await route.abort("connectionreset");
    } else await route.continue();
  });
  await page
    .getByRole("button", { name: "틈길에 알리기", exact: true })
    .click();
  await expect(page.getByText(/서버 응답을 확인하지 못했어요/)).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/opinions/review");
  await page
    .getByRole("button", { name: "틈길에 알리기", exact: true })
    .click();
  await expect(page).toHaveURL(/\/opinions\/[^/]+\/received$/);
  const opinionList = await (await context.request.get("/api/opinions")).json();
  expect(opinionList.opinions).toHaveLength(1);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "의견이 접수됐어요" }),
  ).toBeVisible();
  const normalMotion = await page
    .locator(".citizen-receipt-check")
    .evaluate((node) => ({
      name: getComputedStyle(node).animationName,
      duration: getComputedStyle(node).animationDuration,
    }));
  expect(normalMotion.name).not.toBe("none");
  evidence.normalReceiptMotion = normalMotion;
  await capture("S07-opinion-received");
  checks.push(
    "lost submission response reuses its idempotency key and reload creates no extra opinion",
  );
  const receiptPath = new URL(page.url()).pathname;
  await page.getByRole("link", { name: /내 의견 보기/ }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "응답 유실 검증용 가상 의견" }),
  ).toBeVisible();
  await capture("S09-opinion-detail");
  await page.goto("/my");
  await expect(
    page.getByRole("link", { name: /응답 유실 검증용 가상 의견/ }),
  ).toBeVisible();
  await capture("S08-my-opinions");
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/cart");
  await expect(page.getByRole("checkbox")).toBeVisible();
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
  evidence.axe = { route: "/cart", violations: axe.violations.length };
  await page.evaluate(() => {
    const sizes = [
      ...document.querySelectorAll<HTMLElement>("main *, .mobile-nav *"),
    ].map((node) => ({
      node,
      size: parseFloat(getComputedStyle(node).fontSize),
    }));
    for (const { node, size } of sizes)
      if (Number.isFinite(size)) node.style.fontSize = `${size * 2}px`;
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `${folder}/cart-text-200-percent.png`,
    fullPage: true,
    animations: "disabled",
  });
  checks.push(
    "390px cart remains operable when computed text sizes are doubled",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(receiptPath);
  await expect(
    page.getByRole("heading", { name: "의견이 접수됐어요" }),
  ).toBeVisible();
  expect(
    await page
      .locator(".citizen-receipt-check")
      .evaluate((node) => getComputedStyle(node).animationName),
  ).toBe("none");
  await page.screenshot({
    path: `${folder}/receipt-reduced-motion.png`,
    fullPage: true,
  });
  checks.push(
    "reduced motion removes receipt animation while retaining actual receipt information",
  );
  expect(errors).toEqual([]);
  evidence.pageErrors = errors;
  await writeFile(`${folder}/results.json`, JSON.stringify(evidence, null, 2));
});
