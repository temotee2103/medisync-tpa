import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/config";

const normalizePathname = (pathname: string, basePath: string) => {
  let value = pathname;
  if (basePath) {
    if (value === basePath) value = "/";
    else if (value.startsWith(`${basePath}/`)) value = value.slice(basePath.length) || "/";
  }
  if (value.length > 1 && value.endsWith("/")) value = value.slice(0, -1);
  return value;
};

const isPublicPath = (pathname: string) => {
  if (pathname.startsWith("/_next")) return true;
  if (pathname.startsWith("/favicon")) return true;
  if (pathname.startsWith("/assets")) return true;
  if (pathname.startsWith("/api/auth")) return true;
  return false;
};

const isPortalLogin = (pathname: string) =>
  pathname === "/admin/login" || pathname === "/member/login" || pathname === "/provider/login";

const isPortalChangePassword = (pathname: string) =>
  pathname === "/admin/change-password" || pathname === "/member/change-password" || pathname === "/provider/change-password";

const getPortalFromPath = (pathname: string) => {
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/member")) return "member";
  if (pathname.startsWith("/provider")) return "provider";
  return null;
};

export async function middleware(request: NextRequest) {
  const runtimeBasePath = request.nextUrl.basePath || process.env.NEXT_PUBLIC_BASE_PATH || "";
  const pathname = normalizePathname(request.nextUrl.pathname, runtimeBasePath);
  if (isPublicPath(pathname)) return NextResponse.next();

  const portal = getPortalFromPath(pathname);
  if (!portal) return NextResponse.next();
  if (isPortalLogin(pathname)) return NextResponse.next();

  const response = NextResponse.next();
  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = `/${portal}/login`;
    url.searchParams.set("reason", "unauthenticated");
    return NextResponse.redirect(url);
  }

  const rpcName = portal === "admin" ? "is_admin" : portal === "member" ? "is_member" : "is_provider";
  const { data: hasPortalRole, error: roleError } = await supabase.rpc(rpcName);

  if (roleError || !hasPortalRole) {
    await supabase.auth.signOut();
    const url = request.nextUrl.clone();
    url.pathname = `/${portal}/login`;
    url.searchParams.set("reason", roleError ? "role_error" : "access_denied");
    return NextResponse.redirect(url);
  }

  const mustChangePassword = Boolean((user.user_metadata as any)?.must_change_password);
  if (mustChangePassword && !isPortalChangePassword(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = `/${portal}/change-password`;
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/:path*"],
};
