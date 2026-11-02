#!/usr/bin/env python3
"""
Video para la declaración de Play «Permisos de servicio en primer plano» (docs/store/PLAY-STORE.md § 5.7).

Corre en el emulador de `android-video-ubicacion.yml`: entra al modo demo, acepta la hoja y el permiso, enseña la
notificación fija y sale del demo para que se vea que desaparece. No usa cuentas ni contraseñas.
"""
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

APP = 'com.artaproducciones.ops'
APK = sys.argv[1]
SALIDA = sys.argv[2]


def adb(*args, check=True):
    return subprocess.run(['adb', *args], check=check, capture_output=True, text=True).stdout


def shell(*args, check=True):
    return adb('shell', *args, check=check)


def pantalla():
    shell('uiautomator', 'dump', '/sdcard/ui.xml', check=False)
    return ET.fromstring(adb('exec-out', 'cat', '/sdcard/ui.xml'))


def buscar(condicion):
    for node in pantalla().iter('node'):
        if condicion(node):
            m = re.match(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', node.get('bounds', ''))
            if m:
                x1, y1, x2, y2 = map(int, m.groups())
                return (x1 + x2) // 2, (y1 + y2) // 2
    return None


def tocar(condicion, que, intentos=25):
    for _ in range(intentos):
        punto = buscar(condicion)
        if punto:
            shell('input', 'tap', str(punto[0]), str(punto[1]))
            print('tocó:', que, punto, flush=True)
            return
        time.sleep(1)
    raise SystemExit(f'No apareció: {que}')


def por_texto(texto):
    return lambda n: n.get('text', '') == texto or n.get('content-desc', '') == texto


def por_id(parte):
    return lambda n: parte in n.get('resource-id', '')


adb('install', '-r', APK)
shell('pm', 'grant', APP, 'android.permission.POST_NOTIFICATIONS')
shell('settings', 'put', 'system', 'show_touches', '1')
shell('cmd', 'notification', 'set_dnd', 'off', check=False)

grabando = subprocess.Popen(
    ['adb', 'shell', 'screenrecord', '--bit-rate', '3000000', '--time-limit', '120', '/sdcard/video.mp4']
)
time.sleep(2)
shell('am', 'start', '-n', f'{APP}/.MainActivity')
time.sleep(6)

tocar(por_texto('Explorar ARTA con datos de muestra'), 'entrar al demo', 40)
time.sleep(4)
tocar(por_texto('Aceptar'), 'aceptar la hoja de ubicación')
time.sleep(3)
tocar(por_id('permission_allow_foreground_only_button'), 'permiso «mientras se usa»')
time.sleep(5)

# La notificación fija, con la app en primer plano y ya cerrada.
shell('cmd', 'statusbar', 'expand-notifications')
time.sleep(6)
shell('cmd', 'statusbar', 'collapse')
time.sleep(1)
shell('input', 'keyevent', 'KEYCODE_HOME')
time.sleep(3)
shell('cmd', 'statusbar', 'expand-notifications')
time.sleep(6)
shell('cmd', 'statusbar', 'collapse')
time.sleep(1)

# Al salir se detiene: la notificación ya no está.
shell('am', 'start', '-n', f'{APP}/.MainActivity')
time.sleep(4)
tocar(por_texto('Salir'), 'salir del demo')
time.sleep(5)
shell('cmd', 'statusbar', 'expand-notifications')
time.sleep(6)
shell('cmd', 'statusbar', 'collapse')
time.sleep(2)

shell('pkill', '-INT', 'screenrecord', check=False)
grabando.wait(timeout=30)
time.sleep(3)
adb('pull', '/sdcard/video.mp4', SALIDA)

avisos = shell('dumpsys', 'notification', '--noredact', check=False)
print('notificación al final:', 'registra tu ubicación' in avisos)
print('listo', SALIDA, flush=True)
