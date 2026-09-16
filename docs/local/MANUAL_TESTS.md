# Manuelle Tests — Compare: Rating + Status in einer Zeile (2026-09-15)

Bitte `npm run dev` selbst starten (Backend auf Port `1337` per `.env`,
Vite-Dev-Server auf Port `5173`, `/api`-Aufrufe werden proxied).
Danach http://localhost:5173 im Browser öffnen.

## Vergleichstabelle mit klickbarer Bewertungs-Zeile

- [ ] Seite `/?journey=bike` → `/vergleich` öffnen (mind. 2 Einträge vorhanden,
      sonst vorher auf dem Dashboard welche anlegen): Es gibt genau eine Zeile
      „Bewertung & Status“ — keine separaten Zeilen „Rating“, „Status“ oder
      „Erfahrungen“ mehr.
- [ ] Pro Produkt-Zelle stehen Sterne oben und das Status-Badge darunter;
      Zelle hat Hover-Highlight und ist per Klick öffenbar.
- [ ] Klick auf eine Bewertungs-Zelle öffnet den Dialog „Bewertung – <Name>“
      mit Sternen, Status-Dropdown und Kommentarfeld (Kommentar vorbefüllt,
      falls vorhanden).
- [ ] Sterne ändern + anderen Status wählen + Kommentar schreiben →
      „Speichern“: Dialog schließt, Zelle zeigt neue Sterne/neues Badge,
      Toast „Bewertung gespeichert“ erscheint.
- [ ] Dialog erneut öffnen → „Abbrechen“ nach Änderung: Werte bleiben
      unverändert (verworfen).
- [ ] Der Kommentar erscheint nirgends in der Tabelle; über den Stift-Button
      (ProductDialog, „Erfahrungen / Vor- & Nachteile“) ist derselbe Kommentar
      weiterhin les-/editierbar.
- [ ] Sterne komplett abwählen (aktiven Stern erneut klicken → 0 Sterne) und
      speichern: Zelle zeigt leere Sterne, kein Fehler.
- [ ] Tastatur: per Tab in die Bewertungs-Zelle fokussieren (Fokus-Ring
      sichtbar), Enter/Space öffnet den Dialog, Esc schließt ihn.
- [ ] Leere Journey (z.B. neu angelegte): unveränderter Leerzustand ohne
      Tabelle, kein Fehler.
