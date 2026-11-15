# Informe de pruebas (QA) — SuperHumanos · Deep Work

Registro de las pruebas realizadas sobre la aplicación: criterios de aceptación, casos ejecutados y resultados. Los IDs de reglas (R1…R26) y casos borde (CB1…CB14) remiten a [`spec.md`](spec.md).

## 1. Estrategia

| Nivel | Herramienta | Qué cubre |
|---|---|---|
| Unitario | Vitest | Lógica pura del sorteo periodizado (`draw.js`), puntuación y rachas. |
| Integración | Vitest + Supertest, SQLite en memoria | La API completa (rutas, validación, servicios, repositorios) con una base nueva por test. El reloj del servidor es inyectable: el timer se prueba sin esperar minutos reales. |
| Manual (E2E) | Navegador, en local y en producción | Flujo completo de usuario sobre la cuenta demo. |

Cómo correr la suite automática: `cd backend && npm test`.

**Resultado de la última ejecución:** 2 archivos, **40 tests, 40 aprobados, 0 fallidos** (≈ 2 s).

## 2. Criterios de aceptación y casos automatizados

### Banco y sorteo periodizado (`tests/draw.test.js`)

| # | Criterio | Caso | Resultado |
|---|---|---|---|
| T01 | El banco tiene 22, 23, 23, 15, 18 y 15 preguntas (116) | Conteo por tema sobre el seed | ✅ |
| T02 | IDs estables, únicos y correlativos (`C01…`, `SI18`, etc.) | Verificación de formato y unicidad | ✅ |
| T03 | No queda ningún `[sesión patrón]` sin reemplazar | Búsqueda en todos los textos | ✅ |
| T04 | Toda regla es `si`, `no` o `dato` | Validación del seed | ✅ |
| T05 | Umbral = ceil(2n/3) | n = 22 → 15, n = 15 → 10, n = 3 → 2 | ✅ |
| T06 | R17: nunca repite ID en el ciclo ni el modo del cierre anterior | 60 sorteos seguidos por tema | ✅ |
| T07 | R18: reinicia el ciclo al alcanzar el umbral y conserva el último modo | 3 ciclos completos de Estrés | ✅ |
| T08 | R19: solo elige opciones que dejan una secuencia posible | Banco X,X,X,Y: siempre elige X | ✅ |
| T09 | R19: aviso explícito cuando no se pueden cumplir ambas reglas | Banco X,X con último modo X | ✅ |
| T10 | Tema sin preguntas activas no rompe el sorteo | Banco vacío | ✅ |
| T11 | Factibilidad de secuencias | `canSequence` con casos posibles e imposibles | ✅ |
| T12 | El estado al confirmar coincide con el del sorteo | `applyPick` vs. `drawForTheme` | ✅ |
| T13 | Puntuación Sí/No/N/A según la regla | Combinaciones de regla y respuesta | ✅ |
| T14 | Duración percibida: problema si la estimación ≥ la real | 90/90, 60/90 y sin dato real | ✅ |

### API (`tests/api.test.js`)

| # | Criterio | Caso | Resultado |
|---|---|---|---|
| T15 | RF1: el registro crea defaults (90/20, 3 tipos, 2 métricas) y no expone el hash | Registro + `/auth/me` | ✅ |
| T16 | Email duplicado → 409; contraseña < 8 → 400 | Dos registros iguales y uno corto | ✅ |
| T17 | Login incorrecto → 401; sin sesión → 401 | Credenciales falsas y request anónimo | ✅ |
| T18 | Aislamiento: un usuario no ve ni edita datos de otro (404) | Usuario B sobre tarea y sesión de A | ✅ |
| T19 | CB9: un tipo en uso se archiva, uno libre se borra | Borrado de ambos | ✅ |
| T20 | Nombres de tipo únicos por usuario | Crear «Deep Work» de nuevo → 409 | ✅ |
| T21 | Validación de entrada | Título vacío y duración 0 → 400 | ✅ |
| T22 | RF6 + R3: con/sin tarea en contadores; mover suma `veces_movida` | Asignar, mover, consultar semana | ✅ |
| T23 | R1, R2: no asigna tareas completadas ni a sesiones cerradas/omitidas | 409 `SESSION_LOCKED` | ✅ |
| T24 | R4: máximo 12 sesiones por día | 12 + 1 → 409 | ✅ |
| T25 | R8, R9, CB3: no pasa solo al descanso; descuenta pausas; tiempo extra | 30′ + pausa 10′ + 70′ → 100 min reales | ✅ |
| T26 | R6, CB2: una sola sesión activa | Iniciar una segunda → 409 `ACTIVE_SESSION` | ✅ |
| T27 | R5, R10: transiciones inválidas y sesiones futuras | Pausar sin iniciar, descansar sin terminar, iniciar mañana | ✅ |
| T28 | Distracciones con minuto y duración medida | Distracción al minuto 12, «Volví» 3′ después → 180 s | ✅ |
| T29 | Post-it: el ajuste pendiente se muestra una vez y queda entregado | Cierre con ajuste → post-it siguiente | ✅ |
| T30 | R11, CB5: cierre simple idempotente; métricas; tarea completada | Doble envío → un solo registro | ✅ |
| T31 | §7.2, CB6: 6 preguntas en orden C, A, E, S, SI, O; recargar no re-sortea; no se exponen modo ni regla | Dos aperturas del mismo cierre | ✅ |
| T32 | R24: confirmar una sola vez; ✓/✗/N/A; ratio fuera de rango; ajuste | Doble confirmación, ratio 1,5 | ✅ |
| T33 | R22, CB7: primera sesión del día → N/A automático en descanso previo | Solo SI15–SI18 activas | ✅ |
| T34 | §7.3: exige respuesta en cada pregunta | Confirmar sin respuestas → 400 | ✅ |
| T35 | R25, §7.6: N/A no entra al denominador; «sin datos» con denominador 0 | 3 cierres todo N/A | ✅ |
| T36 | RF10, CB13: exportar/importar estado; rechazo de formato inválido | Export de A → import en B | ✅ |
| T37 | R15: un día sin sesiones agendadas no corta la racha diaria | Lun, Mar, (Mié libre), Jue | ✅ |
| T38 | R16: racha semanal según el objetivo | 2 semanas con 3 sesiones, objetivo 3 | ✅ |
| T39 | R14: valor de la hora y costo de distracciones | 60 min a 60/h, 1 medida de 2′ + 1 sin medir × 5′ | ✅ |
| T40 | RF9, CB14: mapa de 365 días; calibrador sin datos | Usuario nuevo | ✅ |

