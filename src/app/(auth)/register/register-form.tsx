"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { ApiError, api, errorText } from "@/lib/api-client";

export function RegisterForm({ institutions }: { institutions: { id: string; name: string }[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        if (fd.get("password") !== fd.get("confirm")) {
          setFieldErrors({ confirm: "Passwords do not match." });
          return;
        }
        setPending(true);
        setError(null);
        setFieldErrors({});
        const body = {
          email: fd.get("email"),
          username: fd.get("username"),
          displayName: fd.get("displayName"),
          password: fd.get("password"),
          institutionId: fd.get("institutionId") || null,
          acceptPolicy: fd.get("acceptPolicy") === "on",
        };
        try {
          await api("/api/v1/auth/register", { method: "POST", body });
          await api("/api/v1/auth/login", { method: "POST", body: { identifier: body.username, password: body.password } });
          router.push("/dashboard");
          router.refresh();
        } catch (err) {
          if (err instanceof ApiError && err.details) setFieldErrors(Object.fromEntries(err.details.map((d) => [d.path, d.message])));
          setError(errorText(err));
          setPending(false);
        }
      }}
    >
      {error && <Alert tone="danger">{error}</Alert>}
      <Field label="Email" htmlFor="email" error={fieldErrors.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required maxLength={254} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Username" htmlFor="username" hint="3–32 letters, digits, _ or -" error={fieldErrors.username}>
          <Input id="username" name="username" autoComplete="username" required minLength={3} maxLength={32} pattern="[A-Za-z0-9_-]+" />
        </Field>
        <Field label="Display name" htmlFor="displayName" error={fieldErrors.displayName}>
          <Input id="displayName" name="displayName" required minLength={2} maxLength={48} />
        </Field>
      </div>
      {institutions.length > 0 && (
        <Field label="Institution (optional)" htmlFor="institutionId">
          <Select id="institutionId" name="institutionId" defaultValue="">
            <option value="">— None —</option>
            {institutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </Select>
        </Field>
      )}
      <Field label="Password" htmlFor="password" hint="At least 12 characters. A passphrase works well." error={fieldErrors.password}>
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} />
      </Field>
      <Field label="Confirm password" htmlFor="confirm" error={fieldErrors.confirm}>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <Checkbox
        name="acceptPolicy"
        required
        label={<>I agree to the <Link href="/help#responsible-use" className="text-accent hover:underline" target="_blank">responsible-use policy</Link> and competition rules.</>}
      />
      {fieldErrors.acceptPolicy && <p className="text-xs text-danger">{fieldErrors.acceptPolicy}</p>}
      <Button type="submit" className="w-full" disabled={pending}>{pending ? "Creating account…" : "Create account"}</Button>
    </form>
  );
}
