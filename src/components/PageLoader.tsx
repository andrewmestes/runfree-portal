/**
 * Shared loading state. A moving brand bar rather than a spinner — it reads as
 * "this is loading" without the anxious quality of a spinner, and it reuses the
 * gradient that already anchors every other surface.
 */
export default function PageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="animate-fade text-center">
        <div className="mx-auto mb-4 h-1.5 w-28 overflow-hidden rounded-full">
          <div className="brand-loader h-full w-full" />
        </div>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
    </div>
  );
}

/** Card-shaped placeholders, so the page doesn't jump when content lands. */
export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="animate-fade overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200"
          style={{ "--delay": `${i * 60}ms` } as React.CSSProperties}
        >
          <div className="skeleton h-1.5 w-full" />
          <div className="space-y-3 p-5">
            <div className="skeleton h-4 w-3/4 rounded" />
            <div className="skeleton h-3 w-full rounded" />
            <div className="skeleton h-3 w-5/6 rounded" />
            <div className="flex items-center justify-between pt-3">
              <div className="skeleton h-3 w-12 rounded" />
              <div className="skeleton h-8 w-20 rounded-lg" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
