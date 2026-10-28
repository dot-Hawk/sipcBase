/** "Juan Pérez" becomes "JP". */
export function initials(nombre: string | undefined, apellido: string | undefined): string {
  const a = nombre?.trim().charAt(0) ?? '';
  const b = apellido?.trim().charAt(0) ?? '';
  return `${a}${b}`.toUpperCase() || '?';
}
