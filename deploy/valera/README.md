# Valera 5.9.1 mit QTSP-Fix (Debug-Build)

Valera 5.9.1 bricht beim Signieren mit dem QTSP auf `apps.egiz.gv.at/qtsp` ab:

```
redirect_uri of the verifier is not an absolute https URI: asitplus-wallet://wallet.a-sit.plus/app/callback/signing?code=…
```

Der QTSP schickt nach der Authentisierung (OpenID4VP, `direct_post`) den App-Callback der Wallet als `redirect_uri`
zurück. VC-K lässt dort nur `https`-URIs zu (`OpenId4VpProtocolClient.requireHttpsUri`). Der Patch
[vck-9.0.0-RC2-qtsp-callback.patch](vck-9.0.0-RC2-qtsp-callback.patch) erlaubt zusätzlich genau den eigenen
Callback `asitplus-wallet://wallet.a-sit.plus/app/callback/`; alle anderen Ziele müssen weiter `https` sein.

**Verwendete Lösung (ohne Wallet-Änderung):** Der Frontend-Proxy schreibt die QTSP-Antwort auf eine `https`-Brücke
des PoC um, die per 302 in die App zurückleitet – siehe [../apache-qtsp-callback.conf](../apache-qtsp-callback.conf).

**Achtung:** Ein selbst gebautes Valera bekommt vom A-SIT-Wallet-Provider keine Attestation (fremder
Signaturschlüssel), und `wallet-issuer.a-sit.plus` stellt ohne Attestation keine PID aus
(`invalid_client: client attestation header missing`). Der folgende Patch-Build taugt daher nur, wenn A-SIT ihn mit
dem offiziellen Schlüssel signiert.

## Bauen

Voraussetzungen: JDK 21, Android SDK (Platform 36, Build-Tools), etwa 10 Minuten für den ersten Build.

```bash
mkdir valera-build && cd valera-build
git clone --depth 1 --branch 5.9.1 https://github.com/a-sit-plus/valera.git valera
git clone --depth 1 --branch 9.0.0-RC2 https://github.com/a-sit-plus/vck.git vck   # wird als Composite Build eingebunden
git -C vck apply /pfad/zu/deploy/valera/vck-9.0.0-RC2-qtsp-callback.patch
cd valera
# eigener Signaturschlüssel (siehe DEVELOPMENT.md von Valera)
openssl req -x509 -newkey rsa:4096 -keyout k.key -out c.crt -days 365 -nodes -subj "/CN=Valera Debug"
openssl pkcs12 -export -out androidApp/keystore.p12 -inkey k.key -in c.crt -name key0   # Passwort merken
printf "sdk.dir=<android-sdk>\nandroid.cert.password=<passwort>\ndisableAppleTargets=true\n" > local.properties
./gradlew :androidApp:assembleDebug
```

APK: `androidApp/build/outputs/apk/debug/androidApp-debug.apk`. Wegen des anderen Signaturschlüssels muss eine
vorhandene Valera-Installation vorher deinstalliert werden (`adb uninstall at.asitplus.wallet.app.android`);
PID und mDL danach neu ausstellen.
