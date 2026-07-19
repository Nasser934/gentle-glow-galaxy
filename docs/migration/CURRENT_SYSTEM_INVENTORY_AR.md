# جرد نظام Concept AI قبل الخروج من Lovable Cloud

تاريخ المراجعة: 19 يوليو 2026

هذا الملف يسجل الحالة الحالية للمشروع قبل أي نقل. لا يحتوي على أسرار أو مفاتيح فعلية.

## 1. مصادر الحقيقة

- GitHub: `Nasser934/gentle-glow-galaxy`
- الفرع الرئيسي: `main`
- مشروع Lovable: `51d58cb5-2265-4414-a562-40b8cac715bf`
- الاسم المعروض: `The Joy Creator`
- رابط الإنتاج الحالي: `https://gentle-glow-galaxy.lovable.app`
- مرجع قاعدة Lovable Cloud الحالي: `smjiyjenxbtfiiovxbnq`
- كود التطبيق وEdge Functions وملفات migrations موجودة في GitHub.
- بيانات الإنتاج الفعلية والمستخدمون وحالة Auth وStorage تبقى في Lovable Cloud إلى أن ننفذ التصدير ونفحصه.

## 2. بنية التطبيق

### الواجهة

- Vite + React 18 + TypeScript.
- React Router.
- TanStack Query.
- Tailwind CSS + shadcn/ui + Radix UI.
- تصدير PDF وPowerPoint وExcel.

### الخلفية

- PostgreSQL متوافق مع Supabase.
- Supabase Auth.
- PostgREST وRLS.
- Realtime للإشعارات.
- Supabase Edge Functions عبر Deno.

### Edge Functions الموجودة في الريبو

1. `supabase/functions/analyze-concept`
2. `supabase/functions/autofill-brief`
3. `supabase/functions/complete-field`
4. مكتبات مشتركة داخل `supabase/functions/_shared`

### الجداول والوظائف الأساسية المعروفة من migrations والأنواع

- `profiles`
- `user_roles`
- `reports`
- `report_slug_aliases`
- `report_comments`
- `report_status_history`
- `notifications`
- `analysis_requests`
- `analysis_rate_limits`
- `edge_rate_limits` يظهر في الأنواع المولدة، لكنه لا يظهر بوضوح في migrations الحالية. هذا اختلاف يجب مطابقته مع النسخة الكاملة من قاعدة Cloud.

## 3. ما تم تحسينه أمنيًا في migrations الأخيرة

- جعل التقارير خاصة افتراضيًا.
- منع تعداد التقارير العامة مباشرة من Table API، واستخدام قراءة exact slug عبر RPC.
- تقييد الوصول للتعليقات والملفات الشخصية وسجل الحالة حسب صلاحية التقرير.
- جعل إشعارات وسجل تغييرات الحالة معتمدين على triggers بدل إدخالات متصفح قابلة للتزوير.
- إضافة تحقق صارم من شكل التقرير canonical قبل الحفظ.
- إضافة مفاتيح idempotency للحفظ وطلبات التحليل.
- إضافة rate limits مستمرة حسب المستخدم وعنوان IP المموه.
- إضافة فهارس وقيود أحجام وForeign Keys وحماية لسلسلة نسخ التقارير.

## 4. الاعتمادات المباشرة على Lovable التي تمنع خروجًا كاملًا الآن

### 4.1 مصادقة OAuth

الملف `src/integrations/lovable/index.ts` يستخدم:

- الحزمة `@lovable.dev/cloud-auth-js`
- `createLovableAuth()`
- تحويل الرموز إلى جلسة Supabase بعد نجاح Lovable OAuth

صفحة تسجيل الدخول تستدعي هذا المسار عند Google sign-in. البريد وكلمة المرور يستخدمان Supabase مباشرة.

**المطلوب قبل الفصل:** استبدال مسار Google OAuth بـ `supabase.auth.signInWithOAuth` وضبط Google OAuth وredirect URLs في مشروع Supabase الجديد.

### 4.2 بوابة Lovable AI

الدوال الثلاث تعتمد على:

- `LOVABLE_API_KEY`
- `https://ai.gateway.lovable.dev/v1/chat/completions`
- نماذج Google عبر بوابة Lovable

هذا يعني أن نقل قاعدة البيانات وحده لا يوقف تكلفة Lovable AI ولا يزيل الاعتماد التشغيلي على Lovable.

**المطلوب قبل الخروج الكامل:** إنشاء طبقة provider مستقلة وربطها مباشرة بمزود نختاره، مع الحفاظ على structured output والمهل والأخطاء والاختبارات الحالية.

### 4.3 إعدادات المشروع الحالية

- `.env` يشير إلى مشروع Cloud الحالي.
- `supabase/config.toml` يحتوي مرجع المشروع الحالي.
- CORS الافتراضي في Edge Functions يحتوي نطاق `lovable.app` الحالي.
- `lovable-tagger` موجود كاعتماد تطوير، وليس اعتماد تشغيل أساسي.

