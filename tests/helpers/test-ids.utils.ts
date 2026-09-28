// Deterministic UUIDs for fixtures: testId(7) reads better in assertions than a random value.
export function testId(sequence: number): string {
  return `00000000-0000-7000-8000-${String(sequence).padStart(12, "0")}`;
}
