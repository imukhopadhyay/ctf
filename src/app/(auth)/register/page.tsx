import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/misc";
import { getCurrentUser } from "@/server/auth/current";
import { listInstitutions } from "@/server/services/admin";
import { getSetting } from "@/server/services/settings";
import { env } from "@/server/env";
import { RegisterForm } from "./register-form";

export const metadata = { title: "Create account" };

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  const open = env().REGISTRATION_ENABLED && (await getSetting("registrationOpen"));
  const institutions = await listInstitutions();
  return (
    <div className="mx-auto max-w-md py-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Create your account</CardTitle>
          <CardDescription>We only ask for what we need to run competitions.</CardDescription>
        </CardHeader>
        <CardContent>
          {open ? (
            <RegisterForm institutions={institutions.map((i) => ({ id: i.id, name: i.name }))} />
          ) : (
            <Alert tone="warning" title="Registration is closed">Self-registration is currently disabled. Contact your organizer for an account.</Alert>
          )}
          <p className="mt-6 text-center text-sm text-muted">
            Already registered? <Link href="/login" className="text-accent hover:underline">Sign in</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
