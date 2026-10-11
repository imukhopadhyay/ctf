"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { api, errorText } from "@/lib/api-client";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setPending(true);
        setError(null);
        try {
          await api("/api/v1/auth/login", { method: "POST", body: { identifier: fd.get("identifier"), password: fd.get("password") } });
          router.push(next);
          router.refresh();
        } catch (err) {
          setError(errorText(err));
          setPending(false);
        }
      }}
    >
      {error && <Alert tone="danger">{error}</Alert>}
      <Field label="Username or email" htmlFor="identifier">
        <Input id="identifier" name="identifier" autoComplete="username" required maxLength={254} />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required maxLength={256} />
      </Field>
      <Button type="submit" className="w-full" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</Button>
    </form>
  );
}
