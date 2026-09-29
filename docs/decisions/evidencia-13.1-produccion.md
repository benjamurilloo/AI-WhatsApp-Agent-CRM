# Evidencia 13.1 — Entorno productivo

Salidas crudas de la verificación del [brief-13.1](brief-13.1-entorno-productivo.md). Cada bloque trae su comando y su fecha. Un bloque marcado `[transcrito]` no es literal y dice qué se compuso a mano (regla de la 9.1, N-8).

**Autoevaluación.** Todo lo de este archivo lo midió el mismo agente que implementó la subfase. La revisión independiente de D-11 viene después.

## Etapa 13.1.1 — local, 2026-09-29

### AC-6 — Medición de collation (D-7)

Contra el PostgreSQL 18.6 local de `docker compose` (el mismo `postgres:18.6-trixie` de la CI), con veinte nombres elegidos para separar las candidatas: acentos, mayúsculas, espacios y la `ñ`. El guion está en el bloque siguiente; la salida es literal.

Comando: `docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d postgres -f -' < collation.sql`

```sql
\pset pager off
select version();
select collname, collprovider, collversion from pg_collation where collname in ('C.utf8','C.UTF-8','pg_c_utf8','en_US.utf8','es-x-icu','es-AR-x-icu','und-x-icu','es_AR.utf8') order by 1;
create temp table n(v text);
insert into n values ('Zapata'),('Ávila'),('avila'),('Avila'),('Ñandú'),('Nube'),('Oso'),('ñoqui'),('Ana María'),('Ana Maria'),('AnaMaria'),('Anabel'),('Érica'),('Eva'),('éxito'),('Última'),('Uva'),('zeta'),('ábaco'),('Abel');
\echo '--- C.utf8 (staging)'
select string_agg(v, ' | ' order by v collate "C.utf8") from n;
\echo '--- pg_c_utf8 (builtin)'
select string_agg(v, ' | ' order by v collate "pg_c_utf8") from n;
\echo '--- en_US.utf8 (desarrollo)'
select string_agg(v, ' | ' order by v collate "en_US.utf8") from n;
\echo '--- es-x-icu'
select string_agg(v, ' | ' order by v collate "es-x-icu") from n;
\echo '--- und-x-icu'
select string_agg(v, ' | ' order by v collate "und-x-icu") from n;
\echo '--- orden por lower(), como las listas del CRM, con es-x-icu'
select string_agg(v, ' | ' order by lower(v) collate "es-x-icu", v collate "es-x-icu") from n;
\echo '--- igualdad determinística: lower() distingue acentos en todas'
select 'Ávila'=lower('ÁVILA') collate "es-x-icu" as icu_eq_tilde_mayus, lower('Ávila') = lower('ÁVILA') collate "es-x-icu" as icu_lower_eq, 'avila' = 'ávila' collate "es-x-icu" as icu_sin_tilde_eq, (select collisdeterministic from pg_collation where collname='es-x-icu') as es_icu_deterministico;
```

```
Pager usage is off.
                                                      version                                                       
--------------------------------------------------------------------------------------------------------------------
 PostgreSQL 18.6 (Debian 18.6-1.pgdg13+2) on x86_64-pc-linux-gnu, compiled by gcc (Debian 14.2.0-19) 14.2.0, 64-bit
(1 row)

  collname   | collprovider | collversion 
-------------+--------------+-------------
 C.utf8      | c            | 
 en_US.utf8  | c            | 2.41
 es-AR-x-icu | i            | 153.128.46
 es-x-icu    | i            | 153.128.46
 pg_c_utf8   | b            | 1
 und-x-icu   | i            | 153.128
(6 rows)

CREATE TABLE
INSERT 0 20
--- C.utf8 (staging)
                                                                             string_agg                                                                             
--------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Abel | Ana Maria | Ana María | AnaMaria | Anabel | Avila | Eva | Nube | Oso | Uva | Zapata | avila | zeta | Ávila | Érica | Ñandú | Última | ábaco | éxito | ñoqui
(1 row)

--- pg_c_utf8 (builtin)
                                                                             string_agg                                                                             
--------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Abel | Ana Maria | Ana María | AnaMaria | Anabel | Avila | Eva | Nube | Oso | Uva | Zapata | avila | zeta | Ávila | Érica | Ñandú | Última | ábaco | éxito | ñoqui
(1 row)

--- en_US.utf8 (desarrollo)
                                                                             string_agg                                                                             
--------------------------------------------------------------------------------------------------------------------------------------------------------------------
 ábaco | Abel | Anabel | Ana Maria | AnaMaria | Ana María | avila | Avila | Ávila | Érica | Eva | éxito | Ñandú | ñoqui | Nube | Oso | Última | Uva | Zapata | zeta
(1 row)

--- es-x-icu
                                                                             string_agg                                                                             
--------------------------------------------------------------------------------------------------------------------------------------------------------------------
 ábaco | Abel | Ana Maria | Ana María | Anabel | AnaMaria | avila | Avila | Ávila | Érica | Eva | éxito | Nube | Ñandú | ñoqui | Oso | Última | Uva | Zapata | zeta
(1 row)

--- und-x-icu
                                                                             string_agg                                                                             
--------------------------------------------------------------------------------------------------------------------------------------------------------------------
 ábaco | Abel | Ana Maria | Ana María | Anabel | AnaMaria | avila | Avila | Ávila | Érica | Eva | éxito | Ñandú | ñoqui | Nube | Oso | Última | Uva | Zapata | zeta
(1 row)

--- orden por lower(), como las listas del CRM, con es-x-icu
                                                                             string_agg                                                                             
--------------------------------------------------------------------------------------------------------------------------------------------------------------------
 ábaco | Abel | Ana Maria | Ana María | Anabel | AnaMaria | avila | Avila | Ávila | Érica | Eva | éxito | Nube | Ñandú | ñoqui | Oso | Última | Uva | Zapata | zeta
(1 row)

--- igualdad determinística: lower() distingue acentos en todas
 icu_eq_tilde_mayus | icu_lower_eq | icu_sin_tilde_eq | es_icu_deterministico 
--------------------+--------------+------------------+-----------------------
 f                  | t            | f                | t
(1 row)

```

