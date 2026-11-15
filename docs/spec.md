# Spec — SuperHumanos · Deep Work

> Documento de especificación funcional. Define requerimientos, entidades, reglas de negocio y casos borde **antes** del código. Si el código y este documento difieren, se corrige uno de los dos: no conviven contradicciones.

## 1. Problema y propuesta

Un emprendedor que trabaja por bloques de foco (Deep Work, en adelante DW) no tiene un lugar donde **planificar** sus sesiones de la semana, **ejecutarlas** con un timer que respete su criterio (a veces extiende, a veces corta), **cerrarlas** con feedback estructurado y **ver datos** de su constancia en el tiempo.

SuperHumanos · Deep Work es una aplicación web full stack que cubre ese ciclo completo:

```
Tareas ──arrastrar──▶ Sesiones de la semana ──▶ Ritual + post-it ──▶ Timer ──▶ Cierre ──▶ Datos
```

Usuario objetivo: emprendedor con negocio en marcha, que valora su hora en dinero y quiere medir su rendimiento como un atleta mide su entrenamiento.

## 2. Arquitectura

| Capa | Tecnología | Por qué |
|---|---|---|
| Frontend | React 18 + Vite (SPA estática) | Interfaz con mucho estado (timer, drag & drop, planner). Compila a archivos estáticos que se sirven desde cualquier hosting. |
| Backend | Node.js 22 + Express, API REST por capas | `routes → controllers → services → repositories`. La lógica de negocio vive en `services` y no conoce HTTP ni SQL. |
| Validación | zod | Esquemas declarativos en el borde de la API. |
| Persistencia | MySQL (producción, Hostinger) / SQLite (desarrollo y tests) vía Knex | Mismas migraciones para los dos motores. Toda aritmética de fechas se hace en JS, nunca en SQL, para que el comportamiento no dependa del motor. |
| Auth | Contraseñas con bcrypt, sesión con JWT en cookie `httpOnly` | El front y el back comparten dominio registrable (`*.gaellapeyre.com`), así que la cookie es *same-site* y no hace falta guardar tokens en `localStorage`. |
| Tests | Vitest + Supertest | Unitarios de servicios y de integración de la API contra SQLite en memoria. |

Despliegue: frontend estático y backend Node en Hostinger, base MySQL en Hostinger. Configuración solo por variables de entorno (`.env`, ignorado por git; `.env.example` versionado).

## 3. Glosario

- **Sesión de DW:** un bloque planificado en un día. Puede tener o no una tarea asignada.
- **Sesión agendada sin tarea:** existe en el calendario, pero no se sabe en qué se va a trabajar. Se muestra distinta (contorno punteado) y se cuenta aparte.
- **Tarea:** unidad de trabajo del backlog. Se asigna arrastrándola a una sesión.
- **Tipo de tarea:** categoría editable. Por defecto: *Deep Work*, *Shallow Work*, *Creative Work*.
- **Plantilla de sesión:** preset de duración de trabajo/descanso, tipo y checklist del ritual previo.
- **Post-it:** objetivo principal de la sesión + minutos estimados, escrito antes de empezar.
- **Cierre:** feedback al terminar la sesión. Modo simple (métricas) o modo periodizado (banco de preguntas).
- **Ajuste pendiente:** lo que el último cierre dejó escrito para el próximo post-it.

## 4. Requerimientos funcionales

### RF1 · Cuentas
- Registro con nombre, email y contraseña (mínimo 8 caracteres). Email único.
- Login / logout. Usuario demo precargado con datos de ejemplo (credenciales en el README).
- Al registrarse se crean: los 3 tipos por defecto, una plantilla "Deep Work 90/20" con un ritual de ejemplo, las métricas por defecto y el banco de preguntas activo.

### RF2 · Configuración
- Duración por defecto de trabajo y descanso: **90 y 20 minutos**, editables.
- **Valor de la hora** (monto + moneda). Se usa en el resumen semanal.
- **Minutos perdidos por distracción** sin duración medida (default 5, editable): estimación declarada, no dato científico.
- Objetivo semanal de sesiones (default 5) para la racha semanal.
- Modo de cierre: `simple` (default) o `periodizado` (avanzado).
- Métricas del cierre simple: por defecto **Distracciones** (número, se precarga con los toques del botón de distracción) y **Energía** (escala 1–10). Se pueden agregar, renombrar, desactivar y reordenar. Tipos: escala 1–10, sí/no, número, texto.