## 3. Pruebas manuales (E2E en navegador)

Ejecutadas el 2026-11-14 en local (Chrome, 1440 × 900 y 800 px de ancho) sobre la cuenta demo.

| # | Paso | Esperado | Resultado |
|---|---|---|---|
| M01 | Abrir el login | Marca SuperHumanos, formulario, botón de demo | ✅ |
| M02 | «Probar con la cuenta demo» | Entra a la semana actual | ✅ |
| M03 | Ver la semana | 7 columnas, contadores agendadas / con tarea / sin tarea / cerradas, «hoy» resaltado | ✅ |
| M04 | Semana siguiente | Sesiones con tarea (tarjeta llena) y sin tarea (punteado), claramente distintas | ✅ |
| M05 | Abrir una sesión | Título «Vamos a trabajar en…», ritual, post-it, objetivos y timer 1:30:00 | ✅ |
| M06 | Tildar un paso del ritual | Queda tachado y el contador sube (1/6) | ✅ |
| M07 | Escribir post-it de 80 min | El calibrador proyecta el tiempo real (≈ 87 min con ratio 1,09) | ✅ |
| M08 | Empezar | Cuenta regresiva y el título de la pestaña muestra el tiempo | ✅ |
| M09 | Tecla `D` | Se registra una distracción con su minuto | ✅ |
| M10 | Terminar trabajo (modo periodizado) | Aparece «Cierre N» con 6 preguntas; el reloj de trabajo se oculta | ✅ |
| M11 | Responder y confirmar | Una línea por tema con ✓ / ✗ / N/A y el ratio real/estimado | ✅ |
| M12 | Ir a Datos | Rachas, mapa de 12 meses, constancia mensual, resumen semanal, calibrador y resumen periodizado | ✅ |

### Defectos encontrados y corregidos durante el QA

| # | Defecto | Corrección |
|---|---|---|
| D1 | El campo de minutos ocupaba todo el ancho y el selector de tipo quedaba aplastado | Ajuste de especificidad CSS |
| D2 | Las etiquetas de meses del mapa no coincidían con sus columnas | Ancho de columna igual al de las celdas |
| D3 | Al cerrar, el timer mostraba lo que *faltaba* en vez de lo *trabajado* | Con el trabajo terminado se muestra el tiempo trabajado |
| D4 | El reloj de trabajo seguía visible en el cierre periodizado y sesgaba la estimación a ciegas | Se oculta hasta confirmar el cierre |
| D5 | Los botones Sí/No se estiraban a todo el ancho | `align-self: flex-start` |

## 4. Pruebas en producción

Ejecutadas el 2026-11-15 contra https://deepwork.gaellapeyre.com (frontend) y https://deepwork-api.gaellapeyre.com (API).

| # | Prueba | Resultado |
|---|---|---|
| P01 | `GET /api/health` | ✅ `{"ok":true}` |
| P02 | Login demo desde el origen del frontend: CORS con credenciales y cookie `HttpOnly; Secure; SameSite=Lax; Domain=.gaellapeyre.com` | ✅ |
| P03 | Frontend: `/`, rutas de la SPA (`/datos`), JS y fuentes | ✅ 200 en todas |
| P04 | «Probar con la cuenta demo» en el navegador → semana con datos | ✅ |
| P05 | Registro de un usuario nuevo y alta de una tarea; persiste al volver a consultarla | ✅ |
| P06 | Aislamiento: editar una tarea de otro usuario | ✅ 404 |
| P07 | Responsive: planificador en pantalla angosta (menú hamburguesa, contadores 2×2) | ✅ |
| P08 | Migración a MySQL de Hostinger: la API arranca con `DB: mysql`, crea las tablas y el usuario demo; login, semana, rachas, resumen semanal, mapa, calibrador, ciclo completo de sesión, cierre simple, cierre periodizado (6 temas) y exportación de estado | ✅ mismos resultados que con SQLite |

### Incidentes de despliegue resueltos

| # | Incidente | Causa | Solución |
|---|---|---|---|
| I1 | El build de Hostinger fallaba con `npm run build:web` | Hostinger ejecuta cualquier script `build:*` del `package.json` | El paquete de despliegue define un `build:web` que no hace nada |
| I2 | 503 al arrancar | El servidor Node de Hostinger (LiteSpeed) carga la app con `require()`, incompatible con el `await` de nivel superior | `server.js` arranca dentro de una función `async main()` |
