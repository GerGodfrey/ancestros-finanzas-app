import type { MonthCoverage } from "@/lib/dashboard/get-upload-coverage";
import { monthLongLabel } from "@/lib/month";

export function PendingThisMonth({ data }: { data: MonthCoverage | null }) {
  if (!data || data.expectedCount === 0) return null;

  const missing = data.accounts.filter((a) => !a.uploaded);
  const allDone = missing.length === 0;

  return (
    <div
      className={`rounded-lg border p-4 text-sm ${
        allDone
          ? "border-positive/30 bg-positive/10"
          : "border-warning/30 bg-warning/10"
      }`}
    >
      <p
        className={`font-semibold ${allDone ? "text-positive" : "text-warning"}`}
      >
        {allDone
          ? `Ya subiste todos los estados de cuenta de ${monthLongLabel(data.month)} (${data.uploadedCount}/${data.expectedCount}).`
          : `Te falta subir ${missing.length} de ${data.expectedCount} estados de cuenta de ${monthLongLabel(data.month)}.`}
      </p>
      {!allDone && (
        <ul className="mt-2 list-inside list-disc text-warning">
          {missing.map((a) => (
            <li key={a.accountId}>
              {a.issuer} — {a.productName}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
