# دليل الخروج الآمن من Lovable Cloud إلى Supabase مستقل

تاريخ التحقق: 19 يوليو 2026

هذا الدليل خاص بمشروع Concept AI / The Joy Creator. لا تنفذ خطوة الحذف قبل الوصول إلى بوابة القرار في نهاية الملف.

## 1. ما تغير في سياسة Lovable

الخاصية أصبحت موثقة رسميًا في Lovable Cloud:

- المسار: `Cloud tab → Overview → Advanced settings`.
- `Export project data` يصدر قاعدة البيانات كاملة: البنية والبيانات.
- التصدير لا يشمل ملفات Storage الفعلية، كود Edge Functions، أو Secrets.
- الحد الأقصى للتصدير 5 GB.
- يمكن طلب تصدير واحد كل 24 ساعة.
- Lovable يرسل رابط تنزيل مؤقت عبر البريد.
- `Pause Cloud` يوقف قاعدة البيانات وAuth وStorage وEdge Functions، لكن بيانات التخزين تبقى وتستمر تكلفة التخزين.
- `Remove Lovable Cloud` يحذف Cloud instance نهائيًا ولا يمكن التراجع عنه.
- الحذف يتطلب الموافقة على التحذيرات وكتابة اسم المشروع المعروض حرفيًا.

المصدر الرسمي:

- https://docs.lovable.dev/integrations/cloud#export-lovable-cloud-data

هناك صفحة أقدم في وثائق Lovable ما زالت تصف نقل البيانات بـCSV وإعادة كلمات المرور. لا نعتمد عليها لهذا المشروع. نعتمد صفحة التصدير الجديدة، ونفحص ملف التصدير نفسه قبل أي قرار.

## 2. هدف النقل المقترح

نقسم النقل بدل تنفيذ خروج كامل في خطوة واحدة:

1. **Managed Supabase مستقل** لقاعدة البيانات وAuth وStorage وEdge Functions.
2. فصل Google OAuth عن `@lovable.dev/cloud-auth-js`.
3. فصل AI عن `ai.gateway.lovable.dev`.
4. نشر الواجهة من GitHub على استضافة مستقلة.
5. حذف Lovable Cloud بعد اكتمال الفحص فقط.
6. تقييم self-hosted Supabase لاحقًا إذا كان أوفر فعلًا بعد حساب التشغيل والنسخ الاحتياطي والمراقبة.

هذا الترتيب يقلل احتمال توقف التطبيق أو فقد المستخدمين والبيانات.

---

# المرحلة 0 — إيقاف المخاطر قبل العمل

## 0.1 ممنوعات

- لا تضغط `Remove Lovable Cloud`.
- لا تغير `.env` على `main` قبل تجهيز البيئة الجديدة.
- لا تستعيد النسخة مباشرة فوق إنتاج مستخدم.
- لا تنقل مفاتيح سرية عبر chat أو GitHub issues أو commits.
- لا تعتمد على migrations وحدها؛ يوجد دليل على schema drift في الأنواع المولدة.
- لا تعتمد على نجاح واجهة التطبيق فقط؛ اختبر RLS وAuth وEdge Functions والبيانات.

## 0.2 إنشاء سجل النقل

أنشئ مجلدًا مشفرًا خارج GitHub:

```text
concept-ai-migration-2026-07-19/
  database/
  storage/
  inventories/
  logs/
  checksums/
  secrets-names-only/
```

ضع الملف المصدّر وملفات المستخدمين في تخزين مشفر. قاعدة البيانات قد تحتوي بريدًا شخصيًا وpassword hashes وبيانات مشاريع.

## 0.3 اختيار النطاق والمنطقة

أنشئ مشروع Supabase جديد منفصل عن أي مشروع تجريبي قديم:

- اسم واضح مثل `concept-ai-production-candidate`.
- المنطقة الأقرب للمستخدمين المستهدفين.
- كلمة مرور قاعدة قوية ومحفوظة في password manager.
- فعّل خطة تسمح بحجم البيانات المتوقع وEdge Functions المطلوبة.

استخدم بيئة مرشحة للإنتاج، لكن لا تربط نطاق الإنتاج بها بعد.

---

# المرحلة 1 — جرد المصدر قبل التصدير

## 1.1 سجل حالة GitHub

