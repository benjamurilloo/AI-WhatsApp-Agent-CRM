# Evidencia 11.4 — Piloto en staging

Salidas crudas de la subfase 11.4 ([brief-11.4](brief-11.4-piloto-en-staging.md)). Se escribe a medida que se mide; lo que no está acá **no está medido**. Ningún token aparece en este documento.

## N-5 — `LC_CTYPE` de `crm_staging` (D-9, AC-5)

Medido el 2026-09-25 a las 02:38 UTC, **antes** de desplegar y de migrar. Es de solo lectura.

```
$ ssh crm-staging "date -u +%FT%TZ; sudo -u postgres psql -d crm_staging -tAc \"select datname, datcollate, datctype, pg_encoding_to_char(encoding) from pg_database where datname = 'crm_staging'\"; sudo -u postgres psql -d crm_staging -tAc \"select lower('ÁÉÑ'), upper('áéñ')\"; cd /srv/crm-staging && git rev-parse HEAD"
2026-09-25T02:38:01Z
crm_staging|C.UTF-8|C.UTF-8|UTF8
áéñ|ÁÉÑ
c2edbb55cf2f284d5f23b9810ece17547d6d226e
```

- **`LC_CTYPE` es `C.UTF-8`**, y `lower()` convierte letras fuera de ASCII. La condición de detención de D-9 (una base `C` o `POSIX`) **no se cumple**: se sigue.
- **Lo que no se esperaba**: la *collation* también es `C.UTF-8`. Las bases locales usan `en_US.utf8`. Con `C.UTF-8`, `ORDER BY` compara por código de carácter: «Ávila» va después de «Zapata», y una mayúscula antes que cualquier minúscula. Las listas que ordenan por `lower(nombre)` no sufren lo segundo, pero sí lo primero. **No es bloqueante**; queda como observación para el triage del piloto, con la pregunta de si el orden de las listas en staging coincide con el que el operador espera.
- Staging corría `c2edbb5` en ese momento.
