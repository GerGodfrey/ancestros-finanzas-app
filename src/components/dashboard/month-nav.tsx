"use client";

import { useRouter } from "next/navigation";

const MONTH_LABELS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function formatMonth(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return `${MONTH_LABELS[m - 1]} ${y}`;
}

export function MonthNav({
  availableMonths,
  currentMonth,
}: {
  availableMonths: string[];
  currentMonth: string;
}) {
  const router = useRouter();

  if (availableMonths.length <= 1) return null;

  const index = availableMonths.indexOf(currentMonth);
  const prevMonth = index > 0 ? availableMonths[index - 1] : null;
  const nextMonth =
    index >= 0 && index < availableMonths.length - 1
      ? availableMonths[index + 1]
      : null;

  function goTo(month: string) {
    router.push(`/dashboard?month=${month}`);
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <button
        onClick={() => prevMonth && goTo(prevMonth)}
        disabled={!prevMonth}
        aria-label="Mes anterior"
        className="rounded-md border border-border px-2 py-1 text-text-muted transition hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-30"
      >
        ‹
      </button>
      <select
        value={currentMonth}
        onChange={(e) => goTo(e.target.value)}
        className="rounded-md border border-border bg-surface px-2 py-1 text-sm text-text"
      >
        {availableMonths
          .slice()
          .reverse()
          .map((m) => (
            <option key={m} value={m}>
              {formatMonth(m)}
            </option>
          ))}
      </select>
      <button
        onClick={() => nextMonth && goTo(nextMonth)}
        disabled={!nextMonth}
        aria-label="Mes siguiente"
        className="rounded-md border border-border px-2 py-1 text-text-muted transition hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-30"
      >
        ›
      </button>
    </div>
  );
}
