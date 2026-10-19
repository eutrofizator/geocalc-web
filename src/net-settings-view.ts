import { ERROR_LIMITS, errorLimit } from './core/network/limits';
import { $ } from './ui';

/**
 * A Hálózatkiegyenlítés/Beállítások munkalap kiegészítése (súgó 62. o.).
 *
 * A középhibák, súlyok és a statisztikai beállítások a Hálózatkiegyenlítés/Munkaterület
 * munkalap vezérlőivel közösek (ugyanazokkal az azonosítókkal). Ez a nézet a hálózati rendűség
 * („hibahatár”) előbeállítását és annak a középhibákra való alkalmazását adja.
 */

export function initNetSettingsView(): void {
  const limitSel = $<HTMLSelectElement>('ns-limit');
  const status = $('ns-status');
  const sigmaDir = $<HTMLInputElement>('net-sigma-dir');
  const sigmaDist = $<HTMLInputElement>('net-sigma-dist');
  const grossDir = $<HTMLInputElement>('net-gross-dir');
  const grossDist = $<HTMLInputElement>('net-gross-dist');

  for (const l of ERROR_LIMITS) {
    const opt = new Option(`${l.label} (${l.sigmaDirection}″ / ${l.sigmaDistance} mm)${l.verified ? '' : ' – becsült'}`, l.id);
    limitSel.append(opt);
  }
  limitSel.append(new Option('egyéni', 'custom'));

  /** A kiválasztó beállítása a középhibák alapján. */
  const syncLimit = () => {
    const dir = Number(sigmaDir.value);
    const dist = Number(sigmaDist.value);
    const match = ERROR_LIMITS.find((l) => l.sigmaDirection === dir && l.sigmaDistance === dist);
    limitSel.value = match ? match.id : 'custom';
  };

  $('ns-apply-limit').addEventListener('click', () => {
    const limit = errorLimit(limitSel.value);
    if (!limit) {
      status.textContent = 'Válassz hibahatárt a listából.';
      return;
    }
    sigmaDir.value = String(limit.sigmaDirection);
    sigmaDist.value = String(limit.sigmaDistance);
    grossDir.value = String(limit.grossDirection);
    grossDist.value = String(limit.grossDistance);
    for (const e of [sigmaDir, sigmaDist, grossDir, grossDist]) e.dispatchEvent(new Event('change'));
    status.textContent =
      `A(z) ${limit.label} beállítva: irány ${limit.sigmaDirection}″, távolság ${limit.sigmaDistance} mm` +
      (limit.verified ? ' (a súgó 62. oldali mintapéldájából igazolt érték).' : ' (becsült érték – a súgó nem közli).');
  });

  for (const e of [sigmaDir, sigmaDist, grossDir, grossDist]) e.addEventListener('change', syncLimit);
  $('net-reset').addEventListener('click', () => window.setTimeout(syncLimit, 0));

  syncLimit();
  status.textContent = 'A hibahatár előbeállítás a középhibákat és a durva hiba küszöbeit állítja be.';
}
