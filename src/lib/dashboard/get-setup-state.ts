import { createClient } from "@/lib/supabase/server";
import { tryDecryptSecret } from "@/lib/crypto";

// Los tres pasos que separan una cuenta recién creada de un dashboard con
// datos. Se derivan de lo que ya hay en la base —nunca se persiste "ya lo
// vi"— así que no hay nada que migrar y el checklist desaparece solo en
// cuanto los tres están hechos.
export interface SetupState {
  /** Hay al menos una API key guardada y que se puede descifrar. */
  hasProvider: boolean;
  /** Hay al menos una tarjeta registrada. */
  hasAccount: boolean;
  /** Hay al menos un estado de cuenta ya parseado. */
  hasStatement: boolean;
  /** Hay al menos un ingreso capturado a mano. */
  hasIncome: boolean;
  /** Los tres primeros a la vez: el checklist no hace falta. */
  complete: boolean;
}

export function resolveSetupState(
  flags: Omit<SetupState, "complete">,
): SetupState {
  return {
    ...flags,
    // `hasIncome` NO entra en `complete` a propósito: es un paso recomendado,
    // no un requisito. Sin ingresos la app funciona —muestra gastos— y
    // bloquear el dashboard por eso sería castigar a quien solo quiere ver
    // sus tarjetas. El aviso de $0 del dashboard se encarga de insistir.
    complete: flags.hasProvider && flags.hasAccount && flags.hasStatement,
  };
}

export async function getSetupState(): Promise<SetupState> {
  const supabase = await createClient();

  const [credentials, accounts, statements, incomes] = await Promise.all([
    // Se traen las filas y no un count porque una credencial ilegible
    // (ENCRYPTION_KEY rotada) no cuenta como "IA conectada": el usuario tiene
    // que volver a guardarla, y el checklist debe seguir señalándolo.
    supabase.from("provider_credentials").select("api_key_encrypted"),
    supabase.from("accounts").select("id", { count: "exact", head: true }),
    supabase
      .from("statements")
      .select("id", { count: "exact", head: true })
      .eq("status", "parsed"),
    supabase.from("incomes").select("id", { count: "exact", head: true }),
  ]);

  const hasProvider = (credentials.data ?? []).some(
    (row) => tryDecryptSecret(row.api_key_encrypted) !== null,
  );

  return resolveSetupState({
    hasProvider,
    hasAccount: (accounts.count ?? 0) > 0,
    hasStatement: (statements.count ?? 0) > 0,
    hasIncome: (incomes.count ?? 0) > 0,
  });
}
