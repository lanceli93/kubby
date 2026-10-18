"use client";

import dynamic from "next/dynamic";

// 今晚看什么 — draw-a-hand recommendations (cinema). Static segment beside
// `[id]`, so `/movies/recommend` never hits the detail route. Client-only: the
// page restores the last hand from sessionStorage on its first render and the
// scene is all imperative DOM/canvas work.
const RecommendPage = dynamic(
  () => import("@/components/recommend/recommend-page").then((m) => m.RecommendPage),
  { ssr: false, loading: () => <div className="h-full w-full bg-[#0a0a0f]" /> }
);

export default function MoviesRecommendPage() {
  return <RecommendPage />;
}
