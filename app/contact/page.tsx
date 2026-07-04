"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

/** 문의 폼 입력 값 타입 */
interface ContactFormValues {
  name: string;
  email: string;
  message: string;
}

/** 문의 폼 필드별 에러 메시지 타입 */
type ContactFormErrors = Partial<Record<keyof ContactFormValues, string>>;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const INITIAL_VALUES: ContactFormValues = {
  name: "",
  email: "",
  message: "",
};

/** 폼 입력 값을 검증하고 필드별 에러 메시지를 반환합니다 */
function validate(values: ContactFormValues): ContactFormErrors {
  const errors: ContactFormErrors = {};

  if (values.name.trim().length < 2) {
    errors.name = "이름은 2자 이상 입력해주세요.";
  }

  if (!EMAIL_REGEX.test(values.email.trim())) {
    errors.email = "올바른 이메일 형식이 아닙니다.";
  }

  if (values.message.trim().length < 10) {
    errors.message = "문의내용은 10자 이상 입력해주세요.";
  }

  return errors;
}

/** 문의하기 페이지 */
export default function ContactPage() {
  const [values, setValues] = useState<ContactFormValues>(INITIAL_VALUES);
  const [errors, setErrors] = useState<ContactFormErrors>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">(
    "idle"
  );
  const [statusMessage, setStatusMessage] = useState("");

  /** 입력 필드 변경 시 값을 갱신합니다 */
  function handleChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    const { name, value } = event.target;
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  /** 폼 제출 시 유효성 검사 후 문의 API를 호출합니다 */
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationErrors = validate(values);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setStatus("submitting");
    setStatusMessage("");

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      const data = (await response.json()) as { message: string };

      if (!response.ok) {
        setStatus("error");
        setStatusMessage(data.message || "잠시 후 다시 시도해주세요");
        return;
      }

      setStatus("success");
      setStatusMessage(data.message || "문의가 접수되었습니다");
      setValues(INITIAL_VALUES);
    } catch (error) {
      console.error("문의 전송 실패:", error);
      setStatus("error");
      setStatusMessage("잠시 후 다시 시도해주세요");
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1">
        <section className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
          <h1 className="mb-2 text-2xl font-bold text-gray-900 sm:text-3xl">
            문의하기
          </h1>
          <p className="mb-8 text-gray-500">
            궁금하신 점을 남겨주시면 빠르게 답변드리겠습니다.
          </p>

          <form onSubmit={handleSubmit} noValidate className="space-y-6">
            {/* 이름 */}
            <div>
              <label
                htmlFor="name"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                이름
              </label>
              <input
                id="name"
                name="name"
                type="text"
                value={values.name}
                onChange={handleChange}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none transition-colors focus:border-gray-900"
                placeholder="홍길동"
              />
              {errors.name && (
                <p className="mt-1.5 text-sm text-red-500">{errors.name}</p>
              )}
            </div>

            {/* 이메일 */}
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                이메일
              </label>
              <input
                id="email"
                name="email"
                type="email"
                value={values.email}
                onChange={handleChange}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none transition-colors focus:border-gray-900"
                placeholder="example@email.com"
              />
              {errors.email && (
                <p className="mt-1.5 text-sm text-red-500">{errors.email}</p>
              )}
            </div>

            {/* 문의내용 */}
            <div>
              <label
                htmlFor="message"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                문의내용
              </label>
              <textarea
                id="message"
                name="message"
                rows={6}
                value={values.message}
                onChange={handleChange}
                className="w-full resize-none rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none transition-colors focus:border-gray-900"
                placeholder="문의하실 내용을 입력해주세요."
              />
              {errors.message && (
                <p className="mt-1.5 text-sm text-red-500">{errors.message}</p>
              )}
            </div>

            {/* 상태 메시지 */}
            {statusMessage && (
              <p
                className={`text-sm font-medium ${
                  status === "success" ? "text-green-600" : "text-red-500"
                }`}
              >
                {statusMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={status === "submitting"}
              className="flex w-full items-center justify-center rounded-lg bg-gray-900 px-6 py-4 text-base font-semibold text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              {status === "submitting" ? "전송 중..." : "문의 보내기"}
            </button>
          </form>
        </section>
      </main>

      <Footer />
    </div>
  );
}
