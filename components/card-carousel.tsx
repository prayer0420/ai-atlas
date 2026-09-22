"use client";
import { Children, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** Native horizontal scrolling keeps touch, trackpad and keyboard navigation aligned. */
export function CardCarousel({ children }: { children: ReactNode }) {
  const slides = Children.toArray(children);
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const visible = useRef(index);
  visible.current = index;
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const observer = new ResizeObserver(() =>
      el.scrollTo({
        left: visible.current * el.clientWidth,
        behavior: "instant",
      }),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  function go(next: number) {
    const target = Math.max(0, Math.min(slides.length - 1, next));
    const el = track.current;
    if (!el) return;
    el.scrollTo({
      left: target * el.clientWidth,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
  return (
    <section
      className="studio-carousel"
      aria-label="카드뉴스 슬라이드"
      aria-roledescription="캐러셀"
    >
      <div className="studio-carousel-toolbar">
        <span aria-live="polite" aria-atomic="true">
          {index + 1} / {slides.length}장
        </span>
        <span className="studio-swipe-hint">옆으로 넘겨 보세요</span>
        <div>
          <button
            type="button"
            aria-label="이전 카드"
            disabled={index === 0}
            onClick={() => go(index - 1)}
          >
            <ChevronLeft size={22} />
          </button>
          <button
            type="button"
            aria-label="다음 카드"
            disabled={index === slides.length - 1}
            onClick={() => go(index + 1)}
          >
            <ChevronRight size={22} />
          </button>
        </div>
      </div>
      <div
        ref={track}
        className="studio-carousel-track"
        tabIndex={0}
        aria-label="카드 이미지. 좌우 방향키로 넘기기"
        onScroll={(event) => {
          const el = event.currentTarget;
          if (el.clientWidth)
            setIndex(
              Math.max(
                0,
                Math.min(
                  slides.length - 1,
                  Math.round(el.scrollLeft / el.clientWidth),
                ),
              ),
            );
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          const next =
            event.key === "ArrowRight"
              ? index + 1
              : event.key === "ArrowLeft"
                ? index - 1
                : event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? slides.length - 1
                    : null;
          if (next !== null) {
            event.preventDefault();
            go(next);
          }
        }}
      >
        {slides.map((slide, i) => (
          <div
            key={i}
            className="studio-carousel-slide"
            role="group"
            aria-roledescription="슬라이드"
            aria-label={`${slides.length}장 중 ${i + 1}장`}
            inert={i !== index}
          >
            {slide}
          </div>
        ))}
      </div>
      <div className="studio-carousel-dots" aria-label="장 선택">
        {slides.map((_, i) => (
          <button
            type="button"
            key={i}
            aria-label={`${i + 1}장 보기`}
            aria-current={index === i ? "true" : undefined}
            onClick={() => go(i)}
          >
            <span />
          </button>
        ))}
      </div>
    </section>
  );
}