### RF3 · Tipos de tarea
- CRUD. Nombre único por usuario, color.
- No se puede borrar un tipo en uso: se archiva (deja de ofrecerse, los datos históricos lo conservan).

### RF4 · Tareas
- CRUD: título, notas, tipo, minutos estimados (opcional), estado (`pendiente`, `completada`, `archivada`).
- Una tarea puede asignarse a varias sesiones (tareas grandes).
- Se registra cuántas veces se movió de una sesión a otra (`veces_movida`).

### RF5 · Plantillas de sesión
- CRUD: nombre, minutos de trabajo, minutos de descanso, tipo por defecto, checklist del ritual previo (lista ordenada de ítems).
- Una sesión copia la checklist de su plantilla al crearse (snapshot): editar la plantilla no altera sesiones ya creadas.

### RF6 · Planificador semanal
- Vista semana (lunes a domingo, hora local del usuario), navegable entre semanas.
- Por día: agregar N sesiones (elige plantilla), quitarlas, reordenarlas.
- Panel de tareas pendientes a la izquierda; **arrastrar una tarea sobre una sesión la asigna**. Arrastrar de una sesión a otra la mueve. Se puede quitar la tarea de una sesión.
- Diferencia visual explícita:
  - **Agendada sin tarea:** contorno punteado, texto "Sin tarea asignada".
  - **Con tarea:** tarjeta llena con el título y el color del tipo.
  - **Cerrada:** marca de completada y minutos reales.
- Contadores de la semana: sesiones agendadas, con tarea, sin tarea, cerradas.

### RF7 · Ejecución de una sesión ("vamos a trabajar en X")
1. **Ritual previo:** checklist de la plantilla, tildable.
2. **Post-it:** objetivo principal + minutos estimados. Si el último cierre dejó un ajuste pendiente, se muestra en una línea y queda marcado como entregado al guardar el post-it. El post-it es opcional.
3. **Calibrador:** junto a la estimación se muestra el ratio histórico real/estimado del tipo de tarea (si hay ≥ 3 sesiones con datos).
4. **Objetivos clave:** lista adicional de objetivos de la sesión, cada uno tildable al cerrar.
5. **Timer de trabajo:** iniciar, pausar, reanudar, terminar. Al llegar al tiempo planificado **no pasa solo al descanso**: avisa (sonido + notificación del navegador si se dio permiso) y sigue contando en "tiempo extra" hasta que el usuario toca *Terminar trabajo*.
6. **Botón de distracción:** un toque registra una distracción con su minuto. Opcionalmente, nota ("qué fue") y "Volví", que mide su duración.
7. **Descanso:** se inicia solo cuando el usuario lo pide. Tampoco termina solo: avisa y sigue contando.
8. **Cierre** (RF8).

### RF8 · Cierre de sesión
Común a ambos modos:
- ¿Se completó la sesión? (sí/no) — y por separado — ¿se completó la tarea? (sí/no/parcial). Pueden no coincidir.
- Objetivos clave: cuáles se lograron.
- Resumen en texto libre.
- Tiempo real vs. esperado: lo calcula el sistema con el timer (minutos de trabajo efectivos = fin − inicio − pausas).

**Modo simple:** valores de las métricas activas.

**Modo periodizado:** ver sección 7.

### RF9 · Datos
- **Mapa de constancia** estilo GitHub: últimos 12 meses, un cuadrado por día, intensidad según minutos de DW cerrados.
- **Rachas:** diaria y semanal (reglas en 6.4).
- **Resumen semanal:** horas reales vs. planificadas, sesiones cerradas/agendadas, tareas completadas, ratio real/estimado, distracciones (total y por hora), energía promedio, desglose por tipo, **valor de la hora invertida** y **costo estimado de las distracciones**.
- **Calibrador:** ratio real/estimado por tipo, con cantidad de datos.
- Modo periodizado: resumen por tema y candidatas a graduación (sección 7.6).

### RF10 · Estado exportable
- Exportar un bloque JSON con todo lo necesario para retomar el cierre periodizado (preguntas activas, IDs usados y último modo por tema, conteos por pregunta, cierres totales, fecha del último cierre, ajuste pendiente y ajustes) e importarlo en otra cuenta o la misma.

## 5. Entidades

