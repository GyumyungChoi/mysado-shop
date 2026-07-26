/** 원 단위 금액을 표시용 문자열로 변환 (0이면 "무료") */
function formatFee(fee: number): string {
  return fee === 0 ? "무료" : `${fee.toLocaleString("ko-KR")}원`;
}

/** 배송비/반품비/교환비 표 (기존 필드라 항상 렌더) */
export default function ShippingReturn({
  deliveryFee,
  returnFee,
  exchangeFee,
}: {
  deliveryFee: number;
  returnFee: number;
  exchangeFee: number;
}) {
  return (
    <div className="mt-8 border-t border-gray-100 pt-8">
      <h2 className="mb-3 text-lg font-bold text-gray-900">배송/교환/반품</h2>
      <table className="w-full border-collapse text-sm">
        <tbody>
          <tr className="border-b border-gray-100">
            <th className="w-1/3 py-2 pr-4 text-left font-medium text-gray-500">
              배송비
            </th>
            <td className="py-2 text-gray-700">{formatFee(deliveryFee)}</td>
          </tr>
          <tr className="border-b border-gray-100">
            <th className="w-1/3 py-2 pr-4 text-left font-medium text-gray-500">
              반품비
            </th>
            <td className="py-2 text-gray-700">{formatFee(returnFee)}</td>
          </tr>
          <tr className="last:border-0">
            <th className="w-1/3 py-2 pr-4 text-left font-medium text-gray-500">
              교환비
            </th>
            <td className="py-2 text-gray-700">{formatFee(exchangeFee)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