```bash
git fetch --all --tags
git checkout main
git pull --ff-only
git rev-parse HEAD
git status --short
```

احفظ SHA الناتج في `inventories/source-commit.txt`.

## 1.2 جرد قاعدة البيانات من Lovable Dashboard

سجل أو التقط صورًا للقيم التالية دون إظهار بيانات المستخدمين:

- حجم قاعدة البيانات.
- نسخة PostgreSQL إن ظهرت.
- Extensions المفعلة.
- أسماء الجداول والمخططات.
- عدد الصفوف لكل جدول مهم.
- عدد مستخدمي Auth.
- Auth providers المفعلة وإعدادات email confirmation.
- Realtime publications.
- Jobs أو cron jobs.
- Database webhooks.
- أسماء Secrets فقط، لا القيم.

استعلامات جرد مقترحة إذا توفر SQL editor:

```sql
select version();

select pg_size_pretty(pg_database_size(current_database())) as database_size;

select extname, extversion
from pg_extension
order by extname;

select schemaname, tablename, rowsecurity
from pg_tables
where schemaname in ('public', 'auth', 'storage', 'cron', 'vault')
order by schemaname, tablename;

select 'auth.users' as object, count(*) as rows from auth.users
union all select 'public.profiles', count(*) from public.profiles
union all select 'public.user_roles', count(*) from public.user_roles
union all select 'public.reports', count(*) from public.reports
union all select 'public.report_comments', count(*) from public.report_comments
union all select 'public.report_status_history', count(*) from public.report_status_history
union all select 'public.notifications', count(*) from public.notifications
union all select 'public.analysis_requests', count(*) from public.analysis_requests
union all select 'public.analysis_rate_limits', count(*) from public.analysis_rate_limits;
```

إذا كان `edge_rate_limits` موجودًا:

```sql
select count(*) from public.edge_rate_limits;
```

## 1.3 جرد Storage

من `Cloud → Storage`:

- سجل أسماء buckets.
- سجل public/private لكل bucket.
- سجل عدد الملفات والحجم الإجمالي.
- نزّل كل الملفات مع المحافظة على المسارات.
- نزّل metadata إضافية إن كانت الواجهة توفرها.

إذا لم توجد buckets أو ملفات، احفظ إثباتًا باسم `storage-empty.txt` بدل تجاهل الخطوة.

## 1.4 جرد Edge Functions

المشروع يحتوي حاليًا على:

```text
analyze-concept
autofill-brief
complete-field
_shared/
```

سجل إعداد JWT لكل دالة من Dashboard. ملف `supabase/config.toml` يحدد `verify_jwt = true` لدالة `analyze-concept` فقط، لذلك يجب تأكيد إعداد الدالتين الأخريين وعدم افتراضه.

## 1.5 جرد Secrets

الأسماء المتوقعة من الكود:

```text
LOVABLE_API_KEY
TAVILY_API_KEY
ANALYSIS_MODEL_ID
AUTOFILL_MODEL_ID
COMPLETE_FIELD_MODEL_ID
ALLOWED_ORIGINS
RATE_LIMIT_HASH_SALT
```

قيم `SUPABASE_*` يديرها مشروع Supabase. لا تنسخ service role أو database URL إلى الواجهة.

بما أن Lovable Secrets write-only، استرجع القيم من مزود الخدمة أو أنشئ مفاتيح جديدة. الأفضل تدوير المفاتيح بعد النقل.

---

# المرحلة 2 — تصدير Lovable Cloud

## 2.1 تصدير قاعدة البيانات

1. افتح المشروع في Lovable.
2. افتح `Cloud tab`.
3. اختر `Overview`.
4. افتح `Advanced settings`.
5. في `Export project data` اضغط `Export data`.
6. في بطاقة Database اضغط `Export` ثم `Start export`.
7. افتح البريد المرتبط بحساب Lovable.
8. نزّل الملف فور وصول الرابط؛ الرابط مؤقت.
9. لا تضغط Remove.

## 2.2 إنشاء نسختين وتوقيع checksum

على macOS/Linux:

```bash
cp /path/to/downloaded-file ./database/lovable-cloud-export.original
cp ./database/lovable-cloud-export.original ./database/lovable-cloud-export.working
shasum -a 256 ./database/lovable-cloud-export.original | tee ./checksums/database.sha256
```

على Windows PowerShell:

