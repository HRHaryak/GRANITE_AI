import { Suspense } from "react";

import BlockDetailClient from "./BlockDetailClient";

export default function BlockDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-teal-600" />

            <p className="mt-4 text-sm text-slate-500">
              Loading granite analysis...
            </p>
          </div>
        </div>
      }
    >
      <BlockDetailClient />
    </Suspense>
  );
}