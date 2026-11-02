#!/usr/bin/env python3
"""
Capturas de la entrada y la cartelera en Android, para mirarlas antes de subir a la tienda.

Corre en el emulador de `android-capturas.yml`: sin cuenta ni contraseña, abre la app, entra a la
cartelera pública (datos reales de producción) y al detalle de un show.
"""
import os
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

APP = 'com.artaproducciones.ops'
APK = sys.argv[1]
SALIDA = sys.argv[2]
os.makedirs(SALIDA, exist_ok=True)


def adb(*args, check=True):
    return subprocess.run(['adb', *args], check=check, capture_output=True, text=True).stdout


def shell(*args, check=True):
    return adb('shell', *args, check=check)


def captura(nombre):
    with open(os.path.join(SALIDA, f'{nombre}.png'), 'wb') as f:
        subprocess.run(['adb', 'exec-out', 'screencap', '-p'], check=True, stdout=f)
    print('captura:', nombre, flush=True)


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


def tocar(condicion, que, intentos=30):
    for _ in range(intentos):
        punto = buscar(condicion)
        if punto:
            shell('input', 'tap', str(punto[0]), str(punto[1]))
            print('tocó:', que, punto, flush=True)
            return
        time.sleep(1)
    captura('error-' + re.sub(r'\W+', '-', que))
    raise SystemExit(f'No apareció: {que}')


def por_texto(parte):
    return lambda n: parte in n.get('text', '') or parte in n.get('content-desc', '')


adb('install', '-r', APK)
shell('pm', 'grant', APP, 'android.permission.POST_NOTIFICATIONS')
shell('am', 'start', '-n', f'{APP}/.MainActivity')

# Puede tardar en dibujarse el primer cuadro en el emulador.
for _ in range(60):
    if buscar(por_texto('Ver la cartelera')):
        break
    time.sleep(1)
time.sleep(4)
captura('01-entrada')

tocar(por_texto('Ver la cartelera'), 'ver la cartelera')
time.sleep(10)
captura('02-cartelera')

shell('input', 'swipe', '540', '1700', '540', '500', '500')
time.sleep(4)
captura('03-cartelera-baja')

shell('input', 'swipe', '540', '500', '540', '1700', '500')
time.sleep(2)
tocar(por_texto('Soy Luna'), 'abrir un show', 15)
time.sleep(6)
captura('04-show')
print('listo', SALIDA, flush=True)
