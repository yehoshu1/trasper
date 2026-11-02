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
}: {
  message: string;
  title?: string;
  confirmLabel?: string;
  children: ReactNode;
  className?: string;
  variant?: ButtonProps["variant"];
  name?: string;
  value?: string;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const confirmedRef = useRef(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const form = buttonRef.current?.closest("form");
    if (!form) return;

    // Cover implicit submission (pressing Enter in a text field) as well as
    // clicks, so a form can never be submitted without the confirmation.
    function handleSubmit(event: SubmitEvent) {
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
