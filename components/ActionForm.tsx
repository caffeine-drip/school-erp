"use client";

import { useActionState, useEffect, useRef } from "react";
import type { FormState } from "@/app/actions/auth";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

// A form wired to a server action that shows its success or error message and resets on success.
export function ActionForm({
  action,
  children,
  className,
}: {
  action: Action;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      {state?.error && <p className="col-span-full text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p className="col-span-full text-sm text-emerald-700">{state.ok}</p>}
    </form>
  );
}
