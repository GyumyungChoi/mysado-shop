/** 값을 표시용 문자열로 변환 (배열은 쉼표로, 객체/원시값은 문자열화) */
function formatSpecValue(value: unknown): string {
  if (Array.isArray(value)) return value.map((v) => String(v)).join(", ");
  return String(value);
}

/** 상품 제원 표 (specs가 비어 있으면 렌더하지 않음) */
export default function SpecTable({
  specs,
}: {
  specs: Record<string, unknown> | null;
}) {
  if (!specs || Object.keys(specs).length === 0) return null;

  return (
    <div className="mt-8 border-t border-gray-100 pt-8">
      <h2 className="mb-3 text-lg font-bold text-gray-900">상품 제원</h2>
      <table className="w-full border-collapse text-sm">
        <tbody>
          {Object.entries(specs).map(([key, value]) => (
            <tr key={key} className="border-b border-gray-100 last:border-0">
              <th className="w-1/3 py-2 pr-4 text-left font-medium text-gray-500">
                {key}
              </th>
              <td className="py-2 text-gray-700">{formatSpecValue(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
