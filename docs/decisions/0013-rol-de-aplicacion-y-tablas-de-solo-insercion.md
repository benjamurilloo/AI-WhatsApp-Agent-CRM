# 0013 — Rol de aplicación `crm_app` y tablas de solo inserción

- Estado: aceptada
- Fecha: 2026-09-14

## Contexto

Dos tablas del MVP deben ser de solo inserción "por permisos de base de datos": `audit_logs` (3.6) e `inventory_movements` (Fase 4), según [DataModel.md](../architecture/DataModel.md) y [TestingStrategy.md](../development/TestingStrategy.md).

Al preparar la 3.6 ([brief-3.6](brief-3.6-modulo-de-auditoria.md)) se verificó que la aplicación, las migraciones y los tests se conectan con el usuario del contenedor, que es superusuario en local y en CI. PostgreSQL no verifica permisos para un superusuario, y el dueño de una tabla tiene todos los privilegios sobre ella. Un `REVOKE` sobre ese rol no restringe nada, y no existía ningún rol restringido.

Los roles son objetos del servidor, no de cada base: la base de desarrollo y la de test los comparten.

## Decisión

1. **Rol `crm_app` `NOLOGIN`**, creado por migración solo si no existe. Es el rol con el que se conectará la aplicación.
2. **Privilegios explícitos en cada migración que crea una tabla**:
   - una tabla común recibe `SELECT`, `INSERT`, `UPDATE` y `DELETE`;
   - una tabla de solo inserción recibe solo `SELECT` e `INSERT`.
3. **Trigger `BEFORE UPDATE OR DELETE`** en cada tabla de solo inserción, que rechaza la operación para cualquier rol con SQLSTATE `P0001`. Así se distingue del rechazo por permisos (`42501`).
4. **Test de cobertura de privilegios** (`tests/integration/audit.test.ts`): falla si alguna tabla de `public` no tiene los privilegios esperados para `crm_app`. La lista de tablas de solo inserción vive en ese test.
5. **La conexión de la aplicación con un rol con login miembro de `crm_app`** llega con el aprovisionamiento de entornos y secretos (Fases 8 y 9, subfase 9.1). Las migraciones siguen corriendo con el rol dueño.

## Alternativas descartadas

- **Solo `REVOKE` sobre el rol actual**: no tiene efecto sobre un superusuario ni sobre el dueño.
- **Row Level Security**: sin política de `UPDATE` o `DELETE`, la operación afecta cero filas sin error, y el dueño la saltea salvo `FORCE ROW LEVEL SECURITY`.
- **Solo el trigger**: no cumple "por permisos" y no deja preparado el rol restringido para producción.
- **Cambiar ya la conexión de la aplicación y de los tests**: adelanta a la 3.6 una contraseña nueva, un script de inicialización del contenedor y cambios en CI, que pertenecen a la 9.1.
- **`ALTER DEFAULT PRIVILEGES`**: otorgaría `UPDATE` y `DELETE` en silencio a toda tabla nueva, incluidas las de solo inserción. Los privilegios explícitos por migración dejan la decisión visible en el SQL revisado.

## Consecuencias

- **Primera migración a medida**: `drizzle/0003_crm_app_role_and_audit_insert_only.sql`, creada con `drizzle-kit generate --custom`. El paso de desfase de la CI sigue limpio.
- **Fase 4**: la migración de `inventory_movements` otorga solo `SELECT` e `INSERT`, agrega su trigger y suma la tabla a la lista del test.
- **Tests de permisos**: se ejecutan con `SET LOCAL ROLE crm_app` dentro de una transacción, sin credenciales nuevas.
- **Limitaciones aceptadas**:
  - hasta que la aplicación se conecte con `crm_app`, la defensa efectiva es el trigger;
  - el dueño todavía puede vaciar una tabla de solo inserción con `TRUNCATE`, que usa `resetDatabase` en los tests;
  - un superusuario puede desactivar el trigger;
  - crear el rol exige `CREATEROLE` al usuario de migraciones, algo a verificar en un servicio gestionado.

## Nota de la 6.1 (2026-09-16)

[brief-6.1](brief-6.1-migraciones-de-conversaciones.md), D-3, aplica esta decisión a dos tablas más, en `drizzle/0012_*`:

- **`messages`** es de solo inserción, igual que las dos tablas originales: `crm_app` con `SELECT` e `INSERT`, y el trigger `messages_insert_only`.
- **`ingestion_events`** es una tercera categoría: `crm_app` con `SELECT`, `INSERT` y `UPDATE`, sin `DELETE`, porque el estado del evento cambia. El trigger `ingestion_events_identity_immutable` rechaza con `P0001` el borrado y todo cambio de `id`, `organization_id`, `source`, `external_ref`, `event_type`, `payload_hash` o `received_at`.
- El test de cobertura de `audit.test.ts` lleva las dos listas: solo inserción y sin borrado.
- La retención de mensajes (Fase 9) revisará el trigger de `messages` con su propia decisión.

## Nota de la 13.4 (2026-10-01)

**Enmendada por el [ADR 0015](0015-vaciado-de-una-sola-direccion-en-tablas-de-solo-insercion.md)** ([brief-13.4](brief-13.4-retencion-y-borrado.md), D-3): los triggers de `messages` y `audit_logs` dejan pasar un único `UPDATE`, el vaciado del contenido de un mensaje o de la entrada de auditoría de un cliente, con el resto de la fila idéntico. `crm_app` sigue sin `UPDATE` ni `DELETE`, y el test de cobertura no cambia. `inventory_movements`, `product_prices` e `ingestion_events` no cambian.