```powershell
Copy-Item "C:\path\export" ".\database\lovable-cloud-export.original"
Copy-Item ".\database\lovable-cloud-export.original" ".\database\lovable-cloud-export.working"
Get-FileHash ".\database\lovable-cloud-export.original" -Algorithm SHA256 |
  Format-List | Out-File ".\checksums\database.sha256"
```

## 2.3 تحديد صيغة الملف بدل التخمين

المنشور المجتمعي يصف الملف كـPostgreSQL custom backup، لكن الدليل الرسمي العام لا يحدد الصيغة في النص. افحص الملف:

```bash
file ./database/lovable-cloud-export.working
pg_restore --list ./database/lovable-cloud-export.working > ./inventories/restore-list.txt
```

القرار:

- إذا نجح `pg_restore --list` فالملف archive ويستعاد عبر `pg_restore`.
- إذا كان SQL نصيًا، استعده عبر `psql`.
- إذا كان مضغوطًا، فك الضغط أولًا ثم أعد الفحص.
- استخدم عميل PostgreSQL حديثًا ومتوافقًا مع نسخة المصدر. لا تثبت على إصدار قديم.

راجع `restore-list.txt` وابحث عن:

```text
SCHEMA auth
TABLE auth users
SCHEMA storage
TABLE public reports
ROW SECURITY
FUNCTION
TRIGGER
EXTENSION
cron
vault
```

وجود `auth.users` وبيانات auth هو شرط قبل اعتماد أن كلمات المرور انتقلت. لا نكتفي بما ورد في منشور.

---

# المرحلة 3 — تجهيز Supabase الجديد

## 3.1 احفظ معلومات الاتصال بأمان

من Supabase Dashboard سجل في password manager:

- Project ref.
- Project URL.
- Publishable/anon key.
- Database password.
- Session pooler connection string.
- Direct connection string إن كانت الشبكة تدعمها.

## 3.2 لا تنفذ migrations قبل استعادة full backup

لأن النسخة الكاملة تشمل المخطط والبيانات، تشغيل migrations أولًا قد يسبب تضارب objects. ابدأ بالاستعادة في مشروع فارغ جديد، ثم طابق migration history بعد نجاح الاستعادة.

## 3.3 فعّل المتطلبات الظاهرة في الجرد

قبل الاستعادة:

- Extensions غير الافتراضية.
- Database webhooks عند وجودها.
- إعدادات شبكة مطلوبة.
- حجم Compute/Disk مناسب للتصدير.

لا تنشئ الجداول يدويًا.

---

# المرحلة 4 — استعادة قاعدة البيانات في بيئة الاختبار

## 4.1 استخدم Session Pooler أو Direct connection

صيغة عامة:

```bash
export TARGET_DB_URL='postgresql://postgres.[NEW_REF]:[PASSWORD]@[SESSION_POOLER_HOST]:5432/postgres'
```

لا تحفظ هذا السطر في shell history على جهاز مشترك.

## 4.2 إذا كان الملف custom/archive

أنشئ سجلًا أولًا:

```bash
pg_restore \
  --dbname="$TARGET_DB_URL" \
  --no-owner \
  --no-privileges \
  --verbose \
  ./database/lovable-cloud-export.working \
  2>&1 | tee ./logs/pg-restore.log
```

قد تحتاج خيارات إضافية حسب محتوى الملف. لا تستخدم `--clean` ضد مشروع فيه بيانات مهمة. البيئة الجديدة يجب أن تكون فارغة وقابلة لإعادة الإنشاء.

## 4.3 إذا كان الملف SQL نصيًا

```bash
psql \
  --dbname="$TARGET_DB_URL" \
  --variable=ON_ERROR_STOP=1 \
  --file=./database/lovable-cloud-export.working \
  2>&1 | tee ./logs/psql-restore.log
```

## 4.4 التعامل مع أخطاء auth/storage الموجودة مسبقًا

مشروع Supabase الجديد يحتوي مخططات نظام مسبقة. بعض أخطاء `already exists` قد تظهر أثناء full restore. لا تعتبر كل خطأ مقبولًا تلقائيًا.

صنف السجل إلى:

- أخطاء متوقعة لمخططات Supabase النظامية.
- أخطاء Extensions.
- أخطاء owners/roles/grants.
- أخطاء قيود أو triggers.
- أخطاء توقف الاستعادة أو فقد بيانات.

