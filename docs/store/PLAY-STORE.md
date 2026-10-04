# Google Play — ARTA (`com.artaproducciones.ops`)

Cuenta de desarrollador: **NEXARA** (la misma de `mx.nexara.mobile.nativeapp`). Mismo esquema que
`NEXARA-app/docs/PLAY-STORE-CHECKLIST.md`. Lee primero la decisión de distribución en [`README.md`](README.md).

## 1. El paquete

- Llave de subida: `apps/mobile-native/android/arta-upload.jks` + `key.properties` (fuera de git; respaldo en
  `Documents\LLAVES-ANDROID\ARTA`). **No regenerarla**: Play la registra en la primera subida.
- Compilar: `pwsh -File apps\mobile-native\android\scripts\build-play-aab.ps1` (o
  `.\gradlew.bat :app:bundleRelease "-PVERSION_CODE=N" "-PVERSION_NAME=X.Y.Z"`). Cada subida a Play necesita un
  `versionCode` mayor que el anterior.
- Paquete actual: `Documents\ARTA-builds\arta-1.0.0-1.aab` (versión 1.0.0, código 1).

## 2. Crear la app (a mano, una vez)

Play Console → **Crear app**:

| Campo | Valor |
| --- | --- |
| Nombre | **ARTA Producciones** |
| Idioma predeterminado | Español (Latinoamérica) – es-419 |
| App o juego | App |
| Gratis o pagada | Gratis |
| Declaraciones | Políticas del programa para desarrolladores y leyes de exportación de EE. UU.: aceptar |

**Firma de apps de Google Play**: aceptar la firma gestionada por Google (la llave de subida es `arta-upload.jks`).

## 3. Prueba interna (lo primero)

Prueba y lanzamiento → **Prueba interna** → Crear versión → subir el `.aab` → notas «Primera versión» →
Testers: lista de correos del equipo de ARTA (hasta 100) → copiar el enlace de suscripción y mandarlo al equipo.
La prueba interna no pasa revisión y no necesita la ficha completa; sirve como distribución privada indefinida.

## 4. Ficha de Play Store (para prueba cerrada o producción)

| Campo | Valor |
| --- | --- |
| Descripción breve (≤80) | `Tareas, chat, aprobaciones y anticipos del equipo de Arta Producciones.` |
| Ícono 512×512 | `apps/mobile-native/play-assets/icon-512.png` |
| Gráfico destacado 1024×500 | `apps/mobile-native/play-assets/feature-graphic-1024x500.png` |
| Capturas de teléfono | mínimo 2 (16:9 o 9:16), de un Android con la cuenta de revisión; pendientes |
| Categoría | Empresa |
| Correo de contacto | gerencia@nexara.com.mx |
| Sitio web | https://artaproducciones.com |
| Política de privacidad | https://artaproducciones.com/legal/privacidad |

**Descripción completa**: la misma de `IOS-APP-STORE.md` §7.

Los gráficos se regeneran con `python apps/mobile-native/play-assets/generar.py`.

## 5. Contenido de la app (declaraciones obligatorias)

### 5.1 Acceso a la app
«Toda la funcionalidad o parte de ella está restringida» → instrucciones con el usuario y la contraseña de
[`CUENTA-REVISION.md`](CUENTA-REVISION.md) (organización demo aislada, sin verificación en dos pasos).

### 5.2 Anuncios
No contiene anuncios.

### 5.3 Clasificación de contenido (IARC)
Categoría «Utilidades, productividad, comunicación u otra». Violencia, sexo, lenguaje, drogas, apuestas: **No**.
¿Los usuarios pueden interactuar o intercambiar contenido? **Sí** (chat del equipo). ¿Comparte la ubicación?
**No**. ¿Compras digitales? **No**.

### 5.4 Público objetivo
**18 años o más**. No está dirigida a niños.

### 5.5 Seguridad de los datos
¿Recopila o comparte datos? **Recopila: Sí · Comparte: No** (Firebase actúa como proveedor de servicio, no
cuenta como «compartir»). Datos cifrados en tránsito: **Sí**. Los usuarios pueden pedir la eliminación: **Sí**
(https://artaproducciones.com/legal/eliminar-cuenta).

| Tipo de dato | Recopilado | Obligatorio | Propósito |
| --- | --- | --- | --- |
| Información personal → Nombre | Sí | Obligatorio | Funcionalidad de la app, administración de la cuenta |
| Información personal → Dirección de correo | Sí | Obligatorio | Funcionalidad de la app, administración de la cuenta |
| Información personal → ID de usuario | Sí | Obligatorio | Funcionalidad de la app, administración de la cuenta |
| Mensajes → Otros mensajes en la app (chat) | Sí | Opcional | Funcionalidad de la app |
| Fotos y videos | Sí | Opcional | Funcionalidad de la app |
| Archivos de audio → Grabaciones de voz | Sí | Opcional | Funcionalidad de la app |
| Archivos y documentos | Sí | Opcional | Funcionalidad de la app |
| ID del dispositivo u otros IDs (token de notificaciones) | Sí | Obligatorio | Funcionalidad de la app |

**No** se recopila: ubicación, información financiera, salud, contactos, calendario, actividad en la app con fines
de analítica, historial web, registros de fallos ni diagnósticos.

### 5.6 Declaraciones que no aplican
Funciones financieras: «Mi app no ofrece funciones financieras» (los anticipos son control interno de gastos del
equipo, no un servicio financiero). Salud: no. App gubernamental: no. Noticias: no. Servicio en primer plano: no.
Permisos sensibles: solo `RECORD_AUDIO` (notas de voz) y `POST_NOTIFICATIONS`.

## 6. Eliminación de cuenta
URL: https://artaproducciones.com/legal/eliminar-cuenta (pública, sin iniciar sesión). En la app: Más →
«Eliminar mi cuenta».

## 7. Orden
1. Crear la app (§2) → 2. Prueba interna con el `.aab` (§3) → 3. Probar en teléfonos del equipo →
4. Si se quiere en Play visible: ficha (§4) y contenido (§5) → prueba cerrada → producción.
