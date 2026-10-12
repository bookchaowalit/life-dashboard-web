/** Navigation for the unified shell. `href` is internal for migrated modules and external for legacy apps. */
export interface ModuleLink {
  id: string;
  label: string;
  description: string;
  href: string;
  migrated: boolean;
  /** Kept in code but left out of navigation and the home page until its backend is deployed. */
  hidden?: boolean;
}

export const MODULES: ModuleLink[] = [
  { id: 'tasks', label: 'วันนี้/งาน', description: 'งานวันนี้ เกินกำหนด กำลังทำ เสร็จล่าสุด และเปลี่ยนสถานะงาน', href: '/tasks', migrated: true },
  { id: 'goals', label: 'เป้าหมาย', description: 'เป้าหมาย ความคืบหน้า และงานของแต่ละเป้าหมาย (อ่านอย่างเดียว)', href: '/goals', migrated: true },
  { id: 'habits', label: 'นิสัย', description: 'สตรีค บันทึกสัปดาห์นี้ และบันทึกวันนี้', href: '/habits', migrated: true },
  { id: 'decisions', label: 'การตัดสินใจ', description: 'การตัดสินใจที่ยังเปิดอยู่และประวัติ (อ่านอย่างเดียว)', href: '/decisions', migrated: true },
  { id: 'revenue', label: 'รายได้', description: 'ยอดรายได้ต่อสกุลเงิน รายการล่าสุด และใบแจ้งหนี้ที่ค้าง (อ่านอย่างเดียว)', href: '/revenue', migrated: true },
  { id: 'production', label: 'งานผลิต', description: 'คลังไฟล์ ส่งต่อข้ามเครื่องมือ ตรวจงาน ส่งมอบ', href: '/production', migrated: true, hidden: true },
  { id: 'knowledge', label: 'คลังความรู้', description: 'ค้นเอกสารและความสัมพันธ์', href: '/knowledge', migrated: true },
  { id: 'cloud', label: 'คลาวด์', description: 'ผู้ให้บริการ ค่าใช้จ่าย และทรัพยากร (อ่านอย่างเดียว)', href: '/cloud', migrated: true, hidden: true },
  { id: 'ai-usage', label: 'AI Usage', description: 'โควตา Claude และ Codex ค่าสมาชิก และเตือนก่อนรีเซ็ต', href: '/ai-usage', migrated: true, hidden: true },
  { id: 'accounts', label: 'บัญชี', description: 'บัญชีทุกแพลตฟอร์มและสถานะ (อ่านอย่างเดียว)', href: '/accounts', migrated: true },
  { id: 'integrations', label: 'แอปและ API', description: 'แอปภายนอกที่เชื่อมแล้วและที่วางแผนไว้ (อ่านอย่างเดียว)', href: '/integrations', migrated: true },
  { id: 'saas', label: 'SaaS ฟรี', description: 'แคตตาล็อกบริการ free tier และ starter stacks (อ่านอย่างเดียว)', href: '/saas', migrated: true },
  { id: 'crm', label: 'CRM', description: 'ลูกค้าและกิจกรรม (ยังเปิดในแอปเดิม)', href: 'http://127.0.0.1:3200', migrated: false },
  { id: 'video', label: 'วิดีโอ', description: 'Video Studio (ยังเปิดในแอปเดิม)', href: 'http://127.0.0.1:3400', migrated: false },
];

/** Modules shown in navigation and on the home page. */
export const VISIBLE_MODULES: ModuleLink[] = MODULES.filter((module) => !module.hidden);
