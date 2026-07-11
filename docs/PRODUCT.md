# Vision producto ARTA

## Dos entidades
- **ARTA** — productora de eventos
- **EXPLANADA** — Auditorio Arema (renta a boleteras)

Tras login, el usuario elige / solo ve las entidades a las que tiene acceso.

## Roles (lista de usuarios)
| Persona | Rol | Entidades |
|---------|-----|-----------|
| Arturo Taja | dir_general | ambas · TODO · usuarios |
| José Luis Arista (Chacho) | dir_general | ambas · TODO · usuarios |
| Melissa Astudillo | gerente_arta | ARTA todo · corrida · campaña · autoriza OC Arta |
| Rodrigo López | dir_auditorio | EXPLANADA todo · en ARTA solo carpetas (sin event ops) · autoriza OC Auditorio |
| Williams Taja | logistica | generales ambos · edita campaña |
| Leida Osorio | convenios | generales ambos |
| Juan Pablo Ramírez | enlace_gobierno | generales · puede marcar OC pagado |

## Flujo evento
1. Crear evento (Arta o Auditorio)
2. Se auto-instancian plantillas: general, producción, hospedaje, transporte, RP, artes, boletera, pendones, OC, catering, corrida, campaña, anticipos (+ mantenimiento en Explanada)
3. Dentro del concierto: campaña, corrida financiera, OC por rubro, checklists, archivos Excel/PDF
4. OC: pendiente → autorizada → pagada
5. Corrida/cierre: solo Melissa, Chacho, Arturo
6. Usuarios: solo Chacho y Arturo

## Studio
Panel tipo Nexara Studio: editar carrusel, noticias y secciones del **sitio público de Arta** (dominio principal).
No hay sitio web del Auditorio: Explanada solo opera en el panel interno (switch de entidad).

## Carpetas generales
Documentos compartidos por entidad (no ligados a un evento), con roles que tienen `folders.edit`.

## Portal vendor
Desde el evento se genera un PIN + link `/v/{id}` para que un proveedor externo vea archivos/PDFs del show.
