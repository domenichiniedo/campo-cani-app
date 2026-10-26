#!/usr/bin/env bash
# Costruisce l'app Android come la vuole Google Play, per la demo (android-demo.yml) e per l'app collegata al
# database (android.yml). Si lancia dalla cartella mobile-demo dopo "npx cap add android".
#
# Esce:
#   - $APK: l'APK da installare senza Play Store, firmato sempre con demo-debug.keystore, così ogni versione
#     nuova si installa sopra quella vecchia;
#   - $AAB: l'Android App Bundle da caricare su Google Play. Con i secrets della chiave di caricamento
#     (ANDROID_UPLOAD_KEYSTORE_BASE64 e gli altri, vedi README "Google Play") è firmato con quella; senza,
#     è firmato con la chiave della demo e serve solo a controllare che la build sia giusta.
#
# Controlla i requisiti di Google Play: Android 16 (API 36), build di rilascio (non di debug), pagine di
# memoria da 16 KB, versione che cresce sempre. Se uno manca, la build si ferma.
set -euo pipefail
cd "$(dirname "$0")"

: "${APK:?manca APK}" "${AAB:?manca AAB}"

# Google Play: dal 31 agosto 2026 le app nuove e gli aggiornamenti devono puntare ad Android 16 (API 36).
grep -q 'targetSdkVersion = 36' android/variables.gradle || { echo "::error::Il progetto Android non punta ad Android 16 (API 36)"; cat android/variables.gradle; exit 1; }

# Icona dell'app: quella di K9 Manager al posto di quella di Capacitor (con ICONA un'altra, da mobile-demo: il
# pannello del gestore ha la sua).
ICONA_PNG=$(realpath "${ICONA:-../assets/images/icon.png}")
(
  cd android/app/src/main/res
  rm -rf mipmap-anydpi-v26
  for d in mipmap-*; do
    cp "$ICONA_PNG" "$d/ic_launcher.png"
    cp "$ICONA_PNG" "$d/ic_launcher_round.png"
    rm -f "$d/ic_launcher_foreground.png"
  done
)
npx cap sync android

# I link di invito dei centri (campocaniapp://attiva?codice=..., anche dal QR code) aprono l'app vera; la demo e il
# pannello del gestore (EXPO_PUBLIC_PANNELLO=1) no.
if [ ! -f www/demo-backend.js ] && [ "${EXPO_PUBLIC_PANNELLO:-}" != 1 ]; then
  python3 - android/app/src/main/AndroidManifest.xml <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
filtro = '''            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="campocaniapp" android:host="attiva" />
            </intent-filter>

        </activity>'''
assert s.count('</activity>') == 1
open(p, 'w').write(s.replace('        </activity>', filtro))
PY
  grep -q 'android:scheme="campocaniapp"' android/app/src/main/AndroidManifest.xml
fi

# Versione: il nome è quello di app.json (1.0.0), il numero sono i minuti dal 1970, che crescono sempre
# chiunque lanci la build (Google Play rifiuta un numero già usato, il telefono uno più basso).
VERSION=$(node -p "require('../app.json').expo.version")
CODE=$(( $(date +%s) / 60 ))
sed -i "s/versionCode [0-9]*/versionCode $CODE/; s/versionName \"[^\"]*\"/versionName \"$VERSION\"/" android/app/build.gradle
cat >> android/app/build.gradle <<'GRADLE'

// Firma della build di rilascio. "sideload": la chiave della demo, la stessa di sempre, per l'APK da installare a
// mano. "play": la chiave di caricamento di Google Play, solo con -Pplay e i secrets impostati.
android.signingConfigs {
    sideload {
        storeFile = rootProject.file('../demo-debug.keystore')
        storePassword = 'android'
        keyAlias = 'androiddebugkey'
        keyPassword = 'android'
    }
    if (System.getenv('UPLOAD_KEYSTORE')) {
        play {
            storeFile = file(System.getenv('UPLOAD_KEYSTORE'))
            storePassword = System.getenv('UPLOAD_STORE_PASSWORD')
            keyAlias = System.getenv('UPLOAD_KEY_ALIAS')
            keyPassword = System.getenv('UPLOAD_KEY_PASSWORD')
        }
    }
}
android.buildTypes.release.signingConfig = project.hasProperty('play') && System.getenv('UPLOAD_KEYSTORE') ? android.signingConfigs.play : android.signingConfigs.sideload
GRADLE
grep -n 'versionCode\|versionName' android/app/build.gradle

(cd android && ./gradlew --no-daemon assembleRelease)
cp android/app/build/outputs/apk/release/app-release.apk "$APK"
if [ -n "${UPLOAD_KEYSTORE:-}" ]; then
  (cd android && ./gradlew --no-daemon bundleRelease -Pplay)
else
  echo "::warning::Mancano i secrets della chiave di caricamento di Google Play: l'AAB è firmato con la chiave della demo e non va caricato."
  (cd android && ./gradlew --no-daemon bundleRelease)
fi
cp android/app/build/outputs/bundle/release/app-release.aab "$AAB"

# Controlli sull'APK, uguali a quelli di Google Play.
BT=$(ls -d "$ANDROID_HOME"/build-tools/*/ | sort -V | tail -1)
"$BT"aapt2 dump badging "$APK" > badging.txt
grep -E "^package:|^sdkVersion|^targetSdkVersion|^uses-permission" badging.txt
grep -q "^targetSdkVersion:'36'" badging.txt || { echo "::error::L'APK non punta ad Android 16 (API 36)"; exit 1; }
if grep -q "application-debuggable" badging.txt; then echo "::error::L'APK è una build di debug"; exit 1; fi
# Dal 1° novembre 2025 Google Play vuole le librerie native allineate alle pagine da 16 KB.
"$BT"zipalign -c -P 16 4 "$APK" || { echo "::error::L'APK non è allineato alle pagine da 16 KB"; exit 1; }
# La firma dell'APK deve essere sempre quella della demo, o il telefono non installa la versione nuova sopra la vecchia.
WANT=$(keytool -list -v -keystore demo-debug.keystore -storepass android | grep 'SHA256:' | head -1 | sed 's/.*SHA256: //; s/://g' | tr A-F a-f)
GOT=$("$BT"apksigner verify --print-certs "$APK" | grep 'SHA-256 digest' | head -1 | sed 's/.*: //')
echo "firma attesa $WANT"; echo "firma trovata $GOT"
test "$WANT" = "$GOT"
echo "Pronti: $APK e $AAB (versione $VERSION, numero $CODE)"
