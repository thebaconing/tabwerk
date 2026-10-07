# Tabwerk

Editor für Gitarrenübungen im Browser. Bausteine aneinanderreihen, als Tabulatur ansehen, abspielen und als MusicXML für Guitar Pro exportieren.

## Bausteine

| Baustein | Was er erzeugt |
|---|---|
| Übung | Dreier, Vierer, Terzen/Sprünge, 1-3-5, 1-3-5-7 auf- und abwärts in einer Lage |
| Skala | ganze Lage oder Ausschnitt, Start- und Endton im Griffbild anklicken, Richtung auf, ab, auf + ab, ab + auf |
| Akkord | Arpeggio eines frei gewählten Akkords (Dur, Moll, 7, maj7, m7, m7♭5, °7, sus, 6, 9 …) |
| Akkordfolge | Arpeggien nach Stufen (I-IV-V, ii-V-I, 12-Takt-Blues …), leitereigen oder mit eigener Akkordart |
| Freie Tonfolge | eigene Tonfolgen und Lieder: Töne und Akkorde per Klick aufs Griffbrett, eigene Länge pro Ton (Ganze bis 16tel, Triolen), Pausen, Bending (½, 1, Release), Hammer-on/Pull-off, Slide |

Leitern: Tonleiter (Dur, natürliches Moll), Pentatonik, Blues. Fingersätze: Lage oder 3 pro Saite bzw. Boxen.

Jeder Baustein hat einen eigenen Notenwert (Viertel, Achtel, Achteltriolen, Sechzehntel, Sechzehnteltriolen) und beginnt auf einem neuen Takt.

**Reihe:** Jeder Baustein lässt sich danach in weiteren Tonarten (auch Quintenzirkel, Quartenzirkel, chromatisch), Lagen oder Oktaven wiederholen.

**Eigene Folgen und Lieder zusammenstellen:**

- In der Tabulatur einen Ton anklicken, mit Umschalt-Klick einen Bereich markieren, auch über mehrere Bausteine. Kopieren, dann in eine freie Tonfolge einfügen (ohne Auswahl entsteht eine neue). Rhythmus und Pausen bleiben dabei erhalten.
- In freien Tonfolgen: ausschneiden, einfügen, löschen, Länge für die markierten Töne ändern.
- Mehrere Bausteine mit Strg-Klick oder Umschalt-Klick markieren und zu einer Tonfolge zusammenführen.
- Akkorde: „Akkord stapeln“ legt Töne übereinander, „Akkordgriff einfügen“ setzt einen fertigen Griff (Grundton, Akkordart, Lage), auch Powerchords (Grundton, Quinte, Oktave).
- Griff durchschalten: Akkord in einer freien Tonfolge auswählen, mit ◀ ▶ durch die spielbaren Griffe auf dem Griffbrett blättern (bei Powerchords Grundton auf E-, A-, D- oder G-Saite).
- Einen erzeugten Baustein in eine freie Tonfolge umwandeln, um jeden Ton direkt zu ändern.

**Andere Lagen:** Über den Umschalter oben zur zweiten Seite wechseln. Sie arbeitet mit den markierten Tönen, sonst mit dem ausgewählten Baustein.

- Tonfolge: Für jede Lage (Griffweite 4, 5 oder 6 Bünde) zeigt sie, wie sich dieselben Töne in derselben Reihenfolge dort spielen lassen. Töne, die in der Lage nicht liegen, werden mit kurzem Lagenwechsel gespielt; die Karte nennt, wie viele das sind. Das Griffbrett zeigt die Reihenfolge als Zahlen.
- Einzelner Akkord: alle Griffe des Akkords auf dem Griffbrett (andere Umkehrungen und Oktaven) und dieselben Töne in anderen Lagen, mit Tonnamen und hervorgehobenem Grundton.
- Jede Variante lässt sich anhören, als neue freie Tonfolge einfügen oder in einer freien Tonfolge direkt übernehmen.

**Tonart des Stücks:** oben wählen (alle Dur- und Molltonarten). Dann gilt:

- Vorschläge passend zur Tonart (Akkorde zuerst als Powerchord, wahlweise als voller Akkord oder Arpeggio; Powerchords merken sich den Akkord und lassen sich später mit „Zum vollen Akkord“ erweitern, angeschlagene Akkorde mit „Als Arpeggio auflösen“ zerlegen): Skalen und Übungen (Tonart, Paralleltonart, Pentatonik, Blues), leitereigene Akkorde mit Stufe, Akkordfolgen, und der nächste Akkord nach dem vorherigen (übliche Fortsetzungen nach Funktionsharmonik zuerst).
- Jeder Vorschlag hat einen Vorschau-Knopf ▶: spielt ihn so, wie er eingefügt würde, mit dem Takt davor, ohne etwas zu ändern.
- Umschalter „Passende zuerst“ / „Nur passende“: wirkt auf Vorschläge und Auswahllisten. „Nur passende“ blendet Unpassendes aus, verwandte Bausteine (Blue Note, Zwischendominante, Dominante aus harmonisch Moll, Blues-Septakkorde) bleiben sichtbar und sind markiert.
- Jeder Baustein bekommt eine Kennzeichnung: passt, verwandt oder passt nicht, mit Begründung.
- Leiterfremde Töne sind in der Tabulatur rot unterstrichen, Blue Notes gestrichelt.
- In freien Tonfolgen sind die Töne des Akkords davor im Griffbrett hervorgehoben.