**Lectura**:
- `es-x-icu` es la única candidata que ordena como en castellano. La «Ñ» va **después** de la «N» (`Nube | Ñandú | ñoqui | Oso`), cada letra acentuada va con su letra, las mayúsculas se intercalan y los espacios cuentan (`Ana Maria` antes que `Anabel`).
- `und-x-icu` pone la «Ñ» **antes** de «Nube».
- `C.utf8` y `pg_c_utf8` (staging) mandan todo lo acentuado al final, y las mayúsculas antes que las minúsculas. Es el E-2.
- `en_US.utf8` (desarrollo) ignora los espacios (`Anabel` antes que `Ana Maria`) y trata la «Ñ» como «N».
- `es-x-icu` es determinística, así que la igualdad no cambia: `'avila' = 'ávila'` da falso, y `lower()` iguala solo mayúsculas con minúsculas. Las unicidades con `lower()` no cambian de resultado.

**Resultado: D-7 se confirma. La base productiva se crea con `LOCALE_PROVIDER icu ICU_LOCALE 'es'`.**

### AC-7 — La `0003` con un dueño sin `CREATEROLE` (O-7), y la base con la collation elegida

En un contenedor descartable (`postgres:18.6-trixie`, `127.0.0.1:55432`), para no tocar el rol `crm_app` del servidor local, que es global a todas sus bases. Se borró al terminar. Las contraseñas son de ese contenedor y no existen en ningún otro lado.

Primero, sin `crm_app`. Se espera que la `0003` falle:

```
### 1. dueño sin CREATEROLE y base con ICU es
CREATE ROLE
CREATE DATABASE
You are now connected to database "crm_production" as user "ensayo_super".
CREATE EXTENSION
                                                  List of databases
      Name      |   Owner   | Encoding | Locale Provider | Collate |  Ctype  | Locale | ICU Rules | Access privileges 
----------------+-----------+----------+-----------------+---------+---------+--------+-----------+-------------------
 crm_production | crm_owner | UTF8     | icu             | C.UTF-8 | C.UTF-8 | es     |           | 
(1 row)

  rolname  | rolcreaterole | rolsuper 
-----------+---------------+----------
 crm_owner | f             | f
(1 row)

### 2. migrar SIN crm_app (se espera falla en la 0003)
Las migraciones NO se aplicaron.
Error de PostgreSQL: permission denied to create role
SQLSTATE: 42501
Detalle: Only roles with the CREATEROLE attribute may create roles.
Failed query: -- Rol de aplicación y solo inserción de audit_logs (brief-3.6, D-2; ADR 0013).
codigo de salida: 1
0
```

Después se crea `crm_app` con el superusuario y se migra de nuevo con el dueño.

**Una corrección al propio ensayo**: en el paso 1 creé `unaccent` a mano como superusuario, y eso podía tapar un problema de la migración que la crea. Se borró antes de migrar, para que la creara la migración con el dueño, como va a pasar en producción. La salida de abajo lo muestra: `unaccent` queda de `crm_owner`.

```
### 3. crm_app creado por el superusuario, extension borrada, migrar con el dueño
DROP EXTENSION
CREATE ROLE
Migraciones aplicadas.
codigo de salida: 0
### 4. estado
 tablas_publicas 
-----------------
              17
(1 row)

 migraciones 
-------------
          25
(1 row)

 extname  | extowner  
----------+-----------
 unaccent | crm_owner
(1 row)

 datcollate | datctype | datlocprovider | datlocale 
------------+----------+----------------+-----------
 C.UTF-8    | C.UTF-8  | i              | es
(1 row)

  lower_icu  
-------------
 ávila ñandú
(1 row)

### 5. rol con login miembro de crm_app, y DELETE sobre audit_logs
CREATE ROLE
ERROR:  permission denied for table audit_logs
codigo: 1
```

### AC-4 y AC-5 — El alta de la organización y el rechazo de los seeds, sobre esa misma base

