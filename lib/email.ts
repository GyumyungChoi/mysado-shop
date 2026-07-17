// lib/email.ts
// 설계 결정 ⑰: 이메일 발송 로직 단일 격리 파일.
// 프로바이더(Resend) 교체 시 이 파일만 수정하면 되도록 외부에는 sendEmail 인터페이스만 노출.
import { Resend } from 'resend';

// 지연 초기화 싱글턴 (lib/prisma.ts와 동일 패턴)
let resendClient: Resend | null = null;

function getClient(): Resend {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY 환경변수가 설정되지 않았습니다');
    }
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

export interface SendEmailResult {
  success: boolean;
  id?: string;      // Resend 발송 ID (성공 시)
  error?: string;   // 실패 사유 (실패 시)
}

/**
 * 이메일 발송. 절대 throw하지 않음 — 결제 confirm 등 상위 흐름을
 * 메일 실패가 중단시키지 않도록 결과 객체로만 반환.
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  try {
    const from = process.env.EMAIL_FROM;
    if (!from) {
      return { success: false, error: 'EMAIL_FROM 환경변수가 설정되지 않았습니다' };
    }

    const { data, error } = await getClient().emails.send({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
    });

    if (error) {
      console.error('[email] 발송 실패:', error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[email] 발송 예외:', message);
    return { success: false, error: message };
  }
}
