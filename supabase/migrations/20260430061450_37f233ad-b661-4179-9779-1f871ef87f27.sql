-- 1. Reports private-by-default
ALTER TABLE public.reports ALTER COLUMN is_public SET DEFAULT false;

-- 2. Restrict report_status_history INSERT to admins only (prevents owners fabricating transitions)
DROP POLICY IF EXISTS "Owner or admin records status changes" ON public.report_status_history;
CREATE POLICY "Admins record status changes"
ON public.report_status_history
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = changed_by
  AND public.has_role(auth.uid(), 'admin'::app_role)
  AND EXISTS (SELECT 1 FROM public.reports r WHERE r.id = report_status_history.report_id)
);

-- 3. Realtime channel authorization — restrict notifications:<user_id> topic to that user
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own notification channel" ON realtime.messages;
CREATE POLICY "Users read own notification channel"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() = ('notifications:' || auth.uid()::text)
);

-- 4. Revoke EXECUTE from trigger-only SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.notify_on_comment() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notify_on_status()  FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()   FROM anon, authenticated, public;