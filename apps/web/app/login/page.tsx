import { LoginForm } from "@/components/LoginForm";
import { getT } from "@/lib/session";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const { lang } = await getT();
  // Only allow same-site relative redirects.
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return <LoginForm lang={lang} next={safeNext} demo={process.env.DEMO_MODE === "true"} />;
}
