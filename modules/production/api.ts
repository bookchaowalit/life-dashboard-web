export type QAStatus = 'accepted' | 'rejected' | 'needs_review';
export type ReviewStatus = 'draft' | 'in_review' | 'changes_requested' | 'approved' | 'delivered';

export interface ArtifactRow {
  artifact_id: string;
  kind: string;
  filename: string;
  byte_size: number;
  tool_id: string;
  job_id: string;
  project_id: string | null;
  qa_status: QAStatus;
  created_at: string;
}

export interface OptionalParamInfo {
  default: string;
  choices: string[];
  description: string;
}

export interface SendOption {
  handoff_id: string;
  to_tool: string;
  status: 'implemented' | 'planned';
  available: boolean;
  required_params: string[];
  optional_params?: Record<string, OptionalParamInfo>;
  extra_kinds: string[];
}

export interface ArtifactRecord {
  artifact_id: string;
  kind: string;
  media_type: string;
  byte_size: number;
  filename: string;
  producer: { tool_id: string; tool_version: string; job_id: string; recipe_version?: string };
  lineage: string[];
  qa: { status: QAStatus };
  privacy_class: string;
  project_id?: string;
  attributes?: Record<string, unknown>;
  created_at: string;
  used_by: string[];
  sends: SendOption[];
}

export interface LineageNode {
  artifact_id: string;
  kind: string;
  filename: string;
  producer: { tool_id: string };
  inputs?: LineageNode[];
  inputs_truncated?: number;
}

export interface ProjectSummary {
  project_id: string;
  name: string;
  client: string | null;
  status: string;
  artifacts: number;
  approved: number | null;
  created_at: string;
}

export interface ProjectArtifact {
  artifact_id: string;
  kind: string;
  filename: string;
  byte_size: number;
  tool_id: string;
  qa_status: QAStatus;
  privacy_class: string;
  review_status: ReviewStatus;
  updated_at: string;
}

export interface Registry {
  kinds: Record<string, { description: string; media_types: string[] }>;
  tools: Record<string, { produces: string[]; consumes: string[] }>;
}

export type FlowState = 'pending' | 'running' | 'waiting_approval' | 'completed' | 'failed';

export interface FlowSummary {
  flow_id: string;
  project_id: string;
  status: FlowState;
  error: string | null;
  steps: number;
  completed: number;
  updated_at: string;
}

export interface FlowStep {
  step_id: string;
  type: 'send' | 'gate';
  handoff?: string;
  status: FlowState;
  send_id?: string | null;
  output_ids?: string[];
  error?: string | null;
}

export interface FlowDetail {
  flow_id: string;
  project_id: string;
  status: FlowState;
  error: string | null;
  steps: FlowStep[];
}

export type ConverterStatus = 'implemented' | 'available' | 'planned';

export type JobState = 'queued' | 'running' | 'completed' | 'failed';

export interface JobView {
  job_id: string;
  kind: 'send' | 'flow';
  status: JobState;
  error: string | null;
  log: string[];
  result: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

/** What the UI tracks while a job runs; the full JobView is a superset. */
export type JobProgress = Pick<JobView, 'status' | 'log'>;

export interface SendStart {
  job_id: string;
  kind: 'send';
  status: 'queued';
}

export interface SendOutput {
  artifact_id: string;
  kind: string;
  filename: string;
}

export interface SendDryRun {
  send_id: string;
  handoff_id: string;
  dry_run: true;
  outputs: SendOutput[];
}

export type SendResponse = SendStart | SendDryRun;

export interface FlowJobStart {
  job_id: string;
  flow_id: string;
  status: 'queued';
}

export interface TemplateInputInfo {
  name: string;
  kind: string;
  label: string;
  required: boolean;
}

export interface TemplateParamInfo {
  required: boolean;
  choices: string[];
  default: string;
  description: string;
}

export interface FlowTemplateInfo {
  id: string;
  label: string;
  description: string;
  inputs: TemplateInputInfo[];
  params: Record<string, TemplateParamInfo>;
}

export interface FormatEntry {
  domain: string;
  ext: string[];
  media: string;
  text: 'authored' | 'generated' | 'binary';
  roles: string[];
  kinds?: string[];
  note?: string;
}

export interface FormatRegistry {
  summary: { domains: number; formats: number; effects: number; converters: number; by_status: Record<string, number> };
  levels: Record<string, string>;
  domains: Record<string, { label: string; max_level: string; note?: string }>;
  formats: Record<string, FormatEntry>;
  effects: Record<string, { domain: string; description: string }>;
}

export interface RouteStep {
  from: string;
  to: string;
  converter: string;
  tool: string;
  status: ConverterStatus;
  level: string;
  requires: string[];
  approval: 'human' | null;
  missing?: string[];
  runnable?: boolean;
}

export interface Route {
  from: string;
  to: string;
  hops: number;
  ready: boolean;
  runnable_now: boolean;
  needs_approval: boolean;
  requires: string[];
  missing: string[];
  steps: RouteStep[];
}

export interface RuntimeState {
  label: string;
  status: 'installed' | 'missing' | 'manual';
  found: string | null;
}

export class HubError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}

