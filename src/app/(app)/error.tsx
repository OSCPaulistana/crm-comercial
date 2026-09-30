"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="card flex flex-col items-center px-6 py-16 text-center">
      <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-danger-soft">
        <AlertTriangle className="size-5 text-danger" aria-hidden />
      </div>
      <h1 className="text-base font-semibold text-fg">Não foi possível carregar esta página.</h1>
      <p className="mt-1 max-w-md text-sm text-fg-2">
        Verifique sua conexão e tente novamente. Se o problema continuar, contate o administrador do sistema.
      </p>
      <Button className="mt-5" onClick={reset}>
        Tentar novamente
      </Button>
    </div>
  );
}
