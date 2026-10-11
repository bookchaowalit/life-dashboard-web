import type { CellErrorCode } from './core';

const REASONS: Record<CellErrorCode, string> = {
  not_configured: 'ยังไม่ได้ตั้งค่าการเชื่อมต่อบริการนี้',
  unreachable: 'ติดต่อบริการไม่ได้ ลองใหม่อีกครั้งในอีกสักครู่',
  unauthorized: 'โทเค็นของ Solo Web ยังไม่มีสิทธิ์เข้าถึงบริการนี้',
  not_found: 'ไม่พบข้อมูลที่ต้องการ',
  conflict: 'ข้อมูลถูกแก้ไขจากที่อื่น ลองรีเฟรชแล้วทำใหม่',
  invalid: 'บริการปฏิเสธคำขอ',
  upstream: 'บริการตอบกลับผิดปกติ',
};

export const reasonText = (code: CellErrorCode) => REASONS[code];
