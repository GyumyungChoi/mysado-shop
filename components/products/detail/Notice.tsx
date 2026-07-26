const DEFAULT_NOTICES = [
  "본 상품은 정품 확인 후 판매되며, 호환 모델 정보는 구매 전 반드시 확인해 주세요.",
  "단순 변심에 의한 교환/반품은 상품 수령 후 7일 이내 가능합니다.",
  "상품의 색상은 촬영 환경 및 모니터 설정에 따라 실제와 다르게 보일 수 있습니다.",
];

/** 주의사항 블록. items가 있으면 그것을, 없으면 기본 정적 문구를 표시(항상 렌더) */
export default function Notice({ items }: { items?: string[] }) {
  const notices = items && items.length > 0 ? items : DEFAULT_NOTICES;

  return (
    <div className="mt-8 border-t border-gray-100 pt-8">
      <h2 className="mb-3 text-lg font-bold text-gray-900">주의사항</h2>
      <ul className="space-y-1.5">
        {notices.map((notice, index) => (
          <li key={index} className="text-xs text-gray-500">
            · {notice}
          </li>
        ))}
      </ul>
    </div>
  );
}
