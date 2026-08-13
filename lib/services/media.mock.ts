/**
 * MOCK ONLY: 等待真實媒體資料源，勿當真值引用；不納入任何對帳或驗收數字。
 * 此檔刻意不進 lib/services/index.ts barrel，資料源上線後應整檔替換。
 */
export type MockMediaItem = {
  id: string;
  kind: "news" | "thread" | "tweet" | "video";
  source: string;
  date: string;
  title: string;
  summary: string;
  url: string;
  thumbnail?: string;
};

export const PLAYER_MEDIA_MOCK: Record<number, MockMediaItem[]> = {
  691907: [
    {
      id: "mock-news-cheng-1",
      kind: "news",
      source: "Phobos 編輯室",
      date: "2026-08-13",
      title: "鄭宗哲持續站穩內野防線",
      summary: "這是等待真實資料源接入前的版面示意，不代表實際新聞內容。",
      url: "#",
    },
  ],
};
