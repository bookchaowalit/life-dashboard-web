# ข้อเสนอเปิด Solo Web metadata staging

ตรวจบัญชีและราคาวันที่ 2026-10-04; เอกสารนี้เป็นข้อเสนอที่ตรวจทานได้
สร้าง Vercel project ว่างและ private Railway project กับ environment staging
แล้ว; พักชื่อ API ทั้งสี่เป็น staged changes ยังไม่มี image/source หรือ deployment.
ไม่มีการเปลี่ยน subscription หรืออัปโหลด metadata.

ปรับคำตัดสินใจ 2026-10-05 (Asia/Bangkok): เจ้าของเลือก value-first ให้ใช้บริการเดิม
เมื่อเพียงพอ และยอมจ่ายเมื่อมีความจำเป็นจริง ใช้ชุดทยอยเปิดใช้งานที่กรอบออกแบบ
US$30–50/เดือนสำหรับ metadata phase แรก; กรอบนี้ไม่ใช่ owner hard cap หรือราคาคงที่
ไม่ต้องขอเลือกชุดซ้ำ. ตรวจแบบ read-only ยืนยัน Vercel team เป็น Hobby;
ใช้ Pro ก่อนเปิดงานเชิงพาณิชย์จริง. Railway เริ่มสี่ API replica เดียว ไม่มี
DB/disk/worker เพิ่มจนมี active workload ต้องใช้. การเลือกค่าใช้จ่ายไม่ข้าม
identity, metadata review หรือ hosted acceptance. เจ้าของแจ้งว่าสร้าง Google client
และเก็บใน Infisical แล้ว; ชื่ออ้างอิงยังรอระบุ.

## ปลายทางที่เสนอ

| ส่วน | บัญชีที่ตรวจพบ | Resource ที่เสนอสร้าง |
|---|---|---|
| Solo Web | Vercel team `team_APNFvAx5YstCawatQ1MBneND`, slug `chaowalit-greepokes-projects` | project `solo-web-staging`, preview deployments, root `apps/solo-web` |
| Accounts / Integrations / SaaS / Knowledge APIs | Railway workspace `b98db09f-4d8f-4cb5-a4cc-2340f8381662`, `Chaowalit Greepoke's Projects` | project `solo-metadata-staging`, environment `staging`, service แยกตามชื่อ API ทั้งสี่ |

Railway project `04f2c2f1-165e-414b-b342-e660f6309e2c` และ environment
`22782810-d4d7-45e3-a872-3e4e5bd83b65` สร้างแล้ว; ชื่อ API ทั้งสี่อยู่ใน patch
`3f7f0d9c-726a-4620-8a16-11a7eb249b31` สถานะ `STAGED`.
บันทึก IDs และสถานะที่ตรวจได้ใน [actual target record](staging-targets.json).
Vercel project `prj_64OzlGrNZ3Df6DKJplKhCSHrIcQo` ชื่อ `solo-web-staging`
สร้างแล้ว; ตั้ง Next.js, root `apps/solo-web`, Node.js `22.x` และยังไม่ผูก Git source.
Vercel ยืนยัน domain `solo-web-staging.vercel.app` ผูกกับ project นี้แล้ว;
ยังไม่มี deployment หรือการ assign domain ให้ preview จึงคง `public_origin` ว่าง.
domain นี้เป็น reserved callback target; ต้องยืนยันการ routing ก่อน hosted acceptance.
ไม่ใช้ project ของลูกค้าหรือ environment production แทน staging.
ค่า region ของ staged services ที่ตรวจพบคือ `us-west2`; ยังไม่ได้เลือก/ทดสอบ Singapore.
Vercel billing plan ตรวจยืนยันเป็น Hobby แล้ว; Railway tier และ credit ที่เหลือ
ยังไม่ยืนยัน การมีบิลหรือ usage ไม่ใช่หลักฐานว่า subscription เป็น tier ใด.

เครื่องมือ provider สำหรับ update configuration ตอบ `Service instance not found`
เมื่อใช้กับ staged-create; จึงยังไม่ได้ตั้ง remote healthcheck/auth variables.
ค่าที่ตรวจแล้วใน `railway.toml` ยังเป็น local configuration.
ต้องสร้าง empty service instances และตั้งค่าก่อนผูก source หลังผ่าน activation gates.

## งบสำหรับตัดสินใจ

เสนอกรอบวางแผน **US$35 ต่อเดือนก่อนภาษีและอัตราแลกเปลี่ยน**:
เผื่อ Vercel Pro หนึ่ง developer seat US$20 และ Railway usage US$15.
เป็นประมาณการเดิม ไม่ใช่ราคาคงที่หรือการรับรอง hard cap; ใช้คำตัดสินใจ value-first
และกรอบออกแบบ US$30–50 ที่บันทึกด้านบนเมื่อดำเนินงานต่อ.
หากมี subscription ที่เหมาะสมอยู่แล้วต้องแยกค่าใช้จ่ายเดิมกับ usage เพิ่มก่อนยืนยัน.

