export function getNarrativeMomentum(
  history: any[]
) {

  if (history.length < 3)
    return 0;

  const recent =
    history.slice(-5);

  const avg =
    recent.reduce(
      (a, b) => a + b.risk,
      0
    ) / recent.length;

  return Math.round(avg);
}