### 4.4 توافق مؤقت مع تأخر مخطط Cloud

`src/lib/supabaseFetchCompat.ts` يحذف أعمدة اختيارية من طلب حفظ التقرير إذا أعاد PostgREST خطأ missing column. هذه طبقة مؤقتة لمعالجة فرق بين كود GitHub ومخطط Cloud.

**المطلوب بعد النقل:** تطبيق المخطط كاملًا في بيئة الاختبار الجديدة، تحديث الأنواع، ثم حذف طبقة التوافق بعد نجاح اختبارات الحفظ.

## 5. الأسرار والإعدادات التي يجب إعادة إدخالها يدويًا

لا يمكن قراءة قيم Lovable Secrets بعد حفظها. يجب استرجاع القيم من مزوديها أو إنشاء مفاتيح جديدة.

الأسماء التي يستخدمها الكود حاليًا:

- `LOVABLE_API_KEY` — سيستبدل بمفتاح مزود AI مستقل.
- `TAVILY_API_KEY`
- `ANALYSIS_MODEL_ID`
- `AUTOFILL_MODEL_ID`
- `COMPLETE_FIELD_MODEL_ID`
- `ALLOWED_ORIGINS`
- `RATE_LIMIT_HASH_SALT`
- قيم `SUPABASE_*` التي يحقنها Supabase في Edge Functions.

لا تضع أي قيمة سرية في GitHub أو `.env` الخاصة بالواجهة.

## 6. بيانات لا يمكن تأكيدها من اتصال المراجعة الحالي

أعاد Lovable Database Query خطأ صلاحية `403 insufficient_scope`. لذلك نحتاج فحصًا من Dashboard أو النسخة المصدرة لتأكيد:

- عدد الجداول والصفوف الفعلي.
- عدد مستخدمي Auth وحالات providers.
- حجم قاعدة البيانات.
- Buckets وملفات Storage وحجمها.
- Jobs أو `pg_cron` الموجودة في القاعدة الفعلية.
- Extensions المفعلة.
- Secrets المسجلة وأسماؤها النهائية.
- Realtime publications والإعدادات غير المخزنة في SQL.
- وجود Webhooks أو Vault أو إعدادات Dashboard إضافية.

## 7. حالة الاختبارات والنشر

- يوجد GitHub Actions CI لتشغيل lint وtypecheck وفحص Edge Functions والاختبارات والبناء، إضافة إلى اختبار migrations وRLS محليًا.
- آخر commit على `main` لم يظهر له workflow run أو combined status وقت هذه المراجعة.
- لم نتمكن من clone وتشغيل المشروع داخل بيئة المراجعة بسبب عدم توفر تنزيل الشبكة من GitHub داخل الحاوية.
- لا يجوز اعتبار الاختبارات ناجحة حتى تعمل CI على فرع النقل أو نشغلها محليًا.
- لا توجد حاليًا workflow إنتاجية معتمدة لنشر Edge Functions. تمت إزالة محاولة سابقة غير مدعومة.

## 8. القرار التقني المقترح

### المرحلة الأولى: Managed Supabase مملوك لنا

هذا أقل خطرًا وأسرع من self-hosted Supabase. ننقل قاعدة البيانات وAuth وStorage وEdge Functions إلى مشروع Supabase مستقل، ونبقي الواجهة مؤقتًا على Lovable أو ننشرها على منصة أخرى بعد الاختبار.

### المرحلة الثانية: فصل Lovable runtime

- استبدال Lovable OAuth.
- استبدال Lovable AI Gateway.
- نقل استضافة الواجهة.
- إضافة CI/CD مستقل للمخطط وEdge Functions والواجهة.

### المرحلة الثالثة الاختيارية: Self-hosted Supabase

لا ننقل إلى PostgreSQL فقط. التطبيق يحتاج Auth وStorage وRealtime وEdge Functions وخدمات Supabase المتكاملة. ننفذ self-hosting لاحقًا فقط عند وجود سبب مالي أو تشغيلي واضح وخطة نسخ احتياطي ومراقبة وتحديثات.

## 9. قاعدة منع الحذف

لا نضغط **Remove Lovable Cloud** قبل تحقق كل الشروط التالية:

- تنزيل database export ونسخة ثانية منه في مكان مشفر.
- تنزيل جميع ملفات Storage أو توثيق أن Storage فارغ.
- حفظ قائمة الأسرار وإعادة إنشائها في البيئة الجديدة.
- استعادة النسخة في مشروع تجريبي جديد.
- نجاح Auth وRLS وEdge Functions والتقارير والمشاركة والتصدير.
- مطابقة أعداد المستخدمين والصفوف والملفات.
- نجاح cutover للإنتاج مع خطة رجوع مجربة.
- احتفاظنا بنسخة Cloud دون كتابة أثناء فترة التحقق الأخيرة.
