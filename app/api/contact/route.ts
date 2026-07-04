import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

/** 문의 폼 요청 바디 타입 */
interface ContactRequestBody {
  name: string;
  email: string;
  message: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 요청 바디의 필수 항목과 형식을 검증합니다 */
function validateContactBody(body: Partial<ContactRequestBody>): string | null {
  const { name, email, message } = body;

  if (!name || !email || !message) {
    return "이름, 이메일, 문의내용을 모두 입력해주세요.";
  }

  if (name.trim().length < 2) {
    return "이름은 2자 이상 입력해주세요.";
  }

  if (!EMAIL_REGEX.test(email.trim())) {
    return "올바른 이메일 형식이 아닙니다.";
  }

  if (message.trim().length < 10) {
    return "문의내용은 10자 이상 입력해주세요.";
  }

  return null;
}

/** 문의하기 폼 제출을 받아 담당자에게 이메일을 발송합니다 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<ContactRequestBody>;
    const validationError = validateContactBody(body);

    if (validationError) {
      return NextResponse.json({ message: validationError }, { status: 400 });
    }

    const { name, email, message } = body as ContactRequestBody;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: process.env.CONTACT_EMAIL,
      replyTo: email,
      subject: `[마이사도 문의] ${name}님의 문의`,
      text: `이름: ${name}\n이메일: ${email}\n\n문의내용:\n${message}`,
    });

    return NextResponse.json(
      { message: "문의가 접수되었습니다" },
      { status: 200 }
    );
  } catch (error) {
    console.error("문의 이메일 발송 실패:", error);
    return NextResponse.json(
      { message: "잠시 후 다시 시도해주세요" },
      { status: 500 }
    );
  }
}
