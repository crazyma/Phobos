# 01 — Next.js app bootstrap

**What to build:** 一個能在瀏覽器打開的 Next.js app，與既有資料層（lib/db）共存於同一 repo。開發者 `pnpm dev` 後能看到頁面、`pnpm build` 能過。這是 spec-02 一切頁面的地基（prefactor），如同資料層的票 01。

**Blocked by:** None — can start immediately.

**Status:** done

- [x] Next.js（App Router）+ TypeScript 裝好，與既有 `lib/db`／`scripts/db`／vitest 共存，**不破壞**既有 `pnpm test`、`pnpm db:*`、`pnpm typecheck`
- [x] Tailwind CSS + shadcn/ui 初始化（以一個 shadcn 元件如 Button 驗證可用）
- [x] 一個最小首頁路由能 render，`pnpm dev` 可在瀏覽器開啟
- [x] `pnpm build` 成功
- [x] 既有資料層測試與型別不受影響（回歸確認）
- [x] README 補一行前端啟動步驟（`pnpm dev`）

**Notes（實作決策）:**
- Next 16 (Turbopack) + React 19 + Tailwind v4 + shadcn/ui（Base UI 底，現行 shadcn 預設）。
- TypeScript 7 / tsgo 與 `next build` 內建型別檢查器不相容（會 crash）；改由 `pnpm typecheck`（tsgo，覆蓋 app+lib）當唯一型別 gate，`next.config.ts` 設 `typescript.ignoreBuildErrors` 並註明原因。
- tsconfig 由 Next 接管（`jsx: react-jsx`），保留 `allowImportingTsExtensions`，`include` 擴及 app/components/lib/scripts；資料層 `.ts` 副檔名 import 不受影響（Turbopack + tsgo 皆可解析）。