- [Vercel pricing](https://vercel.com/pricing): Hobby US$0 สำหรับ personal/non-commercial; Pro เริ่ม US$20 ต่อเดือนและมี included usage credit.
- [Railway pricing](https://railway.com/pricing): Hobby ขั้นต่ำ US$5 พร้อม usage credit US$5; Pro ขั้นต่ำ US$20 พร้อม credit US$20. Usage เกิน credit คิดเพิ่ม.
- [Railway cost control](https://docs.railway.com/pricing/cost-control): ตรวจขอบเขตของ usage limits ก่อนตั้ง เพราะ limit ของบัญชีร่วมอาจกระทบ workload เดิม.

API ทั้งสี่ใช้ replica เดียว ไม่มี DB, volume, cron หรือ worker ในชุด metadata นี้.
ต้องวัด memory/CPU และตรวจ usage หลังทดลองจริงก่อนสรุปว่ากรอบ Railway US$15 เพียงพอ.
ไม่เปลี่ยน hard limit ที่อาจหยุดบริการเดิมเพื่อให้ตรงงบ staging.

## สิ่งที่ต้องพร้อมก่อนสร้างและส่งข้อมูล

1. ใช้คำตัดสินใจ value-first ที่บันทึกแล้วและตรวจ billing plan/credit จริง;
   monthly planning range ไม่แทน hard limit ของ provider.
2. เลือก owner OIDC application; จัด callback `/api/auth/callback`, exact origins,
   owner allowlist และค่าลับผ่านช่องทางที่อนุมัติ ไม่ใส่ค่าในเอกสารหรือ Git.
   เจ้าของเลือก Sign in with Google และวันที่ 5 ต.ค. แจ้งว่าสร้าง client ใน Infisical แล้ว;
   ต้องระบุ reference ที่ถูกต้องและตรวจ configuration โดยไม่แสดงค่าลับ
   ใช้ issuer `https://accounts.google.com` และ OAuth client ประเภท Web application.
   ลงทะเบียน callback `<SOLO_WEB_PUBLIC_ORIGIN>/api/auth/callback` ให้ตรงทุกตัวอักษร;
   ขอเฉพาะ `openid` ตาม runtime ปัจจุบัน และใช้ verified `sub` เป็น owner allowlist.
   สร้าง client ID/secret ใน Google Cloud แล้วเก็บผ่าน secret store ที่อนุมัติ;
   ไม่ใช้ email แทน subject และไม่เปิด auto-registration ให้ผู้ใช้รายแรกเป็นเจ้าของ.
   ดู [Google OIDC setup](https://developers.google.com/identity/openid-connect/openid-connect).
3. ตรวจ release context ที่ตัด anonymous identity details และ guide bodies;
   เจ้าของต้องอนุมัติ metadata ที่ยังคงอยู่ก่อนอัปโหลด.
4. ตรวจ settings ทั้งห้า runtime แล้วผูก IDs/origins/revisions/checksums จริงใน
   สำเนาของ [target template](staging-targets.example.json).
5. ทำ deployment และ smoke ตาม [runbook](../../../operations/runbooks/SOLO-WEB-STAGING.md),
   ตามด้วย owner login/read/logout และ rollback acceptance.

ผ่าน local tests หรือการเชื่อมต่อ app ไม่ถือว่า hosted setup ครบ;
สถานะปัจจุบันคือ `scaffold_staged_not_deployed`; runtime deployment ยังรอ prerequisites.

## Google OAuth application ที่ต้องสร้าง

เจ้าของแจ้งว่าทำส่วนนี้แล้ว; ตรวจ reference และ registration ให้ตรงก่อน activate.
เครื่องมือที่เชื่อมอยู่ไม่มีสิทธิ์จัดการ Google Cloud OAuth clients;
ขั้นตอนอ้างอิงใน [Google Cloud Clients](https://console.cloud.google.com/auth/clients) คือ:
สร้างหรือเลือก project ของตน แล้วตั้ง branding เป็น `Solo Web staging`.
หากใช้ Audience แบบ External/Testing ให้เพิ่ม Google account ของเจ้าของเป็น test user.
สร้าง client ชนิด **Web application** ชื่อ `Solo Web staging` และตั้ง
Authorized redirect URI เป็น **`https://solo-web-staging.vercel.app/api/auth/callback`**.
ใช้ scope `openid` ตาม runtime; server flow นี้ไม่ต้องใช้ wildcard origins.
เก็บ client ID/secret ผ่าน secret store ที่อนุมัติและบันทึกเฉพาะ reference ใน target record.
ต้องมี owner `sub` จาก ID token ที่ผ่านการตรวจลายเซ็น/issuer/audience/nonce;
การเลือก Google account ในแชตยังไม่ใช่หลักฐาน verified subject.
ดู [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect).

domain ข้างต้นเป็น default project domain ซึ่งยังไม่ route ไป preview.
หลัง activation gates ผ่าน ต้อง assign ให้ preview deployment ที่ตรวจแล้วและตรวจการ
routing/protection ตาม [Vercel alias](https://vercel.com/docs/cli/alias)
ก่อนเติม actual origin และทดสอบ Google callback; การจอง domain ไม่ถือว่าเว็บใช้งานได้.

## ชุดข้อมูลสำหรับตรวจทานก่อนอัปโหลด

เตรียม local draft ของ API ทั้งสี่แล้วและตรวจ file hashes ทุกไฟล์ตรงกับ manifest.
ยังมี `includes_uncommitted_changes=true` ทั้งสี่ชุด จึงใช้เพื่อ review เท่านั้น;
ต้อง export ใหม่จาก revision ที่ commit แล้วก่อน deploy. ยังไม่ได้ build containers.

| API | ข้อมูลที่คงอยู่ใน build context |
|---|---|
| Accounts | scalar fields ตาม public .v1; anonymous identities เหลือ aggregate counts/statuses กับ isolation flag |
| Integrations | declared TS registry และ synthetic guide pointers; ไม่ส่ง guide bodies |
| SaaS Catalog | canonical SaaS catalog ที่ service ประกาศอ่าน |
| Knowledge | document catalog metadata ซึ่งยังมีชื่อและเส้นทางเอกสาร |

คำว่า public .v1 เป็นชื่อ projection ของ API ไม่ใช่การอนุมัติเปิดข้อมูลสู่สาธารณะ.
metadata ที่เหลือยังต้องผ่าน owner publication review; `publication_status` ยังคง
`not_approved` และการอ่านข้อมูลต้องผ่าน owner authentication.
