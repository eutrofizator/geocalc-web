import { createPage } from './shell';
import { $, el, storage } from './ui';

/**
 * Beállítások/Általános beállítások (súgó 10. o.).
 *
 * A valódi program itt a munkakönyvtárat, a külső szövegszerkesztőt és a jegyzőkönyv sorhosszát
 * állítja; a böngészőben ezeknek nincs értelme. Helyettük a webes változat saját, általános
 * beállításai: a munkamenet mentése/betöltése, az automatikus számítás, az induló munkalap és a
 * böngészőben tárolt adatok kezelése.
 */

export const START_KEY = 'geocalc-web.start';
export type StartPage = 'about' | 'last' | 'calc';
const LAST_KEY = 'geocalc-web.last';
const PREFIX = 'geocalc-web.';

export function startPage(): StartPage {
  const v = storage.get(START_KEY);
  return v === 'last' || v === 'calc' ? v : 'about';
}

/** Az induláskor megnyitandó munkalap (az „utoljára használt” a böngésző tárolójából). */
export function startSheet(): string {
  const mode = startPage();
  if (mode === 'calc') return 'calc';
  if (mode === 'last') return storage.get(LAST_KEY) || 'about';
  return 'about';
}

export function rememberSheet(id: string): void {
  storage.set(LAST_KEY, id);
}

function storedKeys(): string[] {
  try {
    return Object.keys(localStorage).filter((k) => k.startsWith(PREFIX));
  } catch {
    return [];
  }
}

export function initGeneralSettingsView(actions: { sessionSave: () => void; sessionLoad: () => void }): { refresh: () => void } {
  const { body } = createPage('general-settings', 'Beállítások / Általános beállítások');
  const pane = el('section', 'pane gs-pane');
  pane.setAttribute('aria-label', 'Általános beállítások');
  const form = el('div', 'form');

  // Munkamenet
  const session = el('fieldset', 'dims column');
  session.append(el('legend', undefined, 'Munkamenet'));
  session.append(
    el('p', 'hint', 'A teljes munkaterület (minden munkalap tartalma és beállítása) egyetlen .gcs fájlba menthető, és másik gépen visszatölthető.'),
  );
  const sessionRow = el('div', 'btnrow');
  const saveBtn = el('button', undefined, 'Munkamenet mentése…');
  saveBtn.type = 'button';
  saveBtn.id = 'gs-session-save';
  saveBtn.addEventListener('click', actions.sessionSave);
  const loadBtn = el('button', undefined, 'Munkamenet betöltése…');
  loadBtn.type = 'button';
  loadBtn.id = 'gs-session-load';
  loadBtn.addEventListener('click', actions.sessionLoad);
  sessionRow.append(saveBtn, loadBtn);
  session.append(sessionRow);

  // Számítás
  const calc = el('fieldset', 'dims column');
  calc.append(el('legend', undefined, 'Geodéziai számítások'));
  const autoLabel = el('label', 'check');
  const autoBox = el('input');
  autoBox.type = 'checkbox';
  autoBox.id = 'gs-auto';
  const mainAuto = $<HTMLInputElement>('auto');
  autoBox.checked = mainAuto.checked;
  autoBox.addEventListener('change', () => {
    mainAuto.checked = autoBox.checked;
    mainAuto.dispatchEvent(new Event('change'));
  });
  mainAuto.addEventListener('change', () => {
    autoBox.checked = mainAuto.checked;
  });
  autoLabel.append(autoBox, el('span', undefined, 'Automatikus számítás gépelés közben (különben F5 / Ctrl+Enter)'));
  calc.append(autoLabel);

  // Indítás
  const start = el('fieldset', 'dims column');
  start.append(el('legend', undefined, 'Indítás'));
  const startLabel = el('label');
  startLabel.append(el('span', 'label-text', 'Induláskor megnyíló munkalap'));
  const startSel = el('select');
  startSel.id = 'gs-start';
  startSel.append(
    new Option('Névjegy (mint a valódi programban)', 'about'),
    new Option('Az utoljára használt munkalap', 'last'),
    new Option('Geodéziai számítások / Munkaterület', 'calc'),
  );
  startSel.value = startPage();
  startSel.addEventListener('change', () => storage.set(START_KEY, startSel.value));
  startLabel.append(startSel);
  start.append(startLabel);

  // Tárolt adatok
  const data = el('fieldset', 'dims column');
  data.append(el('legend', undefined, 'A böngészőben tárolt adatok'));
  const count = el('p', 'hint');
  count.id = 'gs-stored';
  const clearBtn = el('button', undefined, 'Tárolt adatok törlése…');
  clearBtn.type = 'button';
  clearBtn.id = 'gs-clear';
  clearBtn.addEventListener('click', () => {
    const keys = storedKeys();
    if (keys.length === 0) return;
    if (!confirm(`A böngészőben tárolt ${keys.length} munkalap-tartalom és beállítás törlődik. Előtte érdemes munkamenetet menteni. Folytatod?`)) return;
    try {
      for (const k of keys) localStorage.removeItem(k);
    } catch {
      /* a tároló nem érhető el */
    }
    location.reload();
  });
  const dataRow = el('div', 'btnrow');
  dataRow.append(clearBtn);
  data.append(count, dataRow);

  form.append(session, calc, start, data);
  pane.append(form);
  body.append(pane);

  const refresh = () => {
    const n = storedKeys().length;
    count.textContent =
      n === 0
        ? 'Nincs tárolt adat (vagy a böngésző nem engedi a tárolást).'
        : `${n} tárolt elem (munkalap-tartalom és beállítás). Csak ezen a gépen, ebben a böngészőben érhetők el.`;
    clearBtn.disabled = n === 0;
  };
  refresh();
  return { refresh };
}