type Fetcher = typeof fetch;

async function call<T>(path: string, init: RequestInit = {}, fetcher: Fetcher = fetch): Promise<T> {
  let response: Response;
  try {
    response = await fetcher(`/api/production/${path}`, { cache: 'no-store', ...init });
  } catch {
    throw new HubError('network_error', 'เชื่อมต่อ Console ไม่ได้ ลองรีเฟรชหน้า', 0);
  }
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    throw new HubError('invalid_response', 'Production Hub ตอบกลับในรูปแบบที่อ่านไม่ได้', response.status);
  }
  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string } } | null)?.error;
    throw new HubError(error?.code ?? 'http_error', error?.message ?? 'ทำรายการไม่สำเร็จ', response.status);
  }
  return payload as T;
}

const post = <T>(path: string, body: unknown, fetcher?: Fetcher) =>
  call<T>(path, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }, fetcher);

export const api = {
  health: (f?: Fetcher) => call<{ status: string }>('v1/health', {}, f),
  registry: (f?: Fetcher) => call<Registry>('v1/registry', {}, f),
  artifacts: (filters: { kind?: string; tool?: string; project?: string }, f?: Fetcher) => {
    const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value) as [string, string][]);
    return call<{ items: ArtifactRow[] }>(`v1/artifacts${query.size ? `?${query}` : ''}`, {}, f);
  },
  artifact: (id: string, f?: Fetcher) => call<ArtifactRecord>(`v1/artifacts/${id}`, {}, f),
  lineage: (id: string, f?: Fetcher) => call<LineageNode>(`v1/artifacts/${id}/lineage`, {}, f),
  contentUrl: (id: string) => `/api/production/v1/artifacts/${id}/content`,
  projects: (f?: Fetcher) => call<{ items: ProjectSummary[] }>('v1/projects', {}, f),
  project: (id: string, f?: Fetcher) =>
    call<{ project: ProjectSummary; artifacts: ProjectArtifact[] }>(`v1/projects/${id}`, {}, f),
  createProject: (body: { project_id: string; name: string; client?: string }, f?: Fetcher) =>
    post<{ created: boolean }>('v1/projects', body, f),
  review: (project: string, body: { artifact_id: string; status: ReviewStatus; comment?: string }, f?: Fetcher) =>
    post<{ from: ReviewStatus; to: ReviewStatus }>(`v1/projects/${project}/review`, body, f),
  packageProject: (project: string, f?: Fetcher) =>
    post<{ artifact_id: string; path: string; files: number }>(`v1/projects/${project}/package`, {}, f),
  flows: (f?: Fetcher) => call<{ items: FlowSummary[] }>('v1/flows', {}, f),
  flow: (id: string, f?: Fetcher) => call<FlowDetail>(`v1/flows/${id}`, {}, f),
  flowTemplates: (f?: Fetcher) => call<{ items: FlowTemplateInfo[] }>('v1/flow-templates', {}, f),
  startFlowTemplate: (id: string, body: { project_id?: string; inputs: Record<string, string>; params: Record<string, string> }, f?: Fetcher) =>
    post<FlowJobStart>(`v1/flow-templates/${id}`, body, f),
  runFlow: (definition: unknown, f?: Fetcher) => post<FlowJobStart>('v1/flows', definition, f),
  resumeFlow: (id: string, f?: Fetcher) => post<FlowJobStart>(`v1/flows/${id}/resume`, {}, f),
  job: (id: string, f?: Fetcher) => call<JobView>(`v1/jobs/${id}`, {}, f),
  formats: (f?: Fetcher) => call<FormatRegistry>('v1/formats', {}, f),
  runtimes: (refresh = false, f?: Fetcher) =>
    call<{ runtimes: Record<string, RuntimeState> }>(`v1/runtimes${refresh ? '?refresh=1' : ''}`, {}, f),
  path: (query: { from: string; to: string; implementedOnly?: boolean }, f?: Fetcher) => {
    const params = new URLSearchParams({ from: query.from, to: query.to });
    if (query.implementedOnly) params.set('implemented_only', '1');
    return call<{ source: string; target: string; routes: Route[] }>(`v1/path?${params}`, {}, f);
  },
  send: (body: { artifact_id: string; to: string; params: Record<string, string>; with?: string[]; dry_run?: boolean }, f?: Fetcher) =>
    post<SendResponse>('v1/send', body, f),
};

export const REVIEW_LABELS: Record<ReviewStatus, string> = {
  draft: 'ร่าง',
  in_review: 'รอตรวจ',
  changes_requested: 'ขอแก้ไข',
  approved: 'อนุมัติแล้ว',
  delivered: 'ส่งมอบแล้ว',
};

export const NEXT_REVIEW: Record<ReviewStatus, ReviewStatus[]> = {
  draft: ['in_review', 'approved'],
  in_review: ['approved', 'changes_requested'],
  changes_requested: ['draft', 'in_review'],
  approved: ['delivered', 'changes_requested'],
  delivered: [],
};

