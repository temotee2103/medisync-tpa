-- Reset the Supabase auth user password for admin "temo" to "aa931201"
-- This identifies the user by admin_id "temo" in admin_users, finds their profile_id,
-- then updates the corresponding auth.users record's encrypted_password.

DO $$
DECLARE
  target_profile_id uuid;
BEGIN
  SELECT profile_id INTO target_profile_id
  FROM public.admin_users
  WHERE admin_id = 'temo'
  LIMIT 1;

  IF target_profile_id IS NULL THEN
    RAISE NOTICE 'No admin user found with admin_id = "temo"';
    RETURN;
  END IF;

  UPDATE auth.users
  SET encrypted_password = crypt('aa931201', gen_salt('bf')),
      raw_user_meta_data = raw_user_meta_data || '{"must_change_password": false}'::jsonb
  WHERE id = target_profile_id;

  RAISE NOTICE 'Password reset for admin "temo" (profile_id: %)', target_profile_id;
END;
$$;
