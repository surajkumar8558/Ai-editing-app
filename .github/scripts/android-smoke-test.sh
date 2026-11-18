#!/usr/bin/env bash
# Installs the APK on the running emulator, launches it, and checks it is still alive.
# Prints the relevant logcat lines either way so a crash can be diagnosed from the job log.
set -u
APK="$1"
PKG=com.aieditor.benchmark

adb install -r "$APK" || { echo "SMOKE_RESULT=INSTALL_FAILED"; exit 1; }
adb logcat -c
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1
sleep 30

adb logcat -d > logcat.txt
echo "===== crash / React Native log lines ====="
grep -E "FATAL EXCEPTION|AndroidRuntime|ReactNativeJS|BENCH_|SoLoader|UnsatisfiedLink|DEBUG   :|libc    :|Abort message|ReactHost|unknown:React" logcat.txt | head -400 || true
echo "=========================================="

adb exec-out screencap -p > screen.png || true
if adb shell pidof "$PKG" > /dev/null; then
  echo "SMOKE_RESULT=APP_RUNNING"
else
  echo "SMOKE_RESULT=APP_CRASHED"
  exit 1
fi
