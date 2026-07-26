/** 호환 모델 뱃지 목록 (비어 있으면 렌더하지 않음) */
export default function Compatibility({ models }: { models: string[] }) {
  if (models.length === 0) return null;

  return (
    <div className="mt-8 border-t border-gray-100 pt-8">
      <h2 className="mb-3 text-lg font-bold text-gray-900">호환 모델</h2>
      <div className="flex flex-wrap gap-2">
        {models.map((model) => (
          <span
            key={model}
            className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600"
          >
            {model}
          </span>
        ))}
      </div>
    </div>
  );
}