أعد المشروع من الصفر إذا خرجت الاستعادة بحالة غير مفهومة. لا ترقع إنتاجًا يدويًا دون migration موثقة.

## 4.5 مطابقة المخطط والبيانات

نفذ نفس استعلامات الجرد في المصدر والهدف وقارن النتائج.

تحقق أيضًا من:

```sql
select n.nspname as schema_name,
       c.relname as table_name,
       c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r'
  and n.nspname in ('public', 'auth', 'storage')
order by 1, 2;

select routine_schema, routine_name, security_type
from information_schema.routines
where routine_schema = 'public'
order by routine_name;

select event_object_schema, event_object_table, trigger_name
from information_schema.triggers
where event_object_schema = 'public'
order by event_object_table, trigger_name;
```

راجع خصوصًا:

- `get_report_by_slug`
- `can_view_report`
- `get_report_comments`
- `get_report_comment_profiles`
- `get_report_status_history`
- `set_report_group_archived`
- `begin_analysis_request`
- `complete_analysis_request`
- `is_canonical_report_output`

## 4.6 مطابقة migration history

بعد نجاح restore:

```bash
supabase link --project-ref NEW_PROJECT_REF
supabase migration list
supabase db diff --linked
```

لا تشغل `supabase db push` بشكل أعمى. عالج الفرق بين:

- المخطط المستعاد.
- `supabase/migrations` في GitHub.
- `src/integrations/supabase/types.ts`.

أنشئ migration reconciliation جديدة فقط إذا ظهر فرق حقيقي مطلوب. لا تعدل migrations القديمة التي طبقت على الإنتاج.

بعد المطابقة:

```bash
supabase gen types typescript --linked > src/integrations/supabase/types.ts
```

راجع diff قبل commit.

---

# المرحلة 5 — Auth والمستخدمون

## 5.1 فحص نقل المستخدمين

قارن:

```sql
select count(*) from auth.users;
select provider, count(*)
from auth.identities
group by provider
order by provider;
```

تحقق من وجود hashed passwords والidentities دون طباعتها أو تصديرها في logs.

Supabase يدعم نقل جداول auth بما فيها password hashes عند نقل auth schema كاملًا. مع ذلك، JWT secret في المشروع الجديد يختلف غالبًا، لذلك الجلسات القديمة ستصبح غير صالحة ويحتاج المستخدم لتسجيل الدخول مرة أخرى. هذا مقبول وأأمن من محاولة نقل أسرار غير قابلة للقراءة من Lovable.

## 5.2 إعداد البريد وكلمة المرور

في Supabase الجديد:

- Auth → Providers → Email.
- طابق إعداد confirm email المطلوب.
- اضبط Site URL.
- أضف Redirect URLs لبيئة الاختبار والإنتاج.
- اضبط SMTP مخصص قبل الإنتاج إذا كان التطبيق يرسل رسائل تأكيد أو استعادة كلمة مرور.

## 5.3 إعداد Google OAuth

- أنشئ أو استخدم Google OAuth credentials مملوكة لنا.
- أضف callback URL الذي يعرضه Supabase.
- أضف نطاق الاختبار ونطاق الإنتاج إلى authorized origins/redirects حسب إعداد Google.
- فعّل Google provider في Supabase.

## 5.4 تعديل الكود قبل cutover

احذف اعتماد التشغيل على Lovable Auth:

- استبدل `lovable.auth.signInWithOAuth("google")` بـ `supabase.auth.signInWithOAuth`.
- مرر `redirectTo` إلى مسار رجوع عام مسموح.
- احتفظ بمنطق `rememberAuthReturnPath` ثم ارجع للمسار المحمي بعد الجلسة.
- احذف `src/integrations/lovable/index.ts` إذا لم يعد مستخدمًا.
- احذف `@lovable.dev/cloud-auth-js` من dependencies.
- أضف اختبارات Google redirect وemail/password/session restore.

لا تنفذ هذا على `main` قبل وجود مشروع اختبار يعمل.

---

# المرحلة 6 — Storage

## 6.1 ملاحظة مهمة

قاعدة البيانات قد تحتوي metadata الخاصة بـStorage، لكن ملف export لا يحتوي bytes الفعلية للملفات. يجب رفع الملفات المنزلة إلى buckets الهدف.

