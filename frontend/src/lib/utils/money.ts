export function tyynToSom(value: number): number {
  return value / 100
}

export function formatSomFromTyyn(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(tyynToSom(value)) + ' сом'
}
