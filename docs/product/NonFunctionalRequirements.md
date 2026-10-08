# Requisitos No Funcionales

**Estado: los requisitos de seguridad y privacidad se revisaron contra el código el 2026-09-18** ([brief-8.4](../decisions/brief-8.4-revision-de-seguridad.md), autoevaluación); los de rendimiento se miden en la 8.5. El resto sigue **diseñado**, y cada sección dice qué alcanzó.

## Seguridad

- Contraseñas hasheadas con un algoritmo de hashing lento y con sal (argon2id o bcrypt con costo adecuado), nunca en texto plano ni con hash rápido (SHA-256 simple).
- Sesiones server-side con cookies `HttpOnly`, `Secure` (en todo entorno con TLS) y `SameSite=Lax` o `Strict`.
- Autorización evaluada en el servidor en cada operación, nunca solo ocultando UI en el cliente.
- Toda **lectura** de datos de negocio filtra por `organization_id` de la sesión activa. **Verificado en la 8.4**; la excepción que ese repaso dejó abierta (H-1: las tablas de `auth` son globales por diseño y `findUserSummaries` lee usuarios por id sin filtrar) se **acotó en la 9.0.1**: el único punto de entrada al resumen de usuarios es ahora `organizations.getMemberSummaries`, que interseca en SQL contra `organization_members` antes de leer, y una guarda impide que otro módulo importe `getUserSummaries` directo. **Límite declarado**: la consulta de `auth` sigue sin filtro propio, así que la garantía la sostiene el punto de entrada y no la estructura; lo estructural sería RLS, que no está decidido.
- Toda **escritura** de datos de negocio incluye `organization_id` en el `where`. Las **siete funciones** que filtraban solo por id (H-7, agregado por la revisión independiente del 2026-09-18) se corrigieron en la **9.0.1**, con un test de integración por función y corrida de mutación. La revisión independiente de la 9.0.1 encontró **dos más de la misma clase** en `ingestion`: `finishEvent` se corrigió en la **9.0.4** el 2026-09-21, y `revokeCredential` queda diferida con su motivo y su condición de reapertura escritos.

  El estado de cada una está en [Risks](../planning/Risks.md). La redacción anterior —"no existe una vía de acceso cross-organización"— se corrigió tres veces: primero por H-1, después por H-7 —que la primera corrección había dejado igual de falsa en un alcance más chico— y por último en la 9.0.1, que dejó de afirmar en presente lo que ya no era cierto. Este párrafo describe el estado del código, no la intención del diseño.

## Privacidad

- Minimización de datos personales de clientes: solo se almacenan y muestran los campos necesarios para operar (ver [FR-CLI-05](FunctionalRequirements.md)).
- Los logs de aplicación no contienen cuerpo de mensajes ni PII innecesaria — solo identificadores.
- Existe un mecanismo (aunque sea manual en el MVP) para exportar o eliminar los datos de un cliente a pedido. **Cumplido en la 8.2** con el runbook [datos-de-un-cliente](../runbooks/datos-de-un-cliente.md) y sus dos scripts, con una precisión que este requisito no anticipaba: la exportación es completa, pero **la eliminación es parcial para un cliente con conversaciones**, porque `messages` y `audit_logs` son de solo inserción y la cadena de claves foráneas está cerrada. Para ese caso el procedimiento minimiza la ficha —teléfono, nombre y notas— y declara lo retenido. Un borrado real exige revisar el [ADR 0013](../decisions/0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md) y está en [Risks](../planning/Risks.md).
  - *Desde la 13.4 (2026-10-01)*: **el borrado vacía el contenido y conserva la forma** ([brief-13.4](../decisions/brief-13.4-retencion-y-borrado.md), D-2; [ADR 0015](../decisions/0015-vaciado-de-una-sola-direccion-en-tablas-de-solo-insercion.md)). Para un cliente con conversaciones, en una transacción: la ficha pierde nombre, teléfono y notas; sus conversaciones, la referencia externa; sus mensajes, el texto y la referencia externa; desde la 16.4, las notas de sus conversaciones, el texto ([brief-16.4](../decisions/brief-16.4-notas-de-la-conversacion.md), D-5); y sus entradas de auditoría, los valores. Quedan fechas, direcciones, tipos y estados, así que las métricas de los períodos pasados no cambian. **Lo que queda fuera del alcance del borrado** está declarado en el runbook: las copias de seguridad, unos 30 días mientras el backup diario funcione; la copia del agente; los logs del servidor; **las conversaciones sin cliente**, que el CRM no puede atribuir a la persona (revisión independiente de la 13.4, R-1); y `ingestion_events`, cuyos identificadores, por contrato, no llevan el teléfono, sin que el CRM lo valide.

## Auditabilidad

- Cambios sensibles (productos, clientes, stock) quedan auditados con actor y timestamp, de forma inmutable. *Desde la 13.4*, con una excepción: el `diff` de una entrada de cliente se puede vaciar a pedido, con el rol dueño; el actor, la acción y la fecha no cambian ([ADR 0015](../decisions/0015-vaciado-de-una-sola-direccion-en-tablas-de-solo-insercion.md)).
- Los movimientos de inventario nunca se editan ni se borran; una corrección se hace con un movimiento de ajuste nuevo.

## Rendimiento (MVP, sin tráfico productivo)

- Listados paginados de productos, clientes y conversaciones responden en desarrollo/staging en tiempo interactivo (objetivo de referencia, no un SLA productivo) con datasets sintéticos de hasta ~10.000 filas por organización.
- Sin objetivo de escalabilidad masiva en el MVP; el diseño no debe impedirla, pero no se optimiza prematuramente por ella.

