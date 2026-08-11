import { expect, test, type Locator, type Page } from "@playwright/test";

const JAPANESE_TEXT = "こんにちは、テストです";
const BREAK_HOVER_DESCRIPTION = "単語やその他の音声コンテンツ";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

test.use({
  baseURL: BASE_URL,
});

function monacoEditor(page: Page) {
  return page.locator(".monaco-editor");
}

async function openPlayground(page: Page) {
  await page.goto("/");
  await expect(page.locator('[data-ssml-editor][aria-label="SSMLエディター"]')).toBeVisible();
  await expect(monacoEditor(page)).toBeVisible();
}

async function replaceEditorText(page: Page, text: string) {
  const editor = monacoEditor(page);
  await editor.locator(".view-lines").click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type(text);
  await expect.poll(async () => (await editor.locator(".view-lines").innerText()).trim()).toBe(text);
}

async function getZIndex(locator: Locator) {
  return locator.evaluate((element) => Number.parseInt(getComputedStyle(element).zIndex, 10) || 0);
}

test.describe("Monaco SSML editor", () => {
  test("accepts Japanese keyboard input and wraps the selection with prosody", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "This E2E spec requires Chromium.");
    await openPlayground(page);
    await replaceEditorText(page, JAPANESE_TEXT);

    const editor = monacoEditor(page);
    await page.keyboard.press("Escape");
    await editor.locator(".view-lines").click();
    await page.keyboard.press("ControlOrMeta+A");

    const rateButton = page.getByRole("button", { name: "速度", exact: true });
    await rateButton.click();

    const rateMenu = page.getByRole("menu", { name: "速度", exact: true });
    await expect(rateMenu).toBeVisible();
    await rateMenu.getByRole("menuitem", { name: "遅い速度", exact: true }).click();

    await expect
      .poll(async () => (await editor.locator(".view-lines").innerText()).trim())
      .toBe(`<prosody rate="slow">${JAPANESE_TEXT}</prosody>`);
    await expect(page.locator(".output code")).toContainText(`<prosody rate="slow">${JAPANESE_TEXT}</prosody>`);
  });

  test("keeps the break hover visible and puts toolbar menus above Monaco context actions", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "This E2E spec requires Chromium.");
    await openPlayground(page);

    const editor = monacoEditor(page);
    await editor.locator(".view-lines").click();
    await page.keyboard.press("ControlOrMeta+Home");

    const breakButton = page.getByRole("button", { name: "間", exact: true });
    await breakButton.click();
    const breakMenu = page.getByRole("menu", { name: "間", exact: true });
    await expect(breakMenu).toBeVisible();
    await breakMenu.getByRole("menuitem", { name: "500ミリ秒の無音", exact: true }).click();

    const breakLine = editor.locator(".view-line").filter({ hasText: '<break time="500ms"/>' }).first();
    await expect(breakLine).toBeVisible();
    const breakLineBox = await breakLine.boundingBox();
    if (!breakLineBox) {
      throw new Error("The inserted break tag is not laid out in Monaco.");
    }

    await page.mouse.move(breakLineBox.x + breakLineBox.width / 2, breakLineBox.y + breakLineBox.height / 2);

    const hover = page.locator(".monaco-hover:visible").filter({ hasText: BREAK_HOVER_DESCRIPTION }).first();
    await expect(hover).toBeVisible();
    const hoverState = await hover.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const centerX = bounds.left + bounds.width / 2;
      const centerY = bounds.top + bounds.height / 2;
      const topElement = document.elementFromPoint(centerX, centerY);

      return {
        isInViewport:
          bounds.left >= 0 &&
          bounds.top >= 0 &&
          bounds.right <= window.innerWidth &&
          bounds.bottom <= window.innerHeight,
        isTopmost: topElement instanceof Node && element.contains(topElement),
        zIndex: Number.parseInt(getComputedStyle(element).zIndex, 10) || 0,
      };
    });
    expect(hoverState.isInViewport).toBe(true);
    expect(hoverState.isTopmost).toBe(true);
    expect(hoverState.zIndex).toBeGreaterThan(0);

    await page.mouse.move(10, 10);
    await editor.locator(".view-lines").click({ button: "right" });
    const contextMenu = page.locator(".context-view:visible").first();
    await expect(contextMenu).toBeVisible();
    const contextMenuZIndex = await getZIndex(contextMenu);

    await page.keyboard.press("Escape");
    await expect(contextMenu).toBeHidden();
    await breakButton.click();
    await expect(breakMenu).toBeVisible();
    const toolbarMenuZIndex = await getZIndex(breakMenu);
    expect(toolbarMenuZIndex).toBeGreaterThan(contextMenuZIndex);

    await breakMenu.getByRole("menuitem", { name: "500ミリ秒の無音", exact: true }).click();
    await expect
      .poll(async () => {
        const output = await page.locator(".output code").textContent();
        return output?.match(/<break time="500ms"\/>/g)?.length ?? 0;
      })
      .toBe(2);
  });
});
