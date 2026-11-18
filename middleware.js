import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

// Runs before every page request. If there's no logged-in session, send
// the visitor to /login instead of letting any page render. This is the
// gate that was missing before — RLS protects the DATA, this protects
// the PAGES themselves.
export async function middleware(request) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const isLoginPage = request.nextUrl.pathname.startsWith('/login');
  // The privacy policy is read by people who have no account here — Google's
  // consent screen asks for it, and a policy behind a login is not a policy.
  const isPrivacyPage = request.nextUrl.pathname === '/privacy';

  if (!user && !isLoginPage && !isPrivacyPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return response;
}

// Apply to every route except static assets — including the homepage.
// /api/sync is excluded: it is the machine-to-machine Petpooja sync endpoint
// and authenticates with its own shared secret, not a Supabase session.
// The anchor matters — /api/sync-petpooja must stay behind the session gate.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/sync$).*)'],
};
