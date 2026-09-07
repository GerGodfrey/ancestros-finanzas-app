// El navegador sube el PDF a Storage por su cuenta y después le manda la ruta
// resultante a `POST /api/statements`, que la guarda tal cual en `file_path`.
// Esa ruta viene del cliente, así que es dato no confiable: nada impide mandar
// la carpeta de otro usuario y quedarse con una fila propia que apunta a su
// archivo.
//
// Hoy lo único que lo detiene es la política RLS del bucket (0002_storage.sql:
// `(storage.foldername(name))[1] = auth.uid()::text`), que bloquea la lectura
// al momento de descargar. Esto es la defensa en profundidad que falta: cortar
// la ruta ajena antes de que llegue a la base, en vez de confiar en que la
// única barrera nunca falle ni se relaje.
//
// Convención de la ruta (ver `statement-upload.tsx`):
//   {user_id}/{account_id}/{timestamp}-{nombre del archivo}
export function isOwnedStatementPath(
  filePath: string,
  userId: string,
): boolean {
  if (!filePath || !userId) return false;

  // `%2e%2e`, `%2f` y compañía: Storage decodifica la llave, así que una ruta
  // que se ve inocente aquí puede escaparse allá. Se rechaza el escapado en
  // lugar de intentar normalizarlo.
  if (filePath.includes("%")) return false;

  // Rutas absolutas y separadores de Windows nunca son parte de la convención.
  if (filePath.startsWith("/") || filePath.includes("\\")) return false;

  const segments = filePath.split("/");

  // Segmento vacío ("a//b"), "." o ".." — cualquiera cambia a qué archivo
  // apunta la ruta sin cambiar el prefijo.
  if (segments.some((s) => s === "" || s === "." || s === "..")) return false;

  // Tiene que haber algo después de la carpeta del usuario: la carpeta sola no
  // es un archivo.
  if (segments.length < 2) return false;

  return segments[0] === userId;
}
