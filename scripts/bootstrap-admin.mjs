import { createClient } from "@supabase/supabase-js";

const requireEnv = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
};

const getArg = (name) => {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return raw ? raw.slice(name.length + 3) : "";
};

const username = getArg("username").trim();
const email = getArg("email").trim();
const password = getArg("password");
const fullName = getArg("fullName").trim() || username;
const role = getArg("role").trim() || "super_admin";

if (!username || !email || !password) {
  throw new Error("Usage: node scripts/bootstrap-admin.mjs --username=temo --email=temo@medisync.com.my --password=YourPass --fullName=Temo --role=super_admin");
}

const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const findUserIdByEmail = async (targetEmail) => {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = (data?.users || []).find((user) => (user.email || "").toLowerCase() === targetEmail.toLowerCase());
    if (match?.id) return match.id;
    if ((data?.users || []).length < 200) return null;
  }
  return null;
};

const ensureAuthUser = async () => {
  const existingUserId = await findUserIdByEmail(email);
  if (existingUserId) {
    const { error } = await supabase.auth.admin.updateUserById(existingUserId, {
      password,
      email_confirm: true,
    });
    if (error) throw error;
    return existingUserId;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  if (!data?.user?.id) throw new Error("Auth user creation failed.");
  return data.user.id;
};

const main = async () => {
  const userId = await ensureAuthUser();

  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      id: userId,
      email,
      full_name: fullName,
      default_portal: "admin",
      status: "active",
    },
    { onConflict: "id" }
  );
  if (profileError) throw profileError;

  const { error: adminUserError } = await supabase.from("admin_users").upsert(
    {
      admin_id: username,
      full_name: fullName,
      role,
      status: "active",
      profile_id: userId,
      email,
    },
    { onConflict: "admin_id" }
  );
  if (adminUserError) throw adminUserError;

  const { error: deleteRoleError } = await supabase
    .from("profile_roles")
    .delete()
    .eq("profile_id", userId)
    .eq("portal_key", "admin");
  if (deleteRoleError) throw deleteRoleError;

  const { error: roleError } = await supabase.from("profile_roles").insert({
    profile_id: userId,
    portal_key: "admin",
    role_key: role,
    is_primary: true,
  });
  if (roleError) throw roleError;

  process.stdout.write(`Bootstrapped admin user.\nusername=${username}\nemail=${email}\nprofile_id=${userId}\n`);
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});

