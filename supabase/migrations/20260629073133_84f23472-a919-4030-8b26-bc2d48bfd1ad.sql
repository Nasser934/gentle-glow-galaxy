DROP POLICY IF EXISTS "Admins record status changes" ON public.report_status_history;

CREATE POLICY "Owners and admins record status changes"
ON public.report_status_history
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = changed_by
  AND (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.reports r
      WHERE r.id = report_id AND r.user_id = auth.uid()
    )
  )
);