export const FLOW_LABELS: Record<FlowState, string> = {
  pending: 'รอเริ่ม',
  running: 'กำลังรัน',
  waiting_approval: 'รออนุมัติ',
  completed: 'เสร็จแล้ว',
  failed: 'ล้มเหลว',
};

export const JOB_LABELS: Record<JobState, string> = {
  queued: 'รอคิว',
  running: 'กำลังรันเครื่องมือ',
  completed: 'เสร็จแล้ว',
  failed: 'ล้มเหลว',
};

/** English validate_flow / template problems the Hub returns, one Thai phrase at a time. */
const FLOW_ERROR_RULES: [RegExp, string][] = [
  [/schema_version must be hub-flow\.v1/, 'ต้องตั้ง schema_version เป็น "hub-flow.v1"'],
  [/(?:flow_id|project_id) must be lowercase letters, digits, - or _/, 'flow_id/project_id ต้องใช้ตัวพิมพ์เล็ก a-z ตัวเลข และ - เท่านั้น'],
  [/steps must be a list of 1-(\d+) steps/, 'steps ต้องเป็นลิสต์ 1-$1 ขั้น'],
  [/\.id must be a unique lowercase id/, 'รหัส step ต้องเป็นพิมพ์เล็กและไม่ซ้ำกัน'],
  [/needs exactly one of send or gate/, 'แต่ละ step ต้องมี send หรือ gate อย่างใดอย่างหนึ่ง'],
  [/must be an implemented handoff with a send adapter/, 'handoff นี้ยังไม่พร้อมใช้งาน (ต้องเป็นเส้นทางที่ implemented และมี adapter)'],
  [/params is missing (.+)/, 'params ขาด: $1'],
  [/params must map names to strings/, 'params ต้องเป็นชื่อ → ข้อความเท่านั้น'],
  [/(\S+) must be one of ([\w.,-]+)/, '$1 ต้องเป็นหนึ่งใน: $2'],
  [/from_step must name an earlier step/, 'from_step ต้องอ้างถึง step ที่อยู่ก่อนหน้า'],
  [/kind is required with from_step/, 'เมื่อใช้ from_step ต้องระบุ kind ด้วย'],
  [/approve_kinds must list at least one kind/, 'จุดตรวจต้องระบุ kind ที่ต้องอนุมัติอย่างน้อย 1 ชนิด'],
  [/already exists with a different definition/, 'flow id นี้ถูกใช้แล้วด้วยเนื้อหาต่างกัน — ตั้ง flow id ใหม่'],
  [/unknown flow: (\S+)/, 'ไม่พบ flow $1'],
  [/artifact is not registered: (\S+)/, 'ไม่พบไฟล์ในคลัง: $1'],
  [/template needs parameter\(s\): (.+)/, 'template ต้องการพารามิเตอร์: $1'],
  [/template needs input (\w+)/, 'template ต้องเลือกไฟล์: $1'],
  [/does not take parameter\(s\): (.+)/, 'template ไม่รับพารามิเตอร์: $1'],
  [/gate has no artifacts to approve/, 'จุดตรวจไม่มีไฟล์ให้อนุมัติ'],
  [/has (\d+) (\S+) outputs matching the selector; need exactly one/, 'step ต้นทางมีไฟล์ชนิด $2 อยู่ $1 ไฟล์ (ต้องมีพอดี 1 ไฟล์)'],
];

export function translateFlowError(text: string): string {
  let result = text;
  for (const [pattern, replacement] of FLOW_ERROR_RULES) result = result.replace(pattern, replacement);
  return result;
}

/** Reuses the QA pill colours: done = green, failed = red, waiting = amber. */
export const FLOW_PILL: Record<FlowState, string> = {
  pending: '',
  running: 'needs_review',
  waiting_approval: 'needs_review',
  completed: 'accepted',
  failed: 'rejected',
};

export const LEVEL_LABELS: Record<string, string> = {
  L1: 'สร้างไฟล์',
  L2: 'จำลอง',
  L3: 'ตรวจ',
  L4: 'เตรียมชุดปฏิบัติการ',
  L6: 'ลงมือจริง',
};

export function stepState(step: RouteStep): { label: string; pill: string } {
  if (step.status === 'implemented') return { label: 'ใช้ได้แล้ว', pill: 'accepted' };
  if (step.status === 'planned') return { label: 'อยู่ในแผน', pill: '' };
  return step.runnable
    ? { label: 'ติดตั้งแล้ว ยังไม่ได้เชื่อม', pill: 'needs_review' }
    : { label: `ต้องติดตั้ง ${(step.missing ?? step.requires).join(', ')}`, pill: 'rejected' };
}

export const QA_LABELS: Record<QAStatus, string> = {
  accepted: 'ผ่าน QA',
  rejected: 'ไม่ผ่าน QA',
  needs_review: 'รอตรวจ QA',
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

export const shortId = (id: string): string => id.slice(7, 19);

export const isPreviewable = (mediaType: string): boolean =>
  mediaType.startsWith('image/') || mediaType === 'application/pdf';
