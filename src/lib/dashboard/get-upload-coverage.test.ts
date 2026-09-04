import { describe, expect, it } from "vitest";
import { buildUploadCoverage } from "./get-upload-coverage";

describe("buildUploadCoverage", () => {
  it("regresa 100% cuando todas las tarjetas que existían ese mes tienen statement", () => {
    const coverage = buildUploadCoverage(
      [
        { id: "a1", issuer: "Banamex", product_name: "Explora", created_at: "2026-08-01T00:00:00Z" },
        { id: "a2", issuer: "Amex", product_name: "Platinum", created_at: "2026-08-01T00:00:00Z" },
      ],
      [
        { account_id: "a1", period_end: "2026-08-20", due_date: "2026-09-05" },
        { account_id: "a2", period_end: "2026-08-22", due_date: "2026-09-07" },
      ],
      "2026-08",
    );

    expect(coverage.months).toHaveLength(1);
    expect(coverage.months[0]).toMatchObject({
      month: "2026-08",
      expectedCount: 2,
      uploadedCount: 2,
      percentage: 1,
    });
  });

  it("no cambia el % de un mes pasado cuando se agrega una tarjeta nueva después", () => {
    // Agosto: 2 tarjetas, ambas con statement -> 100%.
    // Septiembre: se agrega una 3ra tarjeta -> agosto sigue siendo 2/2 (100%),
    // septiembre ahora necesita 3/3 para el 100%.
    const coverage = buildUploadCoverage(
      [
        { id: "a1", issuer: "Banamex", product_name: "Explora", created_at: "2026-08-01T00:00:00Z" },
        { id: "a2", issuer: "Amex", product_name: "Platinum", created_at: "2026-08-01T00:00:00Z" },
        { id: "a3", issuer: "BBVA", product_name: "Azul", created_at: "2026-09-10T00:00:00Z" },
      ],
      [
        { account_id: "a1", period_end: "2026-08-20", due_date: "2026-09-05" },
        { account_id: "a2", period_end: "2026-08-22", due_date: "2026-09-07" },
        { account_id: "a1", period_end: "2026-09-20", due_date: "2026-10-05" },
        { account_id: "a2", period_end: "2026-09-22", due_date: "2026-10-07" },
      ],
      "2026-09",
    );

    const august = coverage.months.find((m) => m.month === "2026-08")!;
    const september = coverage.months.find((m) => m.month === "2026-09")!;

    expect(august).toMatchObject({ expectedCount: 2, uploadedCount: 2, percentage: 1 });
    expect(september).toMatchObject({ expectedCount: 3, uploadedCount: 2 });
    expect(september.percentage).toBeCloseTo(2 / 3);
  });

  it("si la tarjeta se da de alta tarde pero ya tenía un corte anterior, ese corte SÍ cuenta en su mes", () => {
    // Palacio se registró en la app en septiembre, pero el usuario le sube
    // un PDF con corte del 22 de agosto (la tarjeta ya existía, solo se dio
    // de alta tarde) -> agosto debe incluir a Palacio, distinto del caso de
    // arriba (tarjeta genuinamente nueva, sin cortes previos).
    const coverage = buildUploadCoverage(
      [
        { id: "a1", issuer: "Banamex", product_name: "Explora", created_at: "2026-08-01T00:00:00Z" },
        { id: "a2", issuer: "Amex", product_name: "Platinum", created_at: "2026-08-01T00:00:00Z" },
        { id: "a3", issuer: "Palacio", product_name: "Palacio", created_at: "2026-09-10T00:00:00Z" },
      ],
      [
        { account_id: "a1", period_end: "2026-08-20", due_date: "2026-09-05" },
        { account_id: "a2", period_end: "2026-08-22", due_date: "2026-09-07" },
        { account_id: "a3", period_end: "2026-08-22", due_date: "2026-09-10" },
      ],
      "2026-09",
    );

    const august = coverage.months.find((m) => m.month === "2026-08")!;
    expect(august.expectedCount).toBe(3);
    expect(august.uploadedCount).toBe(3);
    expect(august.percentage).toBe(1);
    const palacio = august.accounts.find((a) => a.accountId === "a3")!;
    expect(palacio).toMatchObject({ uploaded: true, periodEnd: "2026-08-22" });
  });

  describe("highlightMonth", () => {
    it("prefiere un mes reciente incompleto (agosto) sobre el mes actual (septiembre) que apenas empieza", () => {
      // Exactamente el caso que reportó el usuario: es 2 de septiembre,
      // ningún corte de septiembre existe todavía (0/2, normal), pero
      // agosto quedó a medias (1/2) — ese es el que de verdad urge.
      const coverage = buildUploadCoverage(
        [
          { id: "a1", issuer: "Banamex", product_name: "Explora", created_at: "2026-08-01T00:00:00Z" },
          { id: "a2", issuer: "Amex", product_name: "Platinum", created_at: "2026-08-01T00:00:00Z" },
        ],
        [{ account_id: "a1", period_end: "2026-08-22", due_date: "2026-09-05" }],
        "2026-09",
      );

      expect(coverage.highlightMonth).toMatchObject({
        month: "2026-08",
        expectedCount: 2,
        uploadedCount: 1,
      });
      const missing = coverage.highlightMonth!.accounts.filter((a) => !a.uploaded);
      expect(missing.map((a) => a.accountId)).toEqual(["a2"]);
    });

    it("cae al mes actual cuando los últimos 2 meses ya están al 100%", () => {
      const coverage = buildUploadCoverage(
        [{ id: "a1", issuer: "Banamex", product_name: "Explora", created_at: "2026-06-01T00:00:00Z" }],
        [
          { account_id: "a1", period_end: "2026-07-15", due_date: "2026-08-05" },
          { account_id: "a1", period_end: "2026-08-15", due_date: "2026-09-05" },
        ],
        "2026-09",
      );

      // Junio (0%) quedó fuera de la ventana de 2 meses hacia atrás desde
      // septiembre (agosto, julio) — no debe "resucitarlo".
      expect(coverage.highlightMonth?.month).toBe("2026-09");
    });

    it("no se queda pegado para siempre en un mes que nunca llega a 100% (ej. una tarjeta que ya no se usa)", () => {
      // Junio se queda en 1/2 para siempre (a2 nunca sube su corte de junio).
      // Meses más tarde (octubre), julio/agosto/septiembre sí están al 100%
      // -> highlightMonth debe ser el mes actual, no junio.
      const coverage = buildUploadCoverage(
        [
          { id: "a1", issuer: "Banamex", product_name: "Explora", created_at: "2026-06-01T00:00:00Z" },
          { id: "a2", issuer: "Amex", product_name: "Platinum", created_at: "2026-06-01T00:00:00Z" },
        ],
        [
          { account_id: "a1", period_end: "2026-06-15", due_date: "2026-07-05" },
          { account_id: "a1", period_end: "2026-07-15", due_date: "2026-08-05" },
          { account_id: "a2", period_end: "2026-07-15", due_date: "2026-08-05" },
          { account_id: "a1", period_end: "2026-08-15", due_date: "2026-09-05" },
          { account_id: "a2", period_end: "2026-08-15", due_date: "2026-09-05" },
          { account_id: "a1", period_end: "2026-09-15", due_date: "2026-10-05" },
          { account_id: "a2", period_end: "2026-09-15", due_date: "2026-10-05" },
        ],
        "2026-10",
      );

      const june = coverage.months.find((m) => m.month === "2026-06")!;
      expect(june.percentage).toBe(0.5); // se quedó a medias para siempre

      expect(coverage.highlightMonth?.month).toBe("2026-10");
    });
  });

  it("rellena los meses intermedios sin statements", () => {
    const coverage = buildUploadCoverage(
      [{ id: "a1", issuer: "Banamex", product_name: "Explora", created_at: "2026-06-01T00:00:00Z" }],
      [{ account_id: "a1", period_end: "2026-08-20", due_date: "2026-09-05" }],
      "2026-08",
    );

    expect(coverage.months.map((m) => m.month)).toEqual([
      "2026-06",
      "2026-07",
      "2026-08",
    ]);
    expect(coverage.months[0].percentage).toBe(0);
    expect(coverage.months[1].percentage).toBe(0);
    expect(coverage.months[2].percentage).toBe(1);
  });

  it("agrupa por fecha de corte (period_end), no por fecha límite de pago — expone ambas para que se pueda distinguir en la UI", () => {
    // Corte 22 de agosto, pago límite 15 de septiembre: cuenta para AGOSTO,
    // aunque el usuario piense en él como "el pago de septiembre".
    const coverage = buildUploadCoverage(
      [{ id: "a1", issuer: "Banamex", product_name: "Explora", created_at: "2026-08-01T00:00:00Z" }],
      [{ account_id: "a1", period_end: "2026-08-22", due_date: "2026-09-15" }],
      "2026-09",
    );

    const august = coverage.months.find((m) => m.month === "2026-08")!;
    const september = coverage.months.find((m) => m.month === "2026-09")!;

    expect(august.uploadedCount).toBe(1);
    expect(august.accounts[0]).toMatchObject({
      uploaded: true,
      periodEnd: "2026-08-22",
      dueDate: "2026-09-15",
    });

    expect(september.uploadedCount).toBe(0);
    expect(september.accounts[0]).toMatchObject({
      uploaded: false,
      periodEnd: null,
      dueDate: null,
    });
  });

  it("regresa vacío cuando no hay tarjetas", () => {
    const coverage = buildUploadCoverage([], [], "2026-08");
    expect(coverage.months).toEqual([]);
    expect(coverage.highlightMonth).toBeNull();
  });
});
