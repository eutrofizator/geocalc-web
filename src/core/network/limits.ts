import type { CoordinatePrecision } from './types';

/**
 * A Hálózatkiegyenlítés/Beállítások munkalap előbeállításai (súgó 62. o.).
 *
 * A súgó 62. oldali mintapéldája szerint az V. rendű hibahatárhoz 10″ irány- és 5 mm
 * távmérés-középhiba tartozik (99 %-os valószínűségi szint és távolsággal arányos iránysúly mellett).
 * A többi hálózati rendűség értékei a webes változatban becsültek – a súgó nem közli őket.
 */

export interface ErrorLimit {
  id: string;
  label: string;
  /** Iránymérés középhibája [″]. */
  sigmaDirection: number;
  /** Távmérés középhibája [mm]. */
  sigmaDistance: number;
  /** Durva hiba küszöb az irányokra [″]. */
  grossDirection: number;
  /** Durva hiba küszöb a távolságokra [m]. */
  grossDistance: number;
  /** A súgóval igazolt érték? */
  verified: boolean;
}

export const ERROR_LIMITS: ErrorLimit[] = [
  { id: 'szabatos', label: 'Szabatos fősokszögvonal', sigmaDirection: 3, sigmaDistance: 3, grossDirection: 180, grossDistance: 0.15, verified: false },
  { id: 'v-rendu', label: 'V. rendű hibahatár', sigmaDirection: 10, sigmaDistance: 5, grossDirection: 600, grossDistance: 0.5, verified: true },
  { id: 'felmeresi', label: 'Felmérési alaphálózat', sigmaDirection: 6, sigmaDistance: 5, grossDirection: 360, grossDistance: 0.3, verified: false },
  { id: 'mikro', label: 'Mikrohálózat', sigmaDirection: 15, sigmaDistance: 10, grossDirection: 900, grossDistance: 1, verified: false },
];

export function errorLimit(id: string): ErrorLimit | undefined {
  return ERROR_LIMITS.find((e) => e.id === id);
}

export const PRECISION_OPTIONS: { id: CoordinatePrecision; label: string }[] = [
  { id: 'cm', label: 'cm (2 tizedes)' },
  { id: 'mm', label: 'mm (3 tizedes)' },
  { id: 'tizedmm', label: 'tized mm (4 tizedes)' },
];