| Entidad | Campos principales |
|---|---|
| `users` | id, nombre, email (único), password_hash, timezone, work_min, break_min, valor_hora, moneda, min_por_distraccion, objetivo_semanal, modo_cierre, ajuste_pendiente, ajuste_entregado, created_at |
| `task_types` | id, user_id, nombre, color, archivado |
| `tasks` | id, user_id, type_id, titulo, notas, estimado_min, estado, veces_movida, completada_at |
| `templates` | id, user_id, nombre, work_min, break_min, type_id, archivada |
| `template_items` | id, template_id, texto, posicion |
| `dw_sessions` | id, user_id, fecha (local, `YYYY-MM-DD`), posicion, template_id, task_id (nullable), work_min_plan, break_min_plan, estado, postit_objetivo, postit_estimado_min, started_at, work_ended_at, paused_ms, pause_started_at, break_started_at, break_ended_at, sesion_completada, tarea_completada, resumen, real_min, closed_at |
| `session_checklist` | id, session_id, texto, hecho, posicion |
| `session_objectives` | id, session_id, texto, logrado |
| `distractions` | id, session_id, at, minuto, nota, duracion_s |
| `metrics` | id, user_id, nombre, tipo, activa, posicion, clave (`distracciones`/`energia`/null) |
| `metric_values` | id, session_id, metric_id, valor |
| `bank_questions` | id (texto: `C01`…), user_id, tema, subvariable, modo, texto, problema_si, por_que, na_auto, requiere_dato, ritual, activa, origen |
| `closures` | id, user_id, session_id (nullable), numero, fecha_local, sesion_del_dia, estado (`borrador`/`confirmado`), por_que, ajuste, ratio |
| `closure_items` | id, closure_id, tema, question_id, posicion, respuesta (`si`/`no`/`na`/null), dato_json, problema |
| `bank_theme_state` | user_id, tema, usados_ciclo (JSON), ultimo_modo |
| `question_stats` | user_id, question_id, apariciones, aplicables, problemas, na |

Estados de `dw_sessions.estado`: `planificada → trabajando ⇄ pausada → trabajo_terminado → descansando → descanso_terminado`; desde `trabajo_terminado` en adelante se puede cerrar → `cerrada`. Otra salida: `omitida`.

## 6. Reglas de negocio

### 6.1 Planificación
- R1. No se puede asignar una tarea `completada` o `archivada` a una sesión.
- R2. No se puede asignar ni mover tareas sobre una sesión `cerrada` u `omitida`, ni quitar una sesión `cerrada`.
- R3. Mover una tarea de una sesión a otra suma 1 a `veces_movida`. Asignarla desde el panel no suma.
- R4. Máximo 12 sesiones por día (más es un error de carga, no un plan).
- R5. Una sesión del pasado que nunca se inició puede marcarse `omitida`; no se puede iniciar una sesión de una fecha futura.

### 6.2 Timer
- R6. Un usuario tiene como máximo **una sesión activa** (`trabajando`, `pausada` o `descansando`) a la vez.
- R7. El tiempo vive en el servidor como timestamps; el cliente solo dibuja. Recargar o cerrar la pestaña no pierde el tiempo.
- R8. El paso trabajo → descanso nunca es automático. Tampoco descanso → fin.
- R9. Minutos reales de trabajo = `(work_ended_at − started_at − paused_ms) / 60000`, redondeado a 1 decimal.
- R10. Las transiciones inválidas (pausar algo no iniciado, descansar sin terminar el trabajo, etc.) devuelven `409 Conflict` con un mensaje claro.

### 6.3 Cierre y calibración
- R11. Una sesión se cierra una sola vez. Repetir el envío no duplica datos (idempotente).
- R12. Ratio real/estimado = `real_min / postit_estimado_min` (o, sin post-it, sobre el estimado de la tarea). Se señala si queda fuera de **0,8–1,25**.
- R13. El calibrador por tipo usa solo sesiones cerradas con estimado > 0. Menos de 3 datos: "sin datos suficientes".
- R14. Costo estimado de distracciones = (suma de duraciones medidas + distracciones sin duración × `min_por_distraccion`) × valor_hora / 60.

### 6.4 Rachas y constancia
- R15. **Racha diaria:** días consecutivos (hacia atrás desde hoy) que tuvieron ≥ 1 sesión cerrada. Un día **sin sesiones agendadas** es descanso planificado: no suma ni corta. Un día con sesiones agendadas y ninguna cerrada corta la racha. Hoy, si todavía no terminó, no corta.
- R16. **Racha semanal:** semanas consecutivas (lunes–domingo) con sesiones cerradas ≥ `objetivo_semanal`. Una semana sin nada agendado es neutra (vacaciones planificadas). La semana en curso suma solo si ya alcanzó el objetivo y no corta mientras no termine.

