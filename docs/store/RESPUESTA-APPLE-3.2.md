# Respuesta a App Review — Guideline 3.2 (Business), 12-10-2026

Apple rechazó la **1.0.0 (11)** (envío `c1da1a8a-b1a8-4ed7-878a-fe4cb98c8385`, revisado en iPad Air 11" M3) con
**3.2 Business – Other Business Model Issues**: «la app está pensada para una empresa u organización concreta
(socios, clientes o empleados) pero se eligió distribución pública». Pide elegir otra vía de distribución o, si
creemos que es para el público general, contestar cinco preguntas:

1. ¿Está restringida a una sola empresa u organización (incluidos socios, empleados y contratistas)?
2. ¿Está diseñada para un grupo limitado de empresas? ¿Cuáles? Si no, ¿cualquier empresa puede ser cliente?
3. ¿Qué funciones son para el público general (descubrir, descargar y usar sin invitación ni afiliación)?
4. ¿Cómo obtienen cuenta los usuarios?
5. ¿Hay contenido de pago y quién lo paga?

Esto es exactamente lo que avisaba `README.md` («Decisión pendiente de Adam: cómo se distribuye»). NEXARA pasó 3.2
porque es multiempresa con vía pública de contratación; ARTA no puede decir eso con la verdad: la ficha dice «app
de trabajo del equipo de Arta Producciones», las cuentas las da de alta el administrador de Arta y las dos entidades
(Arta Producciones y Auditorio Explanada) son negocios de la misma organización.

## Recomendación: distribución **sin listar** (Unlisted App Distribution)

Es la vía que Apple señala en el propio rechazo. La app pasa la misma revisión (2.1, 1.2, 5.1.1…) pero **3.2 deja de
aplicar**; no aparece en búsquedas ni en la ficha pública y se instala con un enlace permanente de App Store que se
reparte al equipo. No hace falta Apple Business Manager ni D-U-N-S de Arta. Android no cambia (ya está publicada en
Play; puede seguir pública o pasarse a prueba cerrada después).

Pasos (en este orden; los hace Adam con su cuenta, el formulario pide sesión de titular/Admin):

1. **Pedir la distribución sin listar**: https://developer.apple.com/contact/request/unlisted-app/ con estos datos:
   - App name: `ARTA Producciones` · Apple ID de la app: `6819117925` · Bundle ID: `com.artaproducciones.ops`
   - Platform: iOS · ¿Ya enviada a revisión? Sí (1.0.0 (11), rechazada 3.2 el 12-10-2026)
   - Audiencia / motivo (campo de texto, en inglés, abajo).
2. **Contestar en el Resolution Center** (texto A, abajo) diciendo que se solicitó la distribución sin listar y
   contestando las cinco preguntas con la verdad.
3. No tocar el build ni las capturas. Si Apple responde que la solicitud fue aprobada, el envío sigue solo; si pide
   reenviar, «Actualizar revisión» → «Volver a enviar a revisión de apps».
4. Cuando quede aprobada, el enlace de instalación sale en App Store Connect → Información de la app → «Distribución
   sin listar»; guardarlo en `docs/store/README.md` y en el panel de ARTA (Más › Ayuda).

Texto para el formulario (campo «Why do you want to distribute this app unlisted?»):

```
ARTA Producciones is the internal operations app of Arta Producciones S.A. de C.V., a live-event production
company in Puebla, Mexico, and of the venue it operates (Auditorio Explanada Puebla). It is used only by the staff,
contractors and vendors that the company's administrators invite: there is no public sign-up, no paid content and
nothing for the general public to do in the app. Our App Store submission 1.0.0 (11) was rejected under
Guideline 3.2 on October 12, 2026 with the recommendation to use another distribution option. Unlisted
distribution is the right fit: the company wants its team to install the app from a link it shares internally,
without the app appearing in App Store search or charts. NEXARA (NEW ENGINEERING EXPERTISE AND RESOURCE
ADVANCEMENT S.A. DE C.V.) develops and publishes the app under a written authorization from Arta Producciones.
```

### Texto A — respuesta en el Resolution Center (vía sin listar)

```
Hello,

Thank you for the review. We agree with your assessment: ARTA Producciones is a workplace app for a specific
organization, and public distribution is not the right fit. We have submitted a request for Unlisted App
Distribution for this app (Apple ID 6819117925) through the Apple Developer "Request unlisted app distribution"
form, and we ask that this submission be evaluated for unlisted distribution.

For completeness, here are the answers to your questions:

1. Yes. The app is restricted to the people of one organization: the staff, contractors and vendors of Arta
Producciones S.A. de C.V. (Puebla, Mexico) and of the venue it operates, Auditorio Explanada Puebla. They belong to
the same organization and share the same administrators.
2. It is designed for that organization only. No other company uses it, and companies cannot sign up for it; the
product for other companies is a different app (NEXARA, Apple ID 6814597698), not this one.
3. None. There is no feature for the general public: no sign-up, no public content, no browsing without an
account. The sign-in screen only links to the privacy policy, terms and support pages.
4. Accounts are created by the organization's administrators in the ARTA web panel; the person receives their
credentials from the administrator. There is no self-registration in the app or on the web.
5. No. There is no paid content, no in-app purchase and no subscription. The organization pays NEXARA for the
service under a commercial agreement; users pay nothing.

The demo account in App Review Information (an isolated demo organization with fictional data) remains valid for
the review. The build, screenshots and metadata are unchanged.

Best regards,
NEXARA team, on behalf of Arta Producciones
```

### Texto B — solo si Adam insiste en distribución pública (riesgo alto de nuevo rechazo)

Para sostenerlo habría que cambiar el producto, no solo el texto: ficha y descripción como plataforma para
«productoras de eventos» con vía pública de contratación, página de contratación en artaproducciones.com o en
nexara.com.mx, modo demo sin cuenta en Release (hoy solo existe en Debug para capturas) y quitar «el equipo de Arta
Producciones» de la descripción y de `LoginView`/`MoreView`. Aun así Apple puede mantener 3.2 porque la marca, el
dominio y el API son de una sola empresa. Si se elige esta vía, la respuesta diría:

```
1. No. The app is not restricted to one organization: it is a workspace platform for live-event production
companies and venues. Each customer organization gets its own isolated workspace, and today two businesses use it
(Arta Producciones and Auditorio Explanada Puebla).
2. Any live-event production company or venue can become a customer; they request a workspace at
https://artaproducciones.com/legal/soporte or https://nexara.com.mx/contacto.
3. Anyone can explore the app without an account through the demo mode on the sign-in screen (fictional data).
4. The administrator of each customer organization creates the accounts for its team.
5. No paid content in the app; organizations pay for the service outside the app.
```

Nada de eso es cierto hoy (el demo no va en Release, no hay página de contratación), así que **no enviar el texto B
sin hacer antes esos cambios**.

## Otros pendientes vistos el 19-10 en App Store Connect

- **El adjunto de App Review está vacío**: las notas dicen que el video `ARTA-app-review-1.0.0-build11.mp4` va
  adjunto, pero `appStoreReviewAttachments` no tiene nada. Volver a subirlo en Información de revisión → Archivo
  adjunto antes de cualquier reenvío (lo pidieron en 2.1 el 06-10 y lo volverán a pedir).
- Las 7 capturas de iPhone 6,9" son del simulador de iOS (9:41, iconos de iOS): correctas. El juego de iPad no
  existe (bien). Sin vistas previas (bien).
- La lista de verificación común está en
  `NEXARA-app/docs/store/IOS-RESPUESTA-APPLE.md` («Lista de verificación antes de CADA envío»).
