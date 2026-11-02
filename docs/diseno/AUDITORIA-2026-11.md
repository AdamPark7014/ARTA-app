# Auditoría de diseño del sistema (02-11-2026)

Hecha con las skills de diseño de Claude (`design-critique`, `accessibility-review`, `design-system`), después del rediseño de 360 grados. Se midió en producción y con las capturas del panel y las apps. No se probó con VoiceOver ni NVDA.

## Crítica

**Lo que funciona:**
- La portada dice en dos segundos qué es Arta, y lo primero que se ve son sus shows.
- Los pósters y las fotos son de verdad, y el contenido manda sobre el adorno.
- Sitio, panel y apps ya hablan igual: misma letra, mismos pesos, etiquetas en frase.

| Hallazgo | Severidad | Estado |
|---|---|---|
| En el teléfono, botones de 40 px, flechas de 24 a 26 px y ligas del pie de 23 px | Alta | Corregido: 44 px |
| Las fotos de la trayectoria corrían sin forma de pausarlas con teclado o dedo | Alta | Corregido: botón de pausa |
| Los reflectores de la invitación se movían sin fin, sin aportar nada | Media | Corregido: quietos |
| El lector de pantalla leía dos veces cada nombre de la trayectoria | Media | Corregido |
| «Traer un show a Puebla» limita a una empresa con shows en todo el país | Baja | Corregido: «Producir un show con Arta» |
| La portada baja 2.5 MB en teléfono y 4.5 MB en escritorio | Media | Pendiente: variantes chicas de pósters y fotos |
| Los títulos largos ocupan dos renglones y se cortan en el celular del panel | Baja | Se queda: tienen su texto completo en `title` |

## Accesibilidad (WCAG 2.1 AA)

| Criterio | Resultado |
|---|---|
| 1.1.1 Texto alternativo | Pasa: ninguna imagen sin `alt` |
| 1.3.1 Estructura | Pasa: un solo `h1` y títulos en orden |
| 1.4.3 Contraste | Pasa en lo medido: texto secundario 6.9:1 sobre papel; la auditoría del panel da 0 fallas |
| 2.1.1 Teclado | Pasa en pruebas automáticas; hay liga para saltar al contenido |
| 2.2.2 Pausar lo que se mueve | Pasa desde esta revisión |
| 2.4.7 Foco visible | Pasa: regla general `:focus-visible` |
| 2.5.5 Zona de toque de 44 px | Pasa en botones, flechas y pie desde esta revisión; las migas quedan más chicas |
| 3.3.2 Etiquetas de formulario | Pasa |

**Falta:** probar con un lector de pantalla de verdad y con zoom al 200 %.

## Sistema de diseño

| Hoja | Colores fijos (hex + rgba) | Tamaños de letra distintos | `!important` |
|---|---|---|---|
| `globals.scss` | 257 | 42 | 146 |
| `sitio.scss` | 62 | 25 | 5 |
| `_premium.scss` | 37 | 42 | 2 |
| `_chat.scss` | 14 | 30 | 17 |
| `_acabado.scss` | 14 | 22 | 8 |
| `_noche.scss` | 10 | 2 | 0 |

Los componentes (`components/app-shell`, `components/ui`) no tienen colores fijos: la deuda está en las hojas. Los colores fijos incluyen el portal de proveedores y las hojas que se imprimen, que van aparte a propósito.

**Lo que más rinde, en orden:**
1. **Una escala de letra.** Hay 18 tamaños en píxeles solo en el sitio y más de 40 en el panel. Bastan 7 u 8, como tokens.
2. **Juntar capas.** `_refine`, `_pulido`, `_acabado`, `_premium` y `_noche` se pisan entre sí. Fundirlas en `globals.scss` por módulo, una por una y con la auditoría de cortes como red.
3. **Quitar `!important`.** Los 146 de `globals.scss` existen porque se pelean las capas: caen solos con el punto 2.
4. **Tokens de noche.** Los `rgba(247, 246, 243, …)` del menú y del sitio merecen nombre.

No se hizo ahora: toca cada pantalla y no cambia nada que se vea.