## 7. Modo periodizado (cierre avanzado)

### 7.1 Banco
- Fuente: «Banco de cierre de sesión DW». IDs estables en el orden del archivo: `C01…C22` (Concentración), `A01…A23` (Apalancamiento), `E01…E23` (Energía), `S01…S15` (Estrés), `SI01…SI18` (Sistemas), `O01…O15` (Output). 116 en total. Nunca se renumeran.
- Por pregunta se guarda: ID, tema, subvariable, modo de acción, texto, regla «problema si», POR QUÉ sugerido.
- Las preguntas abiertas o de dos opciones se normalizan a Sí/No ajustando la regla sin cambiar qué detectan. El texto original queda en el seed para trazabilidad.
- `[sesión patrón]` se reemplaza por una descripción breve de una sesión ideal relevante para esa pregunta. No se le pide al usuario una sesión de referencia.
- Las preguntas atadas a un ritual personal (mantra, lápiz, anclaje olfativo, mentalización) vienen **desactivadas** para usuarios nuevos y se activan desde el banco. El umbral usa solo preguntas activas.
- Se omiten la checklist fija de hechos, los instrumentos opcionales y la entrada de preguntas por "nueva falla".

### 7.2 Sorteo
Al iniciar el `Cierre N` se guardan la fecha local y el número de sesión del día, y se sortea **una pregunta por tema en el orden C, A, E, S, SI, O**:
- R17. Se excluyen los IDs ya usados en el ciclo de ese tema y las preguntas con el **mismo modo** que salió en el cierre anterior de ese tema.
- R18. Umbral del ciclo = `ceil(2 × activas / 3)`. Al alcanzarlo, se reinician los IDs usados del tema para el próximo sorteo. Se conservan el último modo y los conteos históricos.
- R19. Entre las opciones válidas solo se eligen las que dejan una secuencia posible hasta alcanzar el umbral (preguntas no usadas, sin dos modos iguales seguidos). Si el banco no permite cumplir ambas reglas, se avisa explícitamente en el cierre y se relaja solo la regla del modo para ese tema en ese cierre.
- R20. El sorteo usa números aleatorios del servidor. Las seis preguntas se guardan en el cierre borrador: recargar o reabrir el mismo cierre no vuelve a sortear ni duplica registros.
- R21. Eye of the tiger participa como cualquier subvariable de Energía, sin cupo ni prioridad.

### 7.3 Respuestas
- Se muestran seis preguntas numeradas, solo con su texto (sin subvariable, modo ni reglas).
- Respuestas: `Sí`, `No`, `N/A` (la situación no ocurrió). Nada más: no hay "más o menos".
- R22. Si es la **primera sesión cerrada del día**, las preguntas sobre el descanso o la sesión anterior quedan automáticamente en `N/A`.
- R23. Cuando una regla requiere un dato, se pide solo ese dato. Ejemplo: duración percibida — se pide la estimación a ciegas (el reloj de trabajo queda oculto hasta confirmar el cierre) y los minutos reales los aporta el timer.
- Al final: «POR QUÉ (opcional)» + «Ajuste para el próximo post-it (opcional)».

### 7.4 Registro y resultado
- R24. Al confirmar se guardan una sola vez las respuestas, notas y el ajuste.
- Resultado: una línea por tema con `✓` (no marca problema), `✗` (coincide con su regla) o `N/A`. En una línea aparte, los hechos problemáticos reportados (POR QUÉ). Si hay tiempo real y estimado: `real / estimado`, señalando si queda fuera de 0,8–1,25 (no cambia el resultado de ninguna pregunta). El ajuste se muestra solo si se indicó.

### 7.5 Estado persistido
- Por usuario: fecha del último cierre, cierres totales, IDs usados por tema en el ciclo, último modo por tema, conteos por ID y ajuste pendiente.
- R25. Toda pregunta sorteada en un cierre confirmado cuenta como aparición. Los `N/A` se guardan aparte: no suman problemas ni entran al denominador semanal.

### 7.6 Resumen periodizado
- Por tema, para la semana local lunes–domingo: `problemas / respuestas aplicables` y su porcentaje. Denominador cero: «sin datos».
- R26. **Candidata a graduación:** pregunta con ≥ 8 respuestas aplicables y ningún problema. Se muestra; no se retira automáticamente. El usuario puede desactivarla desde el banco.

## 8. API REST (resumen)

