-- 1. Length constraint on comment body
ALTER TABLE public.report_comments
  ADD CONSTRAINT chk_comment_body_len
  CHECK (char_length(body) <= 2000);

-- 2. Restrict has_role to self-lookup only
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = _role
    );
$$;