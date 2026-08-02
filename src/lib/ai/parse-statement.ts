import { readFileSync } from "node:fs";
import path from "node:path";
import Ajv, { type ValidateFunction } from "ajv";
import { chat, type Provider } from "@/lib/ai/gateway";
import { extractJson } from "@/lib/ai/extract-json";

const SKILL_DIR = path.join(process.cwd(), "skills", "pdf-statement-parser");

// Un estado de cuenta real puede traer 30-50+ movimientos, y la respuesta es
// un JSON completo (cuenta + statement + transactions + msi_plans), así que
// el default general del gateway (4096) no alcanza. Cada proveedor tiene su
// propio tope real de tokens de salida — usar más de eso solo causa un error
// de la API, así que el límite es por proveedor, no un solo número a ciegas:
// - Anthropic/OpenAI: modelos recientes soportan bastante más que esto, pero
//   16384 ya cubre statements largos con margen de sobra.
// - Gemini: los modelos Flash actuales soportan hasta 64k-65536 de salida.
// - DeepSeek: deepseek-chat tiene un tope duro de 8192 tokens de salida.
const PARSE_MAX_TOKENS: Record<Provider, number> = {
  anthropic: 16384,
  openai: 16384,
  gemini: 32768,
  deepseek: 8192,
};

let cachedSkill: { instructions: string; schema: object } | null = null;

function loadSkill() {
  if (cachedSkill) return cachedSkill;
  const instructions = readFileSync(
    path.join(SKILL_DIR, "SKILL.md"),
    "utf8",
  );
  const schema = JSON.parse(
    readFileSync(path.join(SKILL_DIR, "schema.json"), "utf8"),
  );
  cachedSkill = { instructions, schema };
  return cachedSkill;
}

const ajv = new Ajv({ allErrors: true, strict: false });
let cachedValidator: ValidateFunction | null = null;

function getValidator(schema: object) {
  if (!cachedValidator) {
    cachedValidator = ajv.compile(schema);
  }
  return cachedValidator;
}

export interface ParsedStatement {
  // Ver skills/pdf-statement-parser/schema.json — se deja `unknown` aquí y
  // se tipa fuerte en la capa que inserta a Supabase (Fase 2, siguiente paso).
  account: Record<string, unknown>;
  statement: Record<string, unknown>;
  transactions: Record<string, unknown>[];
  msi_plans?: Record<string, unknown>[];
  warnings?: string[];
}

export interface ParseStatementResult {
  data: ParsedStatement;
  warnings: string[];
  schemaValid: boolean;
}

export async function parseStatementPdf(opts: {
  provider: Provider;
  apiKey: string;
  pdfBuffer: Buffer;
}): Promise<ParseStatementResult> {
  const { instructions, schema } = loadSkill();

  const system = [
    instructions,
    "",
    "Esquema JSON exacto (JSON Schema) que tu respuesta debe cumplir:",
    JSON.stringify(schema),
  ].join("\n");

  let userContent =
    "Extrae los datos de este estado de cuenta según las instrucciones. Responde solo con el JSON, nada más.";
  let pdfBase64: string | undefined;

  const supportsNativePdf =
    opts.provider === "anthropic" || opts.provider === "gemini";

  if (supportsNativePdf) {
    pdfBase64 = opts.pdfBuffer.toString("base64");
  } else {
    // OpenAI y DeepSeek: no leen PDF nativo en este gateway — extraemos el
    // texto primero y se lo damos como texto plano.
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: opts.pdfBuffer });
    const { text } = await parser.getText();
    await parser.destroy();
    userContent = `Texto extraído del PDF del estado de cuenta:\n\n${text}\n\n${userContent}`;
  }

  const result = await chat({
    provider: opts.provider,
    apiKey: opts.apiKey,
    system,
    messages: [{ role: "user", content: userContent }],
    maxTokens: PARSE_MAX_TOKENS[opts.provider],
    pdfBase64,
  });

  if (result.finishReason === "max_tokens") {
    throw new Error(
      `La respuesta del modelo se cortó por alcanzar el límite de tokens de salida (${PARSE_MAX_TOKENS[opts.provider]}) — el estado de cuenta tiene demasiados movimientos para que este proveedor lo devuelva completo en una sola respuesta. Prueba con otro proveedor (Anthropic o Gemini soportan más tokens de salida) o divide el PDF.`,
    );
  }

  const json = extractJson(result.text) as ParsedStatement;
  const validate = getValidator(schema);
  const schemaValid = validate(json) as boolean;

  const warnings = [...(json.warnings ?? [])];
  if (!schemaValid) {
    warnings.push(
      `La salida no cumplió el esquema exactamente: ${ajv.errorsText(validate.errors)}`,
    );
  }

  return { data: json, warnings, schemaValid };
}
