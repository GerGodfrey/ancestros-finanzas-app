import { readFileSync } from "node:fs";
import path from "node:path";
import Ajv, { type ValidateFunction } from "ajv";
import { chat, type Provider } from "@/lib/ai/gateway";

const SKILL_DIR = path.join(process.cwd(), "skills", "pdf-statement-parser");

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

  if (opts.provider === "anthropic") {
    pdfBase64 = opts.pdfBuffer.toString("base64");
  } else {
    // OpenAI: extraemos el texto del PDF primero (sin capacidad nativa de
    // leer PDFs en este gateway) y se lo damos como texto plano.
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
    maxTokens: 8192,
    pdfBase64,
  });

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

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonText = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(jsonText);
  } catch {
    throw new Error(
      `El modelo no devolvió JSON válido. Respuesta cruda: ${text.slice(0, 500)}`,
    );
  }
}
