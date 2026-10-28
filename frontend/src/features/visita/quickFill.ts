export function applyPercent(base: number, percent: number): number {
  const value = Math.round(base * (1 + percent / 100) * 100) / 100;
  return Math.max(0.01, value);
}

export interface QuickFill {
  id: 'same' | 'up' | 'down';
  label: string;
  valor: number;
}

export function quickFillOptions(previous: number | null): QuickFill[] {
  if (previous === null || !(previous > 0)) return [];
  return [
    { id: 'same', label: 'Igual al anterior', valor: previous },
    { id: 'up', label: '+5%', valor: applyPercent(previous, 5) },
    { id: 'down', label: '−5%', valor: applyPercent(previous, -5) },
  ];
}
