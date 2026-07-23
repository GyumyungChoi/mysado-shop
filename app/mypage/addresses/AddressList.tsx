"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { formatPhone } from "@/lib/format-phone";
import { DELIVERY_MEMO_OPTIONS, DELIVERY_MEMO_CUSTOM } from "@/lib/delivery-memo";

// 카카오(다음) 우편번호 서비스 — 앱 키 불필요. 파라미터를 붙이면 호출이 거부되므로 URL 고정
const POSTCODE_SCRIPT = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";

// 외부 스크립트라 타입 정의가 없어 필요한 필드만 직접 선언한다
interface PostcodeData {
  zonecode: string;
  roadAddress: string;
  jibunAddress: string;
}

interface PostcodeInstance {
  open: () => void;
}

interface PostcodeWindow {
  daum?: {
    Postcode?: new (options: { oncomplete: (data: PostcodeData) => void }) => PostcodeInstance;
  };
}

interface AddressItem {
  id: string;
  label: string | null;
  recipientName: string;
  recipientPhone: string;
  zipCode: string;
  address1: string;
  address2: string | null;
  deliveryMemo: string | null;
  isDefault: boolean;
}

interface Props {
  initialAddresses: AddressItem[];
}

interface FormState {
  label: string;
  recipientName: string;
  recipientPhone: string;
  zipCode: string;
  address1: string;
  address2: string;
  deliveryMemo: string;
  isDefault: boolean;
}

const EMPTY_FORM: FormState = {
  label: "",
  recipientName: "",
  recipientPhone: "",
  zipCode: "",
  address1: "",
  address2: "",
  deliveryMemo: "",
  isDefault: false,
};