## Disponibilidad

- ~~No hay SLA de disponibilidad en el MVP: no hay tráfico productivo.~~ *Reemplazado el 2026-09-30 por la 13.3* ([brief-13.3](../decisions/brief-13.3-disponibilidad-y-observabilidad.md), D-1, pregunta 6). El agente depende del CRM en cada turno ([ADR 0014](../decisions/0014-el-agente-de-whatsapp-como-consumidor-del-crm.md)), así que la disponibilidad pasó a ser un requisito. **Producción tiene un objetivo del 99,5 % mensual**, unas 3 h 39 min de caída por mes, **medido desde afuera** sobre `/api/health`, que incluye la base.
  - **Es un objetivo, no un SLA.** No hay guardia: la alerta llega a cualquier hora, y la respuesta es la que el operador pueda dar.
  - **Por qué no más.** Un solo droplet, una sola base y un solo operador. Cada despliegue corta el servicio durante el reinicio de la aplicación: **de 1 a 3 segundos**, medidos el 2026-09-30 sobre `/login` (13.3, AC-12). `npm ci` y `next build` corren con la versión anterior arriba y no cortan.
  - **Cuánto tarda en saberse.** El monitor avisa una caída entre 4,5 y 9,5 minutos después de que empieza (13.3, AC-8 y AC-9).
  - **La consecuencia para el consumidor.** El CRM no garantiza estar disponible en cada turno, así que el emisor tiene que tolerar una falla o un timeout sin perder el mensaje. La ingestión ya lo exige desde la Fase 12; la lectura lo dice en su [contrato](../contracts/read-v1.md), §Disponibilidad.
  - **Lo que no está medido.** Que el objetivo se cumpla: hace falta un mes de medición.
- Staging puede tener downtime sin impacto de negocio, y no tiene alertas.

## Observabilidad

- Logs estructurados por request con `organization_id`, `user_id` (cuando aplique) y `request_id`, sin contenido de negocio sensible.
- Métrica técnica de errores de ingestión visible en el dashboard cuando el contrato esté activo.

## Portabilidad y evolución

- El código de acceso a datos se organiza para que un cambio de proveedor de hosting o de motor de base de datos secundario (ej. cache) no requiera reescribir la lógica de dominio.
- El modelo de datos no impide agregar módulos futuros (ventas, compras) sin romper las tablas existentes de `clients`, `products`, `organizations`.

## Accesibilidad

- Contraste de color conforme a WCAG AA en los textos e indicadores de estado (disponible/bajo stock/sin stock no dependen solo del color).
- Navegación por teclado en formularios y tablas principales.
- Etiquetas accesibles (`label`, `aria-*`) en campos de formulario y controles de filtro.

## Retención y backups

- **Política de retención de mensajes, desde la 13.4 (2026-10-01): conservar mientras haga falta, con borrado a pedido** ([brief-13.4](../decisions/brief-13.4-retencion-y-borrado.md), D-1, decisión del usuario). Sin horizonte por edad: el negocio no dijo cuánto historial necesita, y el agente lee el historial para dar contexto. Se reabre si el negocio lo pide, si el volumen lo exige o si una obligación legal lo impone. **Esta política no afirma cumplimiento legal.**
- **Retención de los logs, desde la 13.4**: el journal de producción, 31 días como mucho: 30 de retención más un día de archivo (`deploy/production/journald-crm-production.conf`, con su guarda); los logs de nginx, 14 días. `rsyslog` copia la salida de la aplicación en `/var/log/syslog`, con rotación semanal de 4 archivos: hasta unos 35 días. Está declarado, y alinearlo a 30 tiene tarea en Notion (revisión independiente de la 13.4, R-12). Lo borrado en la base vive en las copias de seguridad hasta que vencen: unos 7 días en el servidor y unos 30 en la copia externa, **mientras el backup diario funcione**; si falla varios días, más. Una restauración lo trae de vuelta, y el [runbook de restauración](../runbooks/restaurar-la-base.md) manda volver a aplicar los borrados posteriores a la copia.
- ~~**Política de retención de mensajes: conservar indefinidamente**~~ (reemplazada por la 13.4), decidida el 2026-09-22 en el [brief-9.2](../decisions/brief-9.2-backups-y-restauracion.md) (D-2) y registrada con su análisis en [architecture/DataModel.md](../architecture/DataModel.md). No se agregó ningún mecanismo de expiración: `messages` es de solo inserción por [ADR 0013](../decisions/0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md), así que un borrado por retención exigiría reabrir ese ADR y decidir quién puede borrar. **Condición de reapertura**: se vuelve a decidir en la **Fase 10** —decía «en la 9.4», que se disolvió el 2026-09-23 al cerrar la Fase 9—, o antes si entra un dato personal que no sea sintético. La segunda mitad de la condición es la que va a dispararse: la integración con el agente trae datos de clientes reales. **Reevaluada en la 10.1 el 2026-09-23** (R-3 de la [evaluación](../decisions/evaluacion-10.1-mvp.md)): la primera mitad pasa a la fase de producción de la integración (Fase 13), antes del primer mensaje real; la segunda sigue igual y puede adelantarla a la fase del contexto del turno (Fase 12).
- Backups lógicos automáticos desde que exista un entorno de staging persistente, con prueba periódica de restauración (ver [architecture/SecurityModel.md](../architecture/SecurityModel.md)).

## Separación de entornos

- Desarrollo, test, staging y producción usan bases de datos y secretos completamente separados; ningún entorno no productivo tiene acceso a datos reales porque, en el MVP, no existen datos reales.
