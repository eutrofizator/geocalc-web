/** Hálózatkiegyenlítés közös típusai. */

export interface NetPoint {
  id: string;
  y: number;
  x: number;
  m: number | null;
  mark: string;
}

/** Egy irányzás egy állásponton (GMJ-sor). A szögek tizedes fokban. */
export interface NetObservation {
  target: string;
  /** Irányérték (vízszintes leolvasás) [fok]. */
  hz: number;
  /** Zenitszög [fok]. */
  zi: number | null;
  /** Ferde távolság [m]. */
  slope: number | null;
  /** Vízszintes távolság [m] (a műszerből). */
  horizontal: number | null;
  /** Magasságkülönbség [m]. */
  dM: number | null;
  /** Prizmamagasság [m]. */
  targetHeight: number | null;
  /** A vetületre és a tengerszintre redukált vízszintes távolság [m] (a vízszintes hálózat kiindulása). */
  distance: number | null;
}

export interface NetStation {
  id: string;
  instrumentHeight: number | null;
  observations: NetObservation[];
}

export type DirectionWeight = 'proportional' | 'equal';
export type DistanceWeight = 'equal' | 'dependent';

/** A számítási (nyomtatási) koordináta-élesség (súgó 62. o.): 2 = cm, 3 = mm, 4 = tized mm. */
export type CoordinatePrecision = 'cm' | 'mm' | 'tizedmm';

export const PRECISION_DECIMALS: Record<CoordinatePrecision, number> = { cm: 2, mm: 3, tizedmm: 4 };

export interface HorizontalSettings {
  /** Az irányok középhibája az átlagos távolságnál [″]; egyben a súlyegység középhibája. */
  sigmaDirection: number;
  /** Távmérés középhibája: távolságtól független tag [mm]. */
  sigmaDistance: number;
  /** Távmérés középhibája: távolságfüggő tag [mm/km] (csak „dependent” súlyozásnál számít). */
  sigmaDistancePerKm: number;
  /** Az irányok súlya a távolsággal arányos (beillesztett hálózat) vagy azonos. */
  directionWeight: DirectionWeight;
  distanceWeight: DistanceWeight;
  /** Átlagos távolság [m]: ennél p = 1 az irányok súlya. */
  averageDistance: number;
  /** A statisztikai próbák valószínűségi szintje (0.90…0.999). */
  probability: number;
  /** Durva hiba küszöb az irányokra: az állomás tájékozásától való eltérés [″]. */
  grossDirection: number;
  /** Durva hiba küszöb a távolságokra [m]. */
  grossDistance: number;
  /** A koordináták kiírásának élessége (cm / mm / tized mm). */
  coordinatePrecision: CoordinatePrecision;
  /**
   * Önálló hálózat: az adott koordinátájú pontokat is ismeretlennek tekinti (a megadott koordináták csak
   * közelítő értékek), és a hálózatot belső megkötéssel (a súlypont, az irányzat és – ha a méretarány a
   * mérésekből nem adódik – a nagyság rögzítésével) egyeníti ki. A végleges elhelyezést a hálózati dátum
   * (eltolás és forgatás) adja meg.
   */
  free: boolean;
  /** Kézzel kizárt mérések: „állomás>pont:dir” vagy „állomás>pont:dist”. */
  excluded: string[];
  /**
   * További új pontok: koordináta nélküli, de a kiegyenlítésbe bevonandó pontok, amelyeken nem álltak fel
   * (pl. kisalappont, magaspont). Az állomások közül a koordináta nélküliek mindig új pontok; a többi koordináta nélküli
   * irányzott pont részletpont.
   */
  extraPoints: string[];
}

export const DEFAULT_HORIZONTAL_SETTINGS: HorizontalSettings = {
  sigmaDirection: 4,
  sigmaDistance: 10,
  sigmaDistancePerKm: 2,
  directionWeight: 'proportional',
  distanceWeight: 'equal',
  averageDistance: 1000,
  probability: 0.99,
  grossDirection: 600,
  grossDistance: 0.5,
  coordinatePrecision: 'mm',
  free: false,
  excluded: [],
  extraPoints: [],
};

export type HeightWeight = 'equal' | 'proportional';

export interface VerticalSettings {
  /** A magasságkülönbség kiegyenlítés előtti középhibája az egységnyi súlyú méréshez tartozó távolságnál [cm]. */
  sigma: number;
  /** Egységnyi súlyú méréshez tartozó távolság [m] (csak távolsággal arányos súlyozásnál számít). */
  unitDistance: number;
  /** Egyenlő súly (távolságtól független) vagy a távolsággal fordítottan arányos súly. */
  weight: HeightWeight;
  /** A statisztikai próbák valószínűségi szintje. */
  probability: number;
  /**
   * Önálló hálózat: az adott magasságú pontok magasságát nem rögzíti, csak közelítő értéknek veszi;
   * a kiegyenlítés a közelítő magasságok átlagát tartja meg (a javítások összege nulla).
   */
  free: boolean;
  /** A magasságok kiírásának élessége (súgó 53. o.: cm, mm vagy tized mm; alapértelmezés: cm). */
  precision?: CoordinatePrecision;
  /** Kézzel kihagyott magasságkülönbségek: „állomás>pont” (súgó 53. o.). */
  excluded?: string[];
}

export const DEFAULT_VERTICAL_SETTINGS: VerticalSettings = {
  sigma: 1,
  unitDistance: 900,
  weight: 'equal',
  probability: 0.99,
  free: false,
};
