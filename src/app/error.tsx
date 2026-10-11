"use client";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl py-16">
      <Alert tone="danger" title="Something went wrong">
        <p>The page could not be loaded. The problem has been logged{error.digest ? ` (reference ${error.digest})` : ""}.</p>
      </Alert>
      <Button className="mt-4" onClick={reset}>Try again</Button>
    </div>
  );
}
