import type { SupabaseClient } from "@supabase/supabase-js";
import type { ToolDefinition, ToolExecutor } from "@/lib/ai/gateway";
import { getMonthlyDashboardData } from "@/lib/dashboard/get-monthly-data";

// Herramientas que el chatbot puede usar para consultar los datos reales del
// usuario (Fase 4). Cada una queda restringida al usuario autenticado — el
// cliente de Supabase que se le pasa al executor ya trae la sesión, y RLS
// hace el resto.

export const CHATBOT_TOOLS: ToolDefinition[] = [
  {
    name: "get_transactions",
    description:
      "Busca movimientos (compras, pagos, intereses, comisiones, MSI) del usuario. Úsalo para responder preguntas sobre gastos específicos, un comercio, o un rango de fechas.",
    inputSchema: {
      type: "object",
      properties: {
        issuer: {
          type: "string",
          description: "Filtra por emisor de la tarjeta, ej. 'Banamex'",
        },
        type: {
          type: "string",
          enum: ["regular", "msi", "interest", "fee", "payment"],
        },
        date_from: { type: "string", description: "YYYY-MM-DD" },
        date_to: { type: "string", description: "YYYY-MM-DD" },
        description_contains: {
          type: "string",
          description: "Texto a buscar en la descripción del movimiento",
        },
        limit: { type: "number", default: 20 },
      },
    },
  },
  {
    name: "get_accounts_summary",
    description:
      "Regresa todas las tarjetas del usuario con límite, tasa y el último estado de cuenta procesado (gasto, disponible, fecha de pago).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_msi_plans",
    description:
      "Regresa los planes a meses sin intereses (MSI) activos del usuario, con su mensualidad y avance.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_monthly_totals",
    description:
      "Regresa ingreso total, egreso total, balance y mensualidades MSI de un mes específico (o el más reciente con datos si no se especifica mes).",
    inputSchema: {
      type: "object",
      properties: {
        month: {
          type: "string",
          description: "Primer día del mes en formato YYYY-MM-01",
        },
      },
    },
  },
];

interface TransactionRow {
  tx_date: string;
  description: string;
  amount: number;
  type: string;
  account_id: string;
  accounts: { issuer: string; product_name: string } | null;
}

export function createChatbotToolExecutor(
  supabase: SupabaseClient,
  userId: string,
): ToolExecutor {
  return async ({ name, input }) => {
    switch (name) {
      case "get_transactions": {
        let query = supabase
          .from("transactions")
          .select(
            "tx_date, description, amount, type, account_id, accounts(issuer, product_name)",
          )
          .eq("user_id", userId)
          .order("tx_date", { ascending: false })
          .limit(Number(input.limit) || 20);

        if (input.type) query = query.eq("type", String(input.type));
        if (input.date_from)
          query = query.gte("tx_date", String(input.date_from));
        if (input.date_to) query = query.lte("tx_date", String(input.date_to));
        if (input.description_contains) {
          query = query.ilike(
            "description",
            `%${String(input.description_contains)}%`,
          );
        }

        const { data, error } = await query;
        if (error) return { error: error.message };

        let rows = (data ?? []) as unknown as TransactionRow[];
        if (input.issuer) {
          const needle = String(input.issuer).toLowerCase();
          rows = rows.filter((r) =>
            r.accounts?.issuer?.toLowerCase().includes(needle),
          );
        }
        return rows;
      }

      case "get_accounts_summary": {
        const { data: accounts } = await supabase
          .from("accounts")
          .select("id, issuer, product_name, credit_limit, rate_ordinaria")
          .eq("user_id", userId);

        const results = [];
        for (const account of accounts ?? []) {
          const { data: statement } = await supabase
            .from("statements")
            .select("payment_no_interest, due_date, raw_extraction")
            .eq("account_id", account.id)
            .eq("status", "parsed")
            .order("period_end", { ascending: false })
            .limit(1)
            .maybeSingle();
          results.push({ ...account, latestStatement: statement });
        }
        return results;
      }

      case "get_msi_plans": {
        const { data } = await supabase
          .from("msi_plans")
          .select(
            "concept, account_id, monthly_payment, installments_paid, total_installments, accounts(issuer, product_name)",
          )
          .eq("user_id", userId)
          .eq("status", "active");
        return data ?? [];
      }

      case "get_monthly_totals": {
        const month =
          typeof input.month === "string" ? input.month : undefined;
        const data = await getMonthlyDashboardData(month);
        return {
          monthLabel: data.monthLabel,
          ingresoTotal: data.ingresoTotal,
          egresoTotal: data.egresoTotal,
          balance: data.balance,
          gastoTarjetas: data.gastoTarjetas,
          msiMensualTotal: data.msiMensualTotal,
        };
      }

      default:
        return { error: `Herramienta desconocida: ${name}` };
    }
  };
}
