/** Számítási vagy bemeneti hiba, amely a felhasználónak szól és nem állítja le a teljes futást. */
export class CalcError extends Error {
  constructor(
    message: string,
    readonly line?: number,
  ) {
    super(message);
    this.name = 'CalcError';
  }
}