Prefijo `/api`. JSON. Errores: `{ error: { code, message, details? } }` con 400 (validación), 401, 403, 404, 409 (regla de negocio).

| Recurso | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` |
| Configuración | `GET/PATCH /settings` |
| Tipos | `GET/POST /types`, `PATCH/DELETE /types/:id` |
| Tareas | `GET/POST /tasks`, `PATCH/DELETE /tasks/:id` |
| Plantillas | `GET/POST /templates`, `PATCH/DELETE /templates/:id` |
| Planner | `GET /week?start=YYYY-MM-DD`, `POST /sessions`, `PATCH/DELETE /sessions/:id`, `PUT /sessions/:id/task`, `DELETE /sessions/:id/task` |
| Ejecución | `GET /active`, `GET /sessions/:id`, `POST /sessions/:id/{start,pause,resume,end-work,start-break,end-break,skip}`, `PUT /sessions/:id/postit`, `PUT /sessions/:id/checklist/:itemId`, `POST/PATCH/DELETE /sessions/:id/objectives…`, `POST /sessions/:id/distractions`, `PATCH /distractions/:id` |
| Cierre | `POST /sessions/:id/close` (simple), `POST /closures` (crea o recupera borrador periodizado), `GET /closures/:id`, `PUT /closures/:id/items/:itemId` (respuesta parcial), `POST /closures/:id/confirm` |
| Métricas y banco | `GET/POST /metrics`, `PATCH /metrics/:id`, `GET /bank`, `PATCH /bank/:id` |
| Datos | `GET /stats/heatmap`, `GET /stats/streaks`, `GET /stats/week?start=`, `GET /stats/calibration`, `GET /stats/periodized?start=` |
| Estado | `GET /state/export`, `POST /state/import` |
| Salud | `GET /health` |

## 9. Casos borde

| # | Caso | Comportamiento esperado |
|---|---|---|
| CB1 | Se recarga la página con el timer corriendo | El timer sigue desde el valor real (timestamps del servidor). |
| CB2 | Se intenta iniciar una segunda sesión con otra activa | 409: "Ya tenés una sesión en curso". |
| CB3 | El trabajo supera lo planificado | Se muestra tiempo extra; no cambia de fase. |
| CB4 | Se termina el trabajo antes de lo planificado | Se permite; los minutos reales quedan por debajo. |
| CB5 | Se envía dos veces el cierre | La segunda respuesta devuelve el mismo cierre, sin duplicar. |
| CB6 | Se recarga a mitad de un cierre periodizado | Se recuperan las mismas seis preguntas y las respuestas ya marcadas. |
| CB7 | Primera sesión del día en modo periodizado | Preguntas de descanso/sesión anterior en N/A automático. |
| CB8 | El usuario desactiva preguntas y un tema queda sin opciones válidas | Aviso explícito y relajación solo de la regla del modo. Con 0 activas, el tema se muestra "sin preguntas activas". |
| CB9 | Borrar un tipo en uso | Se archiva en vez de borrarse. |
| CB10 | Asignar una tarea a una sesión cerrada | 409. |
| CB11 | Estimado del post-it = 0 o vacío | No se calcula ratio. |
| CB12 | Cambio de semana con la zona horaria del usuario | La semana se calcula en su zona (`America/Argentina/Buenos_Aires` por defecto), no en UTC. |
| CB13 | Importar un estado de otra versión o mal formado | 400 con detalle; no se modifica nada (transacción). |
| CB14 | Usuario sin sesiones | Mapa vacío, rachas en 0, resumen "sin datos". |

## 10. Requerimientos no funcionales

- Seguridad: cero credenciales en el código; `.env` ignorado; contraseñas con bcrypt; cookie `httpOnly`, `Secure` en producción; CORS solo para el origen del frontend; consultas parametrizadas (Knex); límite de intentos de login.
- Todo dato se filtra por `user_id` en el repositorio: un usuario nunca puede leer ni modificar datos de otro (se devuelve 404, no 403, para no revelar existencia).
- Responsive: usable desde el celular (el timer y el botón de distracción sobre todo).
- Accesibilidad: navegación por teclado, `prefers-reduced-motion`.
- Estética: design system de SuperHumanos (blanco y negro, Stack Sans, grilla de fondo, glow del cursor).

## 11. Fuera de alcance (v1)

Integración con Google Calendar, app nativa, notificaciones push con la pestaña cerrada, edición del banco de preguntas más allá de activar/desactivar, multiusuario por equipo.
