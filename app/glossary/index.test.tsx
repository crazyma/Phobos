import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import GlossaryIndex from "./page.tsx";

describe("/glossary index", () => {
  const html = renderToStaticMarkup(<GlossaryIndex />);

  it("groups terms by category with links", () => {
    expect(html).toContain("打擊進階");
    expect(html).toContain("投球進階");
    expect(html).toContain("打投共用進階");
    expect(html).toContain("標準數據");
    expect(html).toContain("名單與規則");
    expect(html).toContain("/glossary/wrc-plus");
    expect(html).toContain("/glossary/avg");
    expect(html).toContain("/glossary/il");
    expect(html).toContain("wRC+");
  });

  it("shows each term's one-line 白話", () => {
    expect(html).toContain("純長打率"); // ISO name_zh
  });
});
