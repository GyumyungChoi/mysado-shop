"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** 돋보기 클릭 시 헤더 하단에 검색 입력줄을 펼치는 토글 */
export default function SearchToggle() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setOpen(false);
    setQuery("");
    router.push(`/search?q=${encodeURIComponent(q)}`);
  };

  return (
    <>
      <button
        type="button"
        aria-label="상품 검색"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="text-gray-600 transition-colors hover:text-gray-900"
      >
        {/* 돋보기 아이콘 (인라인 SVG) */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>

      {open && (
        <div className="absolute inset-x-0 top-full border-b border-gray-100 bg-white/95 backdrop-blur">
          <form
            onSubmit={handleSubmit}
            className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3 sm:px-6"
          >
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="상품명 검색"
              autoFocus
              className="h-10 flex-1 rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-gray-400"
            />
            <button
              type="submit"
              className="h-10 rounded-md bg-gray-900 px-4 text-sm font-medium text-white transition-colors hover:bg-gray-700"
            >
              검색
            </button>
          </form>
        </div>
      )}
    </>
  );
}
