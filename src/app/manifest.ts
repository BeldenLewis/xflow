import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "xflow",
    short_name: "xflow",
    description: "마케팅 어트리뷰션·수집·대시보드 플랫폼",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#8b5cf6",
    icons: [
      { src: "/favicon.ico", sizes: "any", type: "image/x-icon" },
    ],
    lang: "ko-KR",
    orientation: "portrait",
  };
}
