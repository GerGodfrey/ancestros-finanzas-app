// Cuándo avisar de que faltan ingresos.
//
// El balance del dashboard es ingresos − egresos. Sin ingresos capturados el
// número no es «cero neto»: es el gasto del mes con signo negativo, y se lee
// como si la persona estuviera perdiendo dinero. Decirlo es más honesto que
// mostrar una cifra que miente.
//
// Se separa de la consulta para poder fijar la regla con tests: el aviso solo
// aparece cuando hay movimientos que comparar. En un mes sin datos no hay nada
// que corregir, y salir con un aviso ahí sería ruido.
export function shouldWarnAboutMissingIncome(opts: {
  hasData: boolean;
  ingresoTotal: number;
  egresoTotal: number;
}): boolean {
  return opts.hasData && opts.ingresoTotal === 0 && opts.egresoTotal > 0;
}