export default function AddressList(props: Props) {
  const router = useRouter();
  // 목록은 state로 복제하지 않는다 — useState 초기값은 최초 마운트 때만 반영되어
  // router.refresh() 후에도 옛 목록이 남았음. 최신 props를 그대로 사용한다.
  const addresses = props.initialAddresses;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [memoCustom, setMemoCustom] = useState(false);

  function setField(key: keyof FormState, value: string | boolean) {
    setForm(function (prev) {
      return Object.assign({}, prev, { [key]: value });
    });
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setMemoCustom(false);
    setEditingId(null);
    setFormOpen(true);
    setError("");
    setMessage("");
  }

  function openEdit(item: AddressItem) {
    const memo = item.deliveryMemo || "";
    setMemoCustom(memo !== "" && DELIVERY_MEMO_OPTIONS.indexOf(memo) === -1);
    setForm({
      label: item.label || "",
      recipientName: item.recipientName,
      recipientPhone: formatPhone(item.recipientPhone),
      zipCode: item.zipCode,
      address1: item.address1,
      address2: item.address2 || "",
      deliveryMemo: item.deliveryMemo || "",
      isDefault: item.isDefault,
    });
    setEditingId(item.id);
    setFormOpen(true);
    setError("");
    setMessage("");
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  // 우편번호 팝업 — 스크립트가 준비된 뒤에만 동작
  function openPostcode() {
    const daum = (window as unknown as PostcodeWindow).daum;
    if (!daum || !daum.Postcode) {
      setError("주소 검색을 불러오는 중입니다. 잠시 후 다시 시도해주세요.");
      return;
    }
    new daum.Postcode({
      oncomplete: function (data: PostcodeData) {
        setForm(function (prev) {
          return Object.assign({}, prev, {
            zipCode: data.zonecode,
            address1: data.roadAddress || data.jibunAddress,
          });
        });
      },
    }).open();
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setMessage("");

    const url = editingId
      ? "/api/mypage/addresses/" + editingId
      : "/api/mypage/addresses";

    try {
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.message || "저장에 실패했습니다.");
        return;
      }

      setMessage(json.message);
      closeForm();
      router.refresh();
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("이 배송지를 삭제할까요?")) {
      return;
    }
    setError("");
    setMessage("");

    try {
      const res = await fetch("/api/mypage/addresses/" + id, { method: "DELETE" });
      const json = await res.json();

      if (!res.ok) {
        setError(json.message || "삭제에 실패했습니다.");
        return;
      }

      setMessage(json.message);
      router.refresh();
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    }
  }

  return (
    <div>
      <Script src={POSTCODE_SCRIPT} strategy="lazyOnload" />

      {message ? (
        <p className="mb-4 rounded-md bg-green-50 px-4 py-3 text-sm text-green-700">{message}</p>
      ) : null}
      {error ? (
        <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

      {addresses.length === 0 && !formOpen ? (
        <p className="rounded-lg border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500">
          등록된 배송지가 없습니다.
        </p>
      ) : null}

      <ul className="space-y-3">
        {addresses.map((item) => (
          <li key={item.id} className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  {item.recipientName}
                  {item.label ? (
                    <span className="text-xs font-normal text-gray-500">{item.label}</span>
                  ) : null}
                  {item.isDefault ? (
                    <span className="rounded bg-gray-900 px-1.5 py-0.5 text-xs font-medium text-white">
                      기본
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 text-sm text-gray-600">{formatPhone(item.recipientPhone)}</p>
                <p className="mt-1 text-sm text-gray-600">
                  ({item.zipCode}) {item.address1} {item.address2 || ""}
                </p>
                {item.deliveryMemo ? (
                  <p className="mt-1 text-xs text-gray-500">메모: {item.deliveryMemo}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => openEdit(item)}
                  className="text-xs text-gray-500 hover:text-gray-900"
                >
                  수정
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(item.id)}
                  className="text-xs text-gray-400 hover:text-red-600"
                >
                  삭제
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {!formOpen ? (
        <button
          type="button"
          onClick={openCreate}
          className="mt-4 w-full rounded-lg border border-gray-300 py-3 text-sm font-medium hover:bg-gray-50"
        >
          + 배송지 추가
        </button>
      ) : null}

      {formOpen ? (
        <div className="mt-4 rounded-lg border border-gray-300 p-4">
          <p className="mb-4 text-sm font-semibold">
            {editingId ? "배송지 수정" : "새 배송지"}
          </p>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-gray-600">배송지 이름 (선택)</label>
              <input
                type="text"
                value={form.label}
                onChange={(e) => setField("label", e.target.value)}
                autoComplete="off"
                placeholder="집, 회사 등"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-gray-600">받는 분</label>
              <input
                type="text"
                value={form.recipientName}
                onChange={(e) => setField("recipientName", e.target.value)}
                autoComplete="name"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-gray-600">
                받는 분 연락처 <span className="text-gray-400">(배송 안내용)</span>
              </label>
              <input
                type="tel"
                value={form.recipientPhone}
                onChange={(e) => setField("recipientPhone", e.target.value)}
                autoComplete="tel"
                placeholder="010-1234-5678"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-gray-600">주소</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={form.zipCode}
                  autoComplete="postal-code"
                  readOnly
                  placeholder="우편번호"
                  className="w-28 shrink-0 rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={openPostcode}
                  className="shrink-0 rounded-md border border-gray-900 px-3 py-2 text-sm font-medium hover:bg-gray-900 hover:text-white"
                >
                  우편번호 찾기
                </button>
              </div>
              <input
                type="text"
                value={form.address1}
                autoComplete="address-line1"
                readOnly
                placeholder="주소"
                className="mt-2 w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm"
              />
              <input
                type="text"
                value={form.address2}
                onChange={(e) => setField("address2", e.target.value)}
                autoComplete="address-line2"
                placeholder="상세주소 (동/호수)"
                className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-gray-600">기본 배송 메모 (선택)</label>
              <select
                value={memoCustom ? DELIVERY_MEMO_CUSTOM : form.deliveryMemo}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === DELIVERY_MEMO_CUSTOM) {
                    setMemoCustom(true);
                    setField("deliveryMemo", "");
                  } else {
                    setMemoCustom(false);
                    setField("deliveryMemo", v);
                  }
                }}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">선택 안 함</option>
                {DELIVERY_MEMO_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
                <option value={DELIVERY_MEMO_CUSTOM}>직접 입력</option>
              </select>
              {memoCustom ? (
                <input
                  type="text"
                  value={form.deliveryMemo}
                  onChange={(e) => setField("deliveryMemo", e.target.value)}
                  autoComplete="off"
                  placeholder="예: 공동현관 비밀번호 1234#"
                  className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              ) : null}
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) => setField("isDefault", e.target.checked)}
                className="h-4 w-4"
              />
              기본 배송지로 설정
            </label>
          </div>

          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex-1 rounded-md bg-gray-900 py-2.5 text-sm font-medium text-white hover:bg-gray-700 disabled:bg-gray-400"
            >
              {saving ? "저장 중..." : "저장"}
            </button>
            <button
              type="button"
              onClick={closeForm}
              className="rounded-md border border-gray-300 px-5 py-2.5 text-sm hover:bg-gray-50"
            >
              취소
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}