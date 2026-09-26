import { isDemoMode, safeNextPath } from "@dinkuan/core/server";
import { LoginForm } from "@/components/LoginForm";
import { getT } from "@/lib/session";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const { lang } = await getT();
  // Only same-site relative redirects ("/\\evil.com" is rejected too).
  return <LoginForm lang={lang} next={safeNextPath(next)} demo={isDemoMode()} />;
}