## 6.2 إعادة إنشاء الإعدادات

لكل bucket:

- الاسم نفسه.
- public/private نفسه.
- limits وMIME restrictions إن وجدت.
- RLS policies نفسها.

## 6.3 رفع الملفات والتحقق

- حافظ على full object path.
- حافظ على content type وcache control عند توفرهما.
- قارن عدد الملفات والحجم الإجمالي.
- اختبر تنزيل ملف خاص بجلسة مصرح لها.
- اختبر منع مستخدم غير مصرح له.

لا تعتمد على ظهور metadata في Dashboard كدليل على وجود الملف الفعلي.

---

# المرحلة 7 — Edge Functions وSecrets

## 7.1 ربط Supabase CLI

```bash
supabase login
supabase link --project-ref NEW_PROJECT_REF
```

## 7.2 إعداد Secrets

مثال عام:

```bash
supabase secrets set \
  TAVILY_API_KEY='...' \
  ALLOWED_ORIGINS='https://staging.example.com,https://production.example.com' \
  RATE_LIMIT_HASH_SALT='...'
```

لا تستخدم قيمة `LOVABLE_API_KEY` بعد فصل AI Gateway.

## 7.3 نشر الدوال

بعد ضبط `supabase/config.toml` للدوال الثلاث:

```bash
supabase functions deploy analyze-concept
supabase functions deploy autofill-brief
supabase functions deploy complete-field
```

تأكد من `verify_jwt = true` لكل دالة تحتاج جلسة مستخدم. الكود الحالي يرفض الطلبات بلا Authorization، لكن إعداد البوابة يجب أن يطابق ذلك أيضًا.

## 7.4 اختبار الدوال

اختبر:

- طلب بلا JWT يرجع 401.
- JWT غير صالح يرجع 401.
- Origin غير مسموح يرجع 403.
- body غير صالح يرجع 400.
- rate limit وidempotency يعملان.
- الفشل لا ينشئ تقريرًا جزئيًا.
- نجاح التحليل يسجل lifecycle metadata دون تخزين brief كامل في logs.

---

# المرحلة 8 — فصل Lovable AI Gateway

هذه المرحلة مطلوبة لخفض تكلفة Lovable فعليًا.

## 8.1 الوضع الحالي

كل وظائف AI تستخدم endpoint:

```text
https://ai.gateway.lovable.dev/v1/chat/completions
```

وتستخدم `LOVABLE_API_KEY`.

## 8.2 التعديل المطلوب

أنشئ interface موحدًا مثل:

```text
AIProvider
  completeText()
  completeStructured()
```

ثم نفذ provider مباشرًا لمزود نختاره. يجب أن يغطي:

- timeout.
- structured output/tool calling.
- token limits.
- error mapping.
- retry policy محدود.
- request metadata دون prompts حساسة.
- model IDs قابلة للتهيئة من secrets.
- اختبارات mock لجميع حالات الخطأ الحالية.

لا تربط business logic بمزود واحد. احتفظ بـcanonical calculation على الخادم كما هو.

## 8.3 معايير القبول

- `grep` لا يجد `ai.gateway.lovable.dev` في runtime code.
- لا يوجد `LOVABLE_API_KEY` في قائمة secrets المطلوبة.
- رسالة الخطأ لا تطلب Lovable credits.
- اختبارات gateway وanalysis pipeline تمر.
- تقرير تجريبي كامل ينجح ويطابق canonical schema.

---

# المرحلة 9 — تحديث إعدادات الواجهة

في فرع النقل فقط:

```env
VITE_SUPABASE_PROJECT_ID="NEW_PROJECT_REF"
VITE_SUPABASE_PUBLISHABLE_KEY="NEW_PUBLISHABLE_KEY"
VITE_SUPABASE_URL="https://NEW_PROJECT_REF.supabase.co"
```

حدّث:

- `.env`
- `supabase/config.toml`
- `ALLOWED_ORIGINS`
- Auth Site URL وRedirect URLs.
- أي رابط ثابت إلى `gentle-glow-galaxy.lovable.app` إذا انتقل الإنتاج إلى نطاق آخر.

مفتاح publishable/anon ظاهر للمتصفح بطبيعته. الحماية تأتي من RLS. لا تضع service role في Vite.

