import { authReadiness } from '@/lib/auth';

const ERRORS: Record<string, string> = {
  configuration: 'ยังตั้งค่าการเข้าสู่ระบบไม่ครบ กรุณาติดต่อผู้ดูแล',
  unavailable: 'ติดต่อบริการยืนยันตัวตนไม่ได้ กรุณาลองใหม่ภายหลัง',
  denied: 'เข้าสู่ระบบไม่สำเร็จ หรือบัญชีนี้ไม่ได้รับอนุญาต กรุณาลองใหม่',
};

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const ready = authReadiness(process.env).ready;
  return (
    <main className="shell-home">
      <h1>เข้าสู่ระบบ Solo Empire</h1>
      <p>เข้าถึงข้อมูลส่วนตัวด้วยบัญชีเจ้าของที่ได้รับอนุญาต</p>
      {error && ERRORS[error] && <p role="alert">{ERRORS[error]}</p>}
      {ready ? <a className="shell-card" href="/api/auth/login">เข้าสู่ระบบ</a> : <p role="status">ยังตั้งค่าการเข้าสู่ระบบไม่ครบ ระบบข้อมูลส่วนตัวจะเปิดหลังผู้ดูแลตั้งค่าเรียบร้อย</p>}
    </main>
  );
}
