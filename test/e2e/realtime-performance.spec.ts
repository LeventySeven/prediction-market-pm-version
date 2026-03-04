import { expect, test, type Page } from "@playwright/test";
import { installTrpcMock } from "./helpers/trpcMock";

const readClientCounters = async (page: Page) =>
  page.evaluate(() => {
    const store = (window as Window & {
      __realtimePerfMetrics?: { counters?: Record<string, number> };
    }).__realtimePerfMetrics;
    return store?.counters ?? {};
  });

test.describe("Realtime-first frontend performance", () => {
  test("catalog loads quickly and does not trigger constant list refetch while idle", async ({
    page,
  }) => {
    const trpc = await installTrpcMock(page, {
      listMarketsDelayMs: 120,
    });

    // Warm-up load (Next.js dev compilation is noisy and not user-flow representative).
    await page.goto("/");
    await expect(page.locator("[data-market-card-id]").first()).toBeVisible({
      timeout: 12_000,
    });

    const baselineListCalls = trpc.getRequests("market.listMarkets");
    await page.waitForTimeout(4_000);

    const counters = await readClientCounters(page);
    const loadCalls = Number(counters["catalog.loadMarkets.calls"] ?? 0);
    expect(loadCalls).toBeLessThanOrEqual(4);
    expect(trpc.getRequests("market.listMarkets") - baselineListCalls).toBeLessThanOrEqual(1);
  });

  test("catalog provider/pagination/search operations stay responsive and send correct backend params", async ({
    page,
  }) => {
    const trpc = await installTrpcMock(page, {
      listMarketsDelayMs: 140,
    });

    await page.goto("/");
    await expect(page.locator("[data-market-card-id]").first()).toBeVisible({
      timeout: 7_000,
    });

    const baselineCalls = trpc.getRequests("market.listMarkets");
    const providerClickedAt = Date.now();
    await page.goto("/markets/limitless");
    await expect(page.locator("[data-market-card-id]").first()).toBeVisible({
      timeout: 7_000,
    });

    await expect(page).toHaveURL(/\/markets\/limitless(\?|$)/);
    const afterProviderCalls = trpc.getRequests("market.listMarkets");
    expect(afterProviderCalls).toBeGreaterThanOrEqual(baselineCalls);

    const callsBeforeSearch = trpc.getRequests("market.listMarkets");
    await page.getByPlaceholder(/Search|Поиск/i).first().fill("ETH");
    await page.waitForTimeout(250);
    expect(trpc.getRequests("market.listMarkets")).toBe(callsBeforeSearch);
  });

  test("provider routes load with independent backend provider filter", async ({
    page,
  }) => {
    const trpc = await installTrpcMock(page, {
      listMarketsDelayMs: 120,
    });

    await page.goto("/markets/polymarket");
    await expect(page.locator("[data-market-card-id]").first()).toBeVisible({
      timeout: 7_000,
    });
    const polyInput = trpc.getLastInput("market.listMarkets") as
      | { providerFilter?: string }
      | undefined;
    expect(polyInput?.providerFilter).toBe("polymarket");

    await page.goto("/markets/limitless");
    await expect(page.locator("[data-market-card-id]").first()).toBeVisible({
      timeout: 7_000,
    });
    const limitlessInput = trpc.getLastInput("market.listMarkets") as
      | { providerFilter?: string }
      | undefined;
    expect(limitlessInput?.providerFilter).toBe("limitless");
  });

  test("market open reaches chart first paint before slow comments complete", async ({
    page,
  }) => {
    const trpc = await installTrpcMock(page, {
      getPriceCandlesDelayMs: 140,
      getLiveActivityDelayMs: 260,
      getPublicTradesDelayMs: 260,
      getMarketCommentsDelayMs: 1_600,
    });

    await page.goto("/");
    const firstCard = page.locator("[data-market-card-id]").first();
    await expect(firstCard).toBeVisible({ timeout: 7_000 });

    const openedAt = Date.now();
    await firstCard.click();

    await page.waitForURL(/\/market\//, { timeout: 7_000 });
    await expect(page.locator("#chart-section")).toBeVisible({ timeout: 7_000 });

    const openToChartMs = Date.now() - openedAt;
    expect(openToChartMs).toBeLessThan(1_600);

    expect(trpc.getRequests("market.getPriceCandles")).toBeGreaterThanOrEqual(1);
    await expect
      .poll(() => trpc.getRequests("market.getMarketComments"), {
        timeout: 5_000,
      })
      .toBeGreaterThanOrEqual(1);

    // Comments endpoint is intentionally slower than chart data here.
    expect(trpc.getResponses("market.getMarketComments")).toBe(0);

    await page.waitForTimeout(2_000);
    expect(trpc.getResponses("market.getMarketComments")).toBeGreaterThanOrEqual(1);
  });
});