بعد تطبيق المخطط كاملًا واختبار الحفظ، احذف `createSchemaCompatibleFetch` و`supabaseFetchCompat.ts` إذا لم يعد لهما استخدام.

---

# المرحلة 10 — CI/CD مستقل

## 10.1 بوابات Pull Request

يجب أن تمر:

```bash
npm ci
npm run lint
npm run typecheck
npm run check:edge
npm run test
npm run build
```

واختبارات قاعدة البيانات المحلية:

```bash
npx supabase start -x studio,imgproxy,inbucket,vector,logflare,supavisor
npx supabase test db supabase/tests/database/rls_hackathon.sql
```

## 10.2 نشر قاعدة البيانات وEdge Functions

أنشئ workflow مستقل يستخدم Supabase CLI الرسمي ومفتاح وصول مخزن في GitHub Actions Secrets، أو نفذ deployment من بيئة موثوقة. يجب أن:

- يعمل على branch إنتاج محدد.
- يطبق migrations الجديدة فقط.
- ينشر الدوال الثلاث عند تغيرها.
- يمنع النشر إذا فشلت الاختبارات.
- يسجل deployment SHA.
- لا يستخدم أعلام CLI غير مدعومة.

## 10.3 نشر الواجهة

التطبيق Vite static build:

- Build: `npm run build`
- Output: `dist/`
- إعداد SPA fallback إلى `/index.html`.
- VITE variables تدخل وقت build.
- فعّل HTTPS وrollback لإصدار سابق.

يمكن إبقاء الواجهة مؤقتًا على Lovable بعد نقل backend، ثم نقلها في خطوة منفصلة.

---

# المرحلة 11 — مصفوفة اختبار القبول

## 11.1 Auth

- إنشاء مستخدم email.
- تأكيد البريد.
- تسجيل الدخول والخروج.
- استعادة كلمة المرور.
- Google OAuth.
- مستخدم قديم يسجل الدخول دون إنشاء حساب جديد.
- الجلسة تستعاد بعد refresh.

## 11.2 RLS والملكية

- المستخدم A لا يقرأ تقرير المستخدم B الخاص.
- المستخدم A لا يعدل أو يحذف تقرير B.
- public exact-slug يعمل.
- إلغاء public يمنع الرابط فورًا.
- لا يمكن تعداد التقارير العامة من Table API.
- التعليقات تعمل فقط على تقرير قابل للعرض.
- الملفات الشخصية المحدودة تظهر فقط في سياق التعليقات المسموح.
- notifications لا يمكن تزويرها من المتصفح.

## 11.3 التقارير

- إنشاء تحليل جديد.
- إعادة المحاولة لا تنشئ duplicate report.
- إعادة تشغيل التقرير تنشئ نسخة مرتبطة بالجذر الصحيح.
- status history ينشأ من التغيير الفعلي.
- archive يخفي كل النسخ ويلغي public links.
- restore يعيد النسخ خاصة.
- legacy slug alias يعمل.
- canonical validator يرفض output غير صالح.

## 11.4 AI والبحث

- autofill.
- complete-field.
- analyze-concept.
- Tavily متاح.
- فشل Tavily لا يكسر التقرير دون تفسير.
- provider timeout.
- provider 429/402/5xx.
- structured output ناقص أو مقطوع.
- الحساب النهائي والقرار يأتيان من canonical server logic.

## 11.5 التصدير

- PDF.
- PowerPoint.
- Excel.
- النصوص والأرقام والعملات متسقة.
- التقرير العام read-only.

## 11.6 Storage وRealtime

- رفع وتنزيل ملف إن كان Storage مستخدمًا.
- bucket policy صحيحة.
- إشعار تعليق يظهر لصاحب التقرير.
- Realtime لا يسمح لمستخدم بسماع قناة مستخدم آخر.

## 11.7 مراقبة وتشغيل

- Edge Function logs بلا prompts أو PII غير لازمة.
- لا تظهر أسرار في frontend bundle أو logs.
- rate limits تعمل.
- CORS يسمح بالنطاقات المطلوبة فقط.
- backup جديد من Supabase يعمل.
- تنبيه تكلفة واستخدام مضبوط.

---

# المرحلة 12 — Cutover

## 12.1 نافذة كتابة مقيدة

قبل النسخة النهائية:

