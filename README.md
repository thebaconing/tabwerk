# Tabwerk

Editor für Gitarrenübungen im Browser. Bausteine aneinanderreihen, als Tabulatur ansehen, abspielen und als MusicXML für Guitar Pro exportieren.

## Bausteine

| Baustein | Was er erzeugt |
|---|---|
| Übung | Dreier, Vierer, Terzen/Sprünge, 1-3-5, 1-3-5-7 auf- und abwärts in einer Lage |
| Skala | ganze Lage oder Ausschnitt, Start- und Endton im Griffbild anklicken, Richtung auf, ab, auf + ab, ab + auf |
| Akkord | Arpeggio eines frei gewählten Akkords (Dur, Moll, 7, maj7, m7, m7♭5, °7, sus, 6, 9 …) |
| Akkordfolge | Arpeggien nach Stufen (I-IV-V, ii-V-I, 12-Takt-Blues …), leitereigen oder mit eigener Akkordart |
| Freie Tonfolge | Töne per Klick aufs Griffbrett, mit Pausen, Bending (½, 1, Release), Hammer-on/Pull-off und Slide |

Leitern: Tonleiter (Dur, natürliches Moll), Pentatonik, Blues. Fingersätze: Lage oder 3 pro Saite bzw. Boxen.

Jeder Baustein hat einen eigenen Notenwert (Viertel, Achtel, Achteltriolen, Sechzehntel, Sechzehnteltriolen) und beginnt auf einem neuen Takt.

**Reihe:** Jeder Baustein lässt sich danach in weiteren Tonarten (auch Quintenzirkel, Quartenzirkel, chromatisch), Lagen oder Oktaven wiederholen.

**Einzelne Töne ändern:** Ton in der Tabulatur anklicken und den Baustein in eine freie Tonfolge umwandeln. Danach ist jeder Ton editierbar.

## Bedienung

- Bausteine per Ziehen, mit ↑ ↓ oder Alt + Pfeiltaste umsortieren
- Strg+Z / Strg+Y: Rückgängig / Wiederholen
- In freien Tonfolgen: Pfeiltasten wählen, Entf löscht, P setzt eine Pause
- Bibliothek: mehrere Übungsfolgen, im Browser gespeichert
- Datei: MusicXML für Guitar Pro, Folge oder ganze Bibliothek als .json, Import

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

Prüft alle Leitern, Tonarten, Lagen und Muster, alle Akkordtypen in mehreren Lagen, alle Vorlagen für Akkordfolgen, Reihen (Tonarten, Lagen, Oktaven), Techniken, das Umwandeln in freie Tonfolgen, den Import und bei jedem Baustein: 4/4-Takte, Bund passt zum Ton, Schreibweise passt zum Ton, MusicXML-Tonhöhe passt zu Saite und Bund.

## Aufbau

```
index.html        Seite
css/style.css     Gestaltung (Farbschema Smaragd, dunkel als Standard)
js/theory.js      Leitern, Akkorde, Schreibweise, Fingersätze
js/model.js       Bausteine, Reihen, Takte
js/musicxml.js    MusicXML- und ZIP-Export
js/audio.js       Wiedergabe mit Gitarrenklang, Metronom, Techniken
js/render.js      Griffbrett und Tabulatur als SVG
js/ui.js          Oberfläche
js/examples.js    Beispiel-Folge für den ersten Start
tests/            Prüfungen (Node, ohne Abhängigkeiten)
tools/build.js    Einzeldatei-Build
```
