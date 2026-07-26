/** 상품 셀링 포인트 목록 (비어 있으면 렌더하지 않음) */
export default function Highlights({ items }: { items: string[] }) {
  if (items.length === 0) return null;

  return (
    <div className="mt-8 border-t border-gray-100 pt-8">
      <h2 className="mb-3 text-lg font-bold text-gray-900">이 상품의 특징</h2>
      <ul className="space-y-2">
        {items.map((item, index) => (
          <li key={index} className="flex items-start gap-2 text-sm text-gray-700">
            <span className="mt-0.5 text-gray-900">✓</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
