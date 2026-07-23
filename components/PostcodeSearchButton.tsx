"use client";

import Script from "next/script";
import {
  POSTCODE_SCRIPT,
  PostcodeWindow,
  PostcodeData,
  pickAddress,
} from "@/lib/postcode";

/**
 * 우편번호 찾기 버튼 (Phase 7, 27차)
 *
 * 스크립트 로드(lazyOnload) + 팝업 실행 + 미로딩 안내를 한 곳에 봉인한다.
 * next/script는 동일 src를 중복 렌더해도 1회만 로드하므로
 * 한 페이지에 이 버튼이 여러 개 있어도 안전하다.
 * 에러 표시는 사용처마다 다르므로 onError 콜백으로 부모에 위임한다.
 */
interface Props {
  /** 팝업에서 주소 선택 완료 시 — 우리 스키마 필드명으로 정규화되어 전달됨 */
  onComplete: (result: { zipCode: string; address1: string }) => void;
  /** 스크립트 미로딩 등 사용자 안내가 필요할 때 */
  onError: (message: string) => void;
  className?: string;
}

const DEFAULT_CLASS =
  "shrink-0 rounded-md border border-gray-900 px-3 py-2 text-sm font-medium " +
  "hover:bg-gray-900 hover:text-white";

export default function PostcodeSearchButton(props: Props) {
  function openPostcode() {
    const daum = (window as unknown as PostcodeWindow).daum;
    if (!daum || !daum.Postcode) {
      props.onError("주소 검색을 불러오는 중입니다. 잠시 후 다시 시도해주세요.");
      return;
    }
    new daum.Postcode({
      oncomplete: function (data: PostcodeData) {
        props.onComplete(pickAddress(data));
      },
    }).open();
  }

  return (
    <>
      <Script src={POSTCODE_SCRIPT} strategy="lazyOnload" />
      <button
        type="button"
        onClick={openPostcode}
        className={props.className || DEFAULT_CLASS}
      >
        우편번호 찾기
      </button>
    </>
  );
}
