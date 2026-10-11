import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/server/auth/current";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

function safeNext(next: string | undefined) {
  // Only allow same-site relative paths (prevents open redirects).
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/dashboard";
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getCurrentUser()) redirect(safeNext(next));
  return (
    <div className="mx-auto max-w-md py-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Sign in</CardTitle>
          <CardDescription>Welcome back, agent.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm next={safeNext(next)} />
          <p className="mt-6 text-center text-sm text-muted">
            New here? <Link href="/register" className="text-accent hover:underline">Create an account</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
