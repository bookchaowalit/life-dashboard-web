/** Navigation for the unified shell. `href` is internal for migrated modules and external for legacy apps. */
export interface ModuleLink {
  id: string;
  label: string;
  description: string;
  href: string;
  migrated: boolean;
}

export const MODULES: ModuleLink[] = [
  { id: 'today', label: 'วันนี้', description: 'งานที่ต้องทำวันนี้และความคืบหน้า', href: '/today', migrated: true },
  { id: 'production', label: 'งานผลิต', description: 'คลังไฟล์ ส่งต่อข้ามเครื่องมือ ตรวจงาน ส่งมอบ', href: '/production', migrated: true },
  { id: 'knowledge', label: 'คลังความรู้', description: 'ค้นเอกสารและความสัมพันธ์', href: '/knowledge', migrated: true },
  { id: 'cloud', label: 'คลาวด์', description: 'ผู้ให้บริการ ค่าใช้จ่าย และทรัพยากร (อ่านอย่างเดียว)', href: '/cloud', migrated: true },
  { id: 'accounts', label: 'บัญชี', description: 'บัญชีทุกแพลตฟอร์มและสถานะ (อ่านอย่างเดียว)', href: '/accounts', migrated: true },
  { id: 'crm', label: 'CRM', description: 'ลูกค้าและกิจกรรม (ยังเปิดในแอปเดิม)', href: 'http://127.0.0.1:3200', migrated: false },
  { id: 'video', label: 'วิดีโอ', description: 'Video Studio (ยังเปิดในแอปเดิม)', href: 'http://127.0.0.1:3400', migrated: false },
];
