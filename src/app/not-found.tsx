import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl py-20 text-center">
      <p className="font-mono text-sm text-primary">404</p>
      <h1 className="mt-2 text-2xl font-bold">Nothing here</h1>
      <p className="mt-2 text-muted">The page does not exist, or you do not have access to it.</p>
      <Button asChild className="mt-6"><Link href="/">Back to home</Link></Button>
    </div>
  );
}
