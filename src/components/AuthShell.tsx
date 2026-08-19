import Image from "next/image";

export default function AuthShell({
  title,
  subtitle,
  children,
  footer,
  about,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  /** A plain explanation of the product, shown to signed-out visitors. */
  about?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-runfree-indigo/40 px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo sits on white, per brand guidance for the dark-inked mark.
            Linked to runfree.co: these five pages carry no PortalFooter, so
            this is the only mark on them, and someone who lands on a sign-in
            screen unsure what this is has nowhere else to click. */}
        <div className="mb-6 flex justify-center">
          <a
            href="https://runfree.co"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="RunFree — visit runfree.co"
            className="rounded-xl bg-white px-6 py-4 shadow-sm outline-none transition hover:opacity-80 focus-visible:ring-2 focus-visible:ring-runfree-magenta focus-visible:ring-offset-2"
          >
            <Image
              src="/brand/runfree-logo.png"
              alt="RunFree"
              width={160}
              height={40}
              priority
              className="h-9 w-auto"
            />
          </a>
        </div>

        <div className="overflow-hidden rounded-2xl bg-white shadow-xl">
          <div className="h-1.5 bg-runfree-grad" />
          <div className="p-8">
            <h1 className="text-center font-display text-2xl font-extrabold tracking-tight text-runfree-ink">
              {title}
            </h1>
            <p className="mt-2 text-center text-sm text-gray-500">{subtitle}</p>

            <div className="mt-8">{children}</div>
          </div>

          {/* What this is, readable without signing in.
              Google rejected brand verification with "your home page does not
              explain the purpose of your app" — and it was right: a logged-out
              visitor saw a sign-in box and nothing else. This is also the
              first thing a church leader sees when they follow an invitation,
              so it should have been here regardless of Google. */}
          {about && (
            <div className="border-t border-gray-100 bg-gray-50/70 px-8 py-6">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-runfree-magentaDeep">
                What this is
              </h2>
              <div className="mt-2 space-y-2.5 text-sm leading-relaxed text-gray-600">
                {about}
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 text-center text-sm text-gray-600">{footer}</div>
      </div>
    </div>
  );
}

export function Field({
  id,
  label,
  type = "text",
  value,
  onChange,
  autoComplete,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-sm font-medium text-runfree-ink"
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        required
        className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 outline-none transition placeholder:text-gray-500 focus:border-runfree-magenta focus:ring-2 focus:ring-runfree-magenta/25"
      />
    </div>
  );
}

export function SubmitButton({
  loading,
  idleLabel,
  busyLabel,
}: {
  loading: boolean;
  idleLabel: string;
  busyLabel: string;
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full rounded-lg bg-runfree-grad px-4 py-2.5 font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
    >
      {loading ? busyLabel : idleLabel}
    </button>
  );
}

export function GoogleButton({
  onClick,
  disabled,
  label,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-2.5 font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="#4285F4"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        />
        <path
          fill="#34A853"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
        />
        <path
          fill="#FBBC05"
          d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z"
        />
        <path
          fill="#EA4335"
          d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 7.05l3.66 2.84c.87-2.6 3.3-4.14 6.16-4.14z"
        />
      </svg>
      {label}
    </button>
  );
}

export function OrDivider() {
  return (
    <div className="my-6 flex items-center gap-3">
      <span className="h-px flex-1 bg-gray-200" />
      <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
        or
      </span>
      <span className="h-px flex-1 bg-gray-200" />
    </div>
  );
}

export function FormNotice({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
      {message}
    </div>
  );
}

export function FormError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </div>
  );
}
