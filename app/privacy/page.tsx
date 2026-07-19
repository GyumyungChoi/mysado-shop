import type { Metadata } from "next";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

export const metadata: Metadata = {
  title: "개인정보처리방침 | 마이사도",
  description: "마이사도(mysado.net) 개인정보처리방침",
};

/** 개인정보처리방침 — 정적 페이지 */
export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6">
      <h1 className="mb-8 text-2xl font-bold text-gray-900">개인정보처리방침</h1>

      <div className="space-y-8 text-sm leading-relaxed text-gray-700">
        <p>
          (주)주승시스템(이하 &ldquo;회사&rdquo;)은 마이사도(mysado.net, 이하
          &ldquo;사이트&rdquo;)를 운영하며, 개인정보 보호법 등 관련 법령을
          준수하고 이용자의 개인정보를 안전하게 처리하기 위하여 다음과 같이
          개인정보처리방침을 수립·공개합니다.
        </p>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-gray-900">
            1. 수집하는 개인정보 항목 및 수집 방법
          </h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>회원가입 시: 이메일 주소, 비밀번호(암호화 저장), 이름</li>
            <li>
              주문·결제 시: 수령인 이름, 배송지 주소, 연락처, 주문 내역
            </li>
            <li>
              서비스 이용 과정에서 자동 수집: 접속 기록, 상품 조회 기록,
              쿠키, 서비스 이용 기록(Google Analytics를 통한 행태정보 포함)
            </li>
            <li>
              [선택] 회원가입 시: 마케팅 정보 수신 동의 여부 및 동의 일시
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-gray-900">
            2. 개인정보의 수집·이용 목적
          </h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>회원 관리: 회원제 서비스 제공, 본인 확인, 부정 이용 방지</li>
            <li>주문·배송: 상품 주문 처리, 결제, 배송, 환불 및 고객 상담</li>
            <li>
              서비스 개선: 접속 통계 분석, 서비스 이용 현황 파악 및 품질 개선
            </li>
            <li>
              (선택) 마케팅 활용: 신상품·할인 등 광고성 정보 발송(수신에
              동의한 회원에 한하며, 고객 문의를 통해 언제든지 철회할 수
              있습니다)
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-gray-900">
            3. 개인정보의 보유 및 이용 기간
          </h2>
          <p className="mb-2">
            회원 탈퇴 시 지체 없이 파기합니다. 다만, 관련 법령에 따라 다음의
            정보는 명시된 기간 동안 보관합니다.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>계약 또는 청약철회 등에 관한 기록: 5년 (전자상거래법)</li>
            <li>대금결제 및 재화 등의 공급에 관한 기록: 5년 (전자상거래법)</li>
            <li>
              소비자의 불만 또는 분쟁처리에 관한 기록: 3년 (전자상거래법)
            </li>
            <li>접속에 관한 기록: 3개월 (통신비밀보호법)</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-gray-900">
            4. 개인정보 처리의 위탁
          </h2>
          <p className="mb-2">
            회사는 서비스 제공을 위해 다음과 같이 개인정보 처리를 위탁하고
            있습니다.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>토스페이먼츠(주): 전자결제 처리 (카드 정보는 회사 서버에 저장되지 않습니다)</li>
            <li>Resend, Inc.: 거래 관련 이메일 발송</li>
            <li>Google LLC: 웹사이트 이용 통계 분석(Google Analytics 4)</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-gray-900">
            5. 행태정보의 수집·이용 (Google Analytics)
          </h2>
          <p>
            사이트는 서비스 이용 통계 분석을 위해 Google Analytics 4(GA4)를
            사용합니다. GA4는 쿠키를 통해 방문 페이지, 체류 시간, 유입 경로
            등의 행태정보를 수집하며, 이 과정에서 개인을 직접 식별할 수 있는
            정보는 수집하지 않습니다. 이용자는 브라우저의 쿠키 차단 설정 또는
            Google Analytics 차단 브라우저 부가기능(https://tools.google.com/dlpage/gaoptout)을
            통해 수집을 거부할 수 있습니다.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-gray-900">
            6. 이용자의 권리와 행사 방법
          </h2>
          <p>
            이용자는 언제든지 자신의 개인정보를 조회하거나 수정할 수 있으며,
            회원 탈퇴를 통해 개인정보의 삭제를 요청할 수 있습니다. 권리 행사는
            마이페이지 또는 고객센터 이메일(mysado.shop@gmail.com)을 통해
            가능합니다.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-gray-900">
            7. 개인정보의 파기 절차 및 방법
          </h2>
          <p>
            보유 기간이 경과하거나 처리 목적이 달성된 개인정보는 지체 없이
            파기합니다. 전자적 파일 형태의 정보는 복구할 수 없는 기술적 방법으로
            삭제하며, 종이 문서는 분쇄하거나 소각합니다.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-gray-900">
            8. 개인정보 보호책임자
          </h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>성명: 우승문</li>
            <li>직책: 대표이사</li>
            <li>이메일: mysado.shop@gmail.com</li>
          </ul>
          <p className="mt-2">
            개인정보 침해에 대한 신고나 상담이 필요한 경우 개인정보침해
            신고센터(privacy.kisa.or.kr, 국번 없이 118)에 문의하실 수 있습니다.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-gray-900">
            9. 개인정보처리방침의 변경
          </h2>
          <p>
            본 방침은 2026년 7월 18일부터 적용됩니다. 법령·정책 또는 서비스
            변경에 따라 내용이 추가·삭제·수정될 경우 사이트 공지사항을 통해
            고지합니다.
          </p>
        </section>
      </div>
      </main>
      <Footer />
    </div>
  );
}