Con el rol de aplicación `crm_app_login`, como se va a correr en producción. **La contraseña inicial se reemplazó por `[omitida]` con `sed` en la misma tubería**: nunca llegó a este archivo.

```
Organización creada: 695c3078-ae39-448c-9698-4932b82c85ae
Admin creado: f00de641-db7e-4ad7-8d2b-5eff5539cacc
Contraseña inicial (se muestra una sola vez; se cambia al primer ingreso): [omitida]
codigo: 0
### segundo intento, mismo correo
Ya existe un usuario con ese correo. No se creó nada.
codigo: 1
### seed contra la base productiva
El seed solo corre contra una base _dev, _test, _e2e o _staging, no contra "crm_production".
codigo: 1
1|1|1|1
```

`1|1|1|1`: una organización, un usuario, un miembro y una fila de auditoría. El segundo intento no dejó nada, y el seed se negó a correr contra `crm_production`.

**Tests de integración** (`tests/integration/organization-bootstrap.test.ts`): 6 de 6 contra la base `_test`. Incluyen AC-5 por efecto: cinco seeds contra una base `crm_production` creada en el servidor de test y borrada al terminar.

**Mutación de AC-4, ejecutada** `[transcrito]`: se cambió `throw new EmailTakenError()` por `return failure("CONFLICT")`. Así la transacción confirma la organización ya insertada.
- Antes: 6 de 6.
- Después: 1 falló y 5 pasaron. Falló «con un correo ya tomado responde CONFLICT y no deja una organización sin admin», con `expected { organizations: 2, … } to deeply equal { organizations: 1, … }`.
- Se restauró el código.

**Mutación de AC-5, ejecutada** `[transcrito]`: se agregó `production` a `SUFIJOS_SEEDEABLES` en `seeds/basic.ts`. El primer intento lo bloqueó el clasificador de permisos de Claude Code como debilitamiento de seguridad. El usuario la autorizó después, en su propio turno, el mismo día.
- Antes: 6 de 6.
- Después: 1 falló y 5 pasaron. Falló «todos los seeds rechazan la base productiva sin crear nada», con `expected [Function] to throw error including 'no contra "crm_production"' but got 'Failed query: insert into "organizati…'`. Con la mutación, el seed llegó a escribir en la base productiva.
- El archivo se restauró desde una copia en el mismo comando. `cmp` lo dio idéntico y `git status` no muestra cambios en `seeds/`.
- Se volvió a correr sin la mutación: 6 de 6. El `finally` del test borra la base `crm_production` aunque el test falle, así que no quedó ninguna.

### AC-3 — Mutaciones de las guardas sobre los archivos reales de producción

`[transcrito]`: la tabla junta las líneas `Tests` de cada corrida. Cada mutación se aplicó con `sed` sobre el archivo real, se corrió la guarda de ese archivo y se restauró el original desde una copia. Al terminar, `cmp` contra las copias no dio ninguna diferencia.

Antes: `Tests 396 passed (396)` en el proyecto `guards` entero.

| Mutación | Guarda | Después |
| --- | --- | --- |
| `X-Forwarded-For $proxy_add_x_forwarded_for` | proxy | 7 fallan, 34 pasan (41) |
| `set_real_ip_from` en el `server` | proxy | 9 fallan, 32 pasan (41) |
| una segunda `X-Forwarded-For` con `$http_x_forwarded_for` | proxy | 9 fallan, 32 pasan (41) |
| la unidad sin `-H 127.0.0.1` | proxy | 1 falla, 40 pasan (41) |
| la unidad con `User=benja` | proxy | 1 falla, 40 pasan (41) |
| la unidad con el `EnvironmentFile` de staging | proxy | 1 falla, 40 pasan (41) |
| directorio `deploy/demo` sin guarda | proxy | 2 fallan, 39 pasan (41) |
| rotación con `sort -r` | backup | 5 fallan, 110 pasan (115) |
| el cifrado movido después del renombre | backup | 1 falla, 114 pasan (115) |
| sin el control de la clave pública | backup | 1 falla, 114 pasan (115) |
| el dump en claro agregado a la subida | backup | 1 falla, 114 pasan (115) |
| la retención externa sin mínimo | backup | 1 falla, 114 pasan (115) |
| `OnSuccess=` movido a `[Service]` | backup | 1 falla, 114 pasan (115) |
| el backup sin `IPAddressDeny=any` | backup | 1 falla, 114 pasan (115) |
| el timer del backup mensual en vez de diario | backup | 1 falla, 114 pasan (115) |
| `effective_cache_size = 4GB` | postgres | 2 fallan, 33 pasan (35) |
| `random_page_cost = 4` | postgres | 2 fallan, 33 pasan (35) |

**Una mutación no mutó en el primer intento**: la de `sort -r`. `sed` rechazó la expresión mal escapada y el script lo detectó al comparar el archivo contra el original («SIN CAMBIO»), en vez de informarla en verde. Se repitió con una expresión más simple, y la tabla muestra ese segundo resultado.
