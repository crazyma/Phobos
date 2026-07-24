# 01 — Next.js app bootstrap

**What to build:** 一個能在瀏覽器打開的 Next.js app，與既有資料層（lib/db）共存於同一 repo。開發者 `pnpm dev` 後能看到頁面、`pnpm build` 能過。這是 spec-02 一切頁面的地基（prefactor），如同資料層的票 01。

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Next.js（App Router）+ TypeScript 裝好，與既有 `lib/db`／`scripts/db`／vitest 共存，**不破壞**既有 `pnpm test`、`pnpm db:*`、`pnpm typecheck`
- [ ] Tailwind CSS + shadcn/ui 初始化（以一個 shadcn 元件如 Button 驗證可用）
- [ ] 一個最小首頁路由能 render，`pnpm dev` 可在瀏覽器開啟
- [ ] `pnpm build` 成功
- [ ] 既有資料層測試與型別不受影響（回歸確認）
- [ ] README 補一行前端啟動步驟（`pnpm dev`）
