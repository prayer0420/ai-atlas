import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AI Atlas · 나의 AI 지식 공간",
    short_name: "AI Atlas",
    description: "AI 자료를 담고, 핵심을 읽고, 지식으로 연결하세요.",
    lang: "ko",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f7f8f5",
    theme_color: "#243c30",
    icons: [
      { src: "/app-192.png", sizes: "192x192", type: "image/png" },
      {
        src: "/app-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
    share_target: {
      action: "/",
      method: "GET",
      params: {
        title: "capture_title",
        text: "capture_text",
        url: "capture_url",
      },
    },
  };
}
