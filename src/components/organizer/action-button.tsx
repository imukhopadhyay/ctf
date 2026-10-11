"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, type ButtonProps } from "@/components/ui/button";
import { api, errorText } from "@/lib/api-client";

/** Button that performs one API call (optionally confirmed / prompted), then refreshes server data. */
export function ActionButton({ path, method = "POST", body, confirmText, promptText, promptKey, children, ...props }: ButtonProps & { path: string; method?: string; body?: Record<string, unknown>; confirmText?: string; promptText?: string; promptKey?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Button
      {...props}
      disabled={pending || props.disabled}
      onClick={async () => {
        if (confirmText && !confirm(confirmText)) return;
        let payload = body;
        if (promptText) {
          const v = prompt(promptText);
          if (!v) return;
          payload = { ...body, [promptKey ?? "value"]: v };
        }
        setPending(true);
        try {
          await api(path, { method, body: payload });
          router.refresh();
        } catch (e) {
          alert(errorText(e));
        } finally {
          setPending(false);
        }
      }}
    >
      {children}
    </Button>
  );
}