- أعلن فترة صيانة قصيرة عند وجود مستخدمين فعليين.
- امنع إنشاء بيانات جديدة في Lovable Cloud أو اجعل التطبيق read-only مؤقتًا.
- اطلب export نهائيًا جديدًا إذا تغيرت البيانات بعد النسخة التجريبية.
- أعد restore من النسخة النهائية إلى مشروع الهدف النظيف أو نفذ خطة delta موثقة.
- أعد مطابقة counts وchecksums.

## 12.2 تحويل الواجهة

- حدّث VITE variables إلى Supabase الجديد.
- انشر staging.
- نفذ smoke tests.
- انشر production.
- حدّث DNS أو النطاق.
- اختبر deep links وOAuth callbacks.

## 12.3 راقب قبل الحذف

احتفظ بـLovable Cloud دون كتابة خلال فترة تحقق متفق عليها. راقب:

- Auth failures.
- Edge Function error rate.
- report save failures.
- RLS denials غير المتوقعة.
- AI cost وlatency.
- Storage 404.

الرجوع خلال هذه الفترة يكون بإعادة نشر build القديم وربطه بـCloud القديم ما دام Cloud لم يُحذف.

---

# المرحلة 13 — بوابة قرار Remove Lovable Cloud

ضع علامة فقط بعد وجود دليل لكل بند:

- [ ] ملف database export الأصلي موجود ومشفر وله SHA-256.
- [ ] نسخة احتياطية ثانية موجودة في موقع منفصل.
- [ ] Storage files نُقلت أو ثبت أن Storage فارغ.
- [ ] قائمة secrets اكتملت وتم تدويرها أو إعادة إدخالها.
- [ ] استعادة قاعدة البيانات نجحت دون أخطاء غير مفهومة.
- [ ] counts للمستخدمين والجداول متطابقة.
- [ ] Auth القديم والجديد اختُبرا.
- [ ] Google OAuth يعمل بالنطاق النهائي.
- [ ] RLS واختبارات DB نجحت.
- [ ] Edge Functions الثلاث تعمل على Supabase الجديد.
- [ ] `ai.gateway.lovable.dev` أزيل من runtime أو يوجد قرار صريح بالإبقاء المؤقت عليه.
- [ ] التقارير والحفظ والنسخ والمشاركة والأرشفة تعمل.
- [ ] PDF/PPTX/XLSX تعمل.
- [ ] CI/CD المستقل يعمل.
- [ ] النسخ الاحتياطي والمراقبة في Supabase مضبوطتان.
- [ ] خطة rollback مكتوبة ومجربة قبل الحذف.
- [ ] صاحب المشروع وافق على الحذف النهائي بعد مراجعة الأدلة.

بعد اكتمالها فقط:

1. افتح `Cloud → Overview → Advanced settings`.
2. افتح `Remove Lovable Cloud`.
3. راجع التحذيرين.
4. اكتب `The Joy Creator` حرفيًا إذا كان هذا هو الاسم المعروض وقت التنفيذ.
5. اضغط Remove.
6. اختبر الإنتاج مرة أخرى بعد الحذف.

---

# المرحلة 14 — خطة الرجوع

## قبل Remove

الرجوع بسيط نسبيًا:

- أعد نشر النسخة السابقة من الواجهة.
- أعد VITE variables إلى Cloud القديم.
- أعد Google redirect للنطاق السابق عند الحاجة.
- استأنف الكتابة على Cloud بعد التأكد من عدم وجود split-brain.

## بعد Remove

لا يوجد رجوع تلقائي داخل Lovable. الاسترجاع يعتمد فقط على:

- database export.
- Storage downloads.
- GitHub repository.
- قائمة secrets والمفاتيح الجديدة.
- سجلات إعداد Auth وRealtime وExtensions.

لهذا السبب لا ننفذ Remove كخطوة تجريبية.

---

# مراجع رسمية

- Lovable Cloud export, pause, remove:
  https://docs.lovable.dev/integrations/cloud
- Lovable external deployment and managed/self-hosted Supabase:
  https://docs.lovable.dev/tips-tricks/external-deployment-hosting
- Supabase migration between projects:
  https://supabase.com/docs/guides/platform/migrating-within-supabase
- Supabase Auth users migration:
  https://supabase.com/docs/guides/troubleshooting/migrating-auth-users-between-projects
- Supabase backup and restore:
  https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
