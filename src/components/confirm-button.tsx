"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function ConfirmButton({
  message,
  title = "Please confirm",
  confirmLabel,
  children,
  className,
  variant = "destructive",
  name,
  value,
  formAction,
}: {
  message: string;
  title?: string;
  confirmLabel?: string;
  children: ReactNode;
  className?: string;
  variant?: ButtonProps["variant"];
  name?: string;
  value?: string;
  formAction?: ButtonProps["formAction"];
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const confirmedRef = useRef(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const form = buttonRef.current?.closest("form");
    if (!form) return;

    // Intercept clicks and implicit submission that choose this button, so its
    // action always goes through the confirmation dialog. Other submit buttons
    // in the same form keep their own actions.
    function handleSubmit(event: SubmitEvent) {
      // Forms can have other submit buttons (for example "Save draft") that
      // must keep their own action.
      if (event.submitter !== buttonRef.current) return;
      if (confirmedRef.current) {
        confirmedRef.current = false;
        return;
      }
      event.preventDefault();
      setOpen(true);
    }

    form.addEventListener("submit", handleSubmit);
    return () => form.removeEventListener("submit", handleSubmit);
  }, []);

  function handleConfirm() {
    const form = buttonRef.current?.closest("form");
    setOpen(false);
    if (!form) return;
    confirmedRef.current = true;
    form.requestSubmit(buttonRef.current ?? undefined);
    confirmedRef.current = false;
  }

  return (
    <>
      <Button
        ref={buttonRef}
        type="submit"
        name={name}
        value={value}
        formAction={formAction}
        variant={variant}
        className={className}
        onClick={(event) => {
          if (confirmedRef.current) return;
          const form = event.currentTarget.form;
          if (form && !form.checkValidity()) {
            event.preventDefault();
            form.reportValidity();
            return;
          }
          event.preventDefault();
          setOpen(true);
        }}
      >
        {children}
      </Button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={message}
        confirmLabel={confirmLabel ?? (typeof children === "string" ? children : "Confirm")}
        onConfirm={handleConfirm}
      />
    </>
  );
}
