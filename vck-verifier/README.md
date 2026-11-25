# vck-verifier (Prototyp)

Interner OpenID4VP-Verifier auf Basis von [VC-K](https://github.com/a-sit-plus/vck). Der Node-Server nutzt ihn mit
`VERIFIER_ENGINE=vck` für Ausweisen und Anträge (nicht für den Playground). Node behält Wallet-Endpunkte, Sitzungen,
Ausstellervertrauen und Oberfläche; VC-K erzeugt die Request Objects und prüft die Antworten.

VC-K und [signum](https://github.com/a-sit-plus/signum) werden als Composite Build aus dem Quellcode gebaut. Die Klone
liegen nebeneinander neben dem Repo-Ordner (`../vck`, `../signum`); `VCK_DIR` überschreibt den Pfad.

```bash
cd vck-verifier && disableAppleTargets=true ./gradlew installDist
build/install/vck-verifier/bin/vck-verifier          # lauscht auf 127.0.0.1:3002 (VCK_VERIFIER_PORT)
VERIFIER_ENGINE=vck npm test                          # im Repo-Wurzelordner
```

Ohne Android-SDK baut VC-K nur die JVM-Artefakte, das reicht hier.