**Taktart** pro Folge: 4/4, 3/4, 2/4, 5/4, 6/8, 12/8. Ein Ton, der nicht mehr in den Takt passt, beginnt im nächsten Takt (Haltebögen gibt es noch nicht).

## Bedienung

- Bausteine per Ziehen, mit ↑ ↓ oder Alt + Pfeiltaste umsortieren
- Strg+Z / Strg+Y: Rückgängig / Wiederholen
- In freien Tonfolgen: Pfeiltasten wählen (Umschalt erweitert), Entf löscht, P setzt eine Pause
- Strg+C / Strg+X / Strg+V: kopieren, ausschneiden, einfügen
- Bibliothek: mehrere Übungsfolgen, im Browser gespeichert
- Datei: MusicXML für Guitar Pro, Folge oder ganze Bibliothek als .json, Import von .json und Guitar Pro (.gp3, .gp4, .gp5, .gpx aus Version 6, .gp ab Version 7)

**Guitar-Pro-Import:** Jede sechssaitige Gitarrenspur wird eine eigene Folge in der Bibliothek, mit einer freien Tonfolge (Saite und Bund wie notiert, Tempo, Taktart, Titel). Gesang, Bass, Schlagzeug und andere Instrumente werden übersprungen. Übernommen werden Töne, Akkorde, Pausen, Triolen, Hammer-on/Pull-off, Slides und (bei .gp3 bis .gp5) Bendings; nur die erste Stimme je Takt. Weil es keine Haltebögen und punktierten Noten gibt, werden gebundene Töne zu Pausen und punktierte Noten zu Note plus Pause, die Takte bleiben dabei gleich lang. Gleichmäßig verstimmte Gitarren (z. B. Es-Stimmung) und Kapodaster behalten die Griffe, andere Stimmungen (z. B. Drop D) werden auf Standardstimmung umgerechnet.

Der Browser-Speicher kann verloren gehen (Daten löschen, privates Fenster). Wichtige Folgen regelmäßig als .json sichern.

## Starten

Keine Abhängigkeiten. `index.html` im Browser öffnen, oder:

```
npm start
```

## Einzelne Datei bauen

```
npm run build
```

Erzeugt `dist/tabwerk.html` mit allem eingebettet und `dist/artifact.html` für ein Claude-Artefakt.

## Tests

```
npm test
```

Prüft die Tonart-Logik (leitereigene Akkorde aller Tonarten, Zwischendominanten, jeder Vorschlag besteht die eigene Prüfung, nach V folgt zuerst I), Akkordgriffe, andere Lagen (gleiche Töne, Griffweite), alle Taktarten, gemischte Notenlängen, Kopieren/Einfügen, Zusammenführen, alle Leitern, Tonarten, Lagen und Muster, alle Akkordtypen in mehreren Lagen, alle Vorlagen für Akkordfolgen, Reihen (Tonarten, Lagen, Oktaven), Techniken, das Umwandeln in freie Tonfolgen, den Import (auch Guitar Pro .gp3, .gp4, .gp5, .gpx und .gp) und bei jedem Baustein: 4/4-Takte, Bund passt zum Ton, Schreibweise passt zum Ton, MusicXML-Tonhöhe passt zu Saite und Bund.

## Aufbau

```
index.html        Seite
css/style.css     Gestaltung (Farbschema Smaragd, dunkel als Standard)
js/theory.js      Leitern, Akkorde, Schreibweise, Fingersätze
js/model.js       Bausteine, Reihen, Takte
js/harmony.js     Tonart des Stücks: Prüfung, Vorschläge, nächster Akkord
js/musicxml.js    MusicXML- und ZIP-Export
js/gpimport.js    Import von Guitar Pro (.gp3 bis .gp5, .gpx, .gp)
js/audio.js       Wiedergabe mit Gitarrenklang, Metronom, Techniken
js/render.js      Griffbrett und Tabulatur als SVG
js/ui.js          Oberfläche
js/examples.js    Beispiel-Folge für den ersten Start
tests/            Prüfungen (Node, ohne Abhängigkeiten)
tools/build.js    Einzeldatei-Build
```
