# Planes — producción, chica

Parámetros: effective_cache_size = 131072 8kB; plan_cache_mode = auto; random_page_cost = 1.1; seq_page_cost = 1; server_version = 18.6 (Ubuntu 18.6-1.pgdg24.04+2); shared_buffers = 16384 8kB; work_mem = 4096 kB.

## catalog.searchProducts (sin texto)

Resultado: 50 filas.

### Consulta 1 de 1

```text
duration: 0.230 ms  plan:
Query Text: select "id", "sku", "name", "description", "unit", "reorder_point", "brand", "category", "condition", "is_active", "created_at", "updated_at" from "products" where ("products"."organization_id" = $1 and "products"."is_active" = $2)
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = 't'
Index Scan using products_organization_sku_lower_unique on products  (cost=0.29..26.06 rows=48 width=172) (actual time=0.020..0.051 rows=50.00 loops=1)
  Index Cond: (organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid)
  Filter: is_active
  Index Searches: 1
  Buffers: shared hit=4
```

## inventory.listProductStock (sin filtro)

Resultado: 25/50 filas.

### Consulta 1 de 2

```text
duration: 0.722 ms  plan:
Query Text: select "id", "sku", "name", "description", "unit", "reorder_point", "brand", "category", "condition", "is_active", "created_at", "updated_at" from "products" where ("products"."organization_id" = $1 and "products"."is_active" = $2)
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = 't'
Index Scan using products_organization_sku_lower_unique on products  (cost=0.29..26.06 rows=48 width=172) (actual time=0.034..0.076 rows=50.00 loops=1)
  Index Cond: (organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid)
  Filter: is_active
  Index Searches: 1
  Buffers: shared hit=4
```

### Consulta 2 de 2

```text
duration: 0.124 ms  plan:
Query Text: select "product_id", "quantity_on_hand" from "inventories" where ("inventories"."organization_id" = $1 and "inventories"."product_id" in ($2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51))
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '5eed0004-0004-4000-8000-000000000000', $3 = '5eed0004-0004-4000-8000-000000000001', $4 = '5eed0004-0004-4000-8000-000000000002', $5 = '5eed0004-0004-4000-8000-000000000003', $6 = '5eed0004-0004-4000-8000-000000000004', $7 = '5eed0004-0004-4000-8000-000000000005', $8 = '5eed0004-0004-4000-8000-000000000006', $9 = '5eed0004-0004-4000-8000-000000000007', $10 = '5eed0004-0004-4000-8000-000000000008', $11 = '5eed0004-0004-4000-8000-000000000009', $12 = '5eed0004-0004-4000-8000-00000000000a', $13 = '5eed0004-0004-4000-8000-00000000000b', $14 = '5eed0004-0004-4000-8000-00000000000c', $15 = '5eed0004-0004-4000-8000-00000000000d', $16 = '5eed0004-0004-4000-8000-00000000000e', $17 = '5eed0004-0004-4000-8000-00000000000f', $18 = '5eed0004-0004-4000-8000-000000000010', $19 = '5eed0004-0004-4000-8000-000000000011', $20 = '5eed0004-0004-4000-8000-000000000012', $21 = '5eed0004-0004-4000-8000-000000000013', $22 = '5eed0004-0004-4000-8000-000000000014', $23 = '5eed0004-0004-4000-8000-000000000015', $24 = '5eed0004-0004-4000-8000-000000000016', $25 = '5eed0004-0004-4000-8000-000000000017', $26 = '5eed0004-0004-4000-8000-000000000018', $27 = '5eed0004-0004-4000-8000-000000000019', $28 = '5eed0004-0004-4000-8000-00000000001a', $29 = '5eed0004-0004-4000-8000-00000000001b', $30 = '5eed0004-0004-4000-8000-00000000001c', $31 = '5eed0004-0004-4000-8000-00000000001d', $32 = '5eed0004-0004-4000-8000-00000000001e', $33 = '5eed0004-0004-4000-8000-00000000001f', $34 = '5eed0004-0004-4000-8000-000000000020', $35 = '5eed0004-0004-4000-8000-000000000021', $36 = '5eed0004-0004-4000-8000-000000000022', $37 = '5eed0004-0004-4000-8000-000000000023', $38 = '5eed0004-0004-4000-8000-000000000024', $39 = '5eed0004-0004-4000-8000-000000000025', $40 = '5eed0004-0004-4000-8000-000000000026', $41 = '5eed0004-0004-4000-8000-000000000027', $42 = '5eed0004-0004-4000-8000-000000000028', $43 = '5eed0004-0004-4000-8000-000000000029', $44 = '5eed0004-0004-4000-8000-00000000002a', $45 = '5eed0004-0004-4000-8000-00000000002b', $46 = '5eed0004-0004-4000-8000-00000000002c', $47 = '5eed0004-0004-4000-8000-00000000002d', $48 = '5eed0004-0004-4000-8000-00000000002e', $49 = '5eed0004-0004-4000-8000-00000000002f', $50 = '5eed0004-0004-4000-8000-000000000030', $51 = '5eed0004-0004-4000-8000-000000000031'
Index Scan using inventories_product_id_unique on inventories  (cost=0.29..23.45 rows=1 width=20) (actual time=0.079..0.098 rows=45.00 loops=1)
  Index Cond: (product_id = ANY ('{5eed0004-0004-4000-8000-000000000000,5eed0004-0004-4000-8000-000000000001,5eed0004-0004-4000-8000-000000000002,5eed0004-0004-4000-8000-000000000003,5eed0004-0004-4000-8000-000000000004,5eed0004-0004-4000-8000-000000000005,5eed0004-0004-4000-8000-000000000006,5eed0004-0004-4000-8000-000000000007,5eed0004-0004-4000-8000-000000000008,5eed0004-0004-4000-8000-000000000009,5eed0004-0004-4000-8000-00000000000a,5eed0004-0004-4000-8000-00000000000b,5eed0004-0004-4000-8000-00000000000c,5eed0004-0004-4000-8000-00000000000d,5eed0004-0004-4000-8000-00000000000e,5eed0004-0004-4000-8000-00000000000f,5eed0004-0004-4000-8000-000000000010,5eed0004-0004-4000-8000-000000000011,5eed0004-0004-4000-8000-000000000012,5eed0004-0004-4000-8000-000000000013,5eed0004-0004-4000-8000-000000000014,5eed0004-0004-4000-8000-000000000015,5eed0004-0004-4000-8000-000000000016,5eed0004-0004-4000-8000-000000000017,5eed0004-0004-4000-8000-000000000018,5eed0004-0004-4000-8000-000000000019,5eed0004-0004-4000-8000-00000000001a,5eed0004-0004-4000-8000-00000000001b,5eed0004-0004-4000-8000-00000000001c,5eed0004-0004-4000-8000-00000000001d,5eed0004-0004-4000-8000-00000000001e,5eed0004-0004-4000-8000-00000000001f,5eed0004-0004-4000-8000-000000000020,5eed0004-0004-4000-8000-000000000021,5eed0004-0004-4000-8000-000000000022,5eed0004-0004-4000-8000-000000000023,5eed0004-0004-4000-8000-000000000024,5eed0004-0004-4000-8000-000000000025,5eed0004-0004-4000-8000-000000000026,5eed0004-0004-4000-8000-000000000027,5eed0004-0004-4000-8000-000000000028,5eed0004-0004-4000-8000-000000000029,5eed0004-0004-4000-8000-00000000002a,5eed0004-0004-4000-8000-00000000002b,5eed0004-0004-4000-8000-00000000002c,5eed0004-0004-4000-8000-00000000002d,5eed0004-0004-4000-8000-00000000002e,5eed0004-0004-4000-8000-00000000002f,5eed0004-0004-4000-8000-000000000030,5eed0004-0004-4000-8000-000000000031}'::uuid[]))
  Filter: (organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid)
  Index Searches: 1
  Buffers: shared hit=4
```

## inventory.listProductStock (página profunda)

Resultado: 25/50 filas.

### Consulta 1 de 2

```text
duration: 0.206 ms  plan:
Query Text: select "id", "sku", "name", "description", "unit", "reorder_point", "brand", "category", "condition", "is_active", "created_at", "updated_at" from "products" where ("products"."organization_id" = $1 and "products"."is_active" = $2)
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = 't'
Index Scan using products_organization_sku_lower_unique on products  (cost=0.29..26.06 rows=48 width=172) (actual time=0.034..0.066 rows=50.00 loops=1)
  Index Cond: (organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid)
  Filter: is_active
  Index Searches: 1
  Buffers: shared hit=4
```

### Consulta 2 de 2

```text
duration: 0.113 ms  plan:
Query Text: select "product_id", "quantity_on_hand" from "inventories" where ("inventories"."organization_id" = $1 and "inventories"."product_id" in ($2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51))
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '5eed0004-0004-4000-8000-000000000000', $3 = '5eed0004-0004-4000-8000-000000000001', $4 = '5eed0004-0004-4000-8000-000000000002', $5 = '5eed0004-0004-4000-8000-000000000003', $6 = '5eed0004-0004-4000-8000-000000000004', $7 = '5eed0004-0004-4000-8000-000000000005', $8 = '5eed0004-0004-4000-8000-000000000006', $9 = '5eed0004-0004-4000-8000-000000000007', $10 = '5eed0004-0004-4000-8000-000000000008', $11 = '5eed0004-0004-4000-8000-000000000009', $12 = '5eed0004-0004-4000-8000-00000000000a', $13 = '5eed0004-0004-4000-8000-00000000000b', $14 = '5eed0004-0004-4000-8000-00000000000c', $15 = '5eed0004-0004-4000-8000-00000000000d', $16 = '5eed0004-0004-4000-8000-00000000000e', $17 = '5eed0004-0004-4000-8000-00000000000f', $18 = '5eed0004-0004-4000-8000-000000000010', $19 = '5eed0004-0004-4000-8000-000000000011', $20 = '5eed0004-0004-4000-8000-000000000012', $21 = '5eed0004-0004-4000-8000-000000000013', $22 = '5eed0004-0004-4000-8000-000000000014', $23 = '5eed0004-0004-4000-8000-000000000015', $24 = '5eed0004-0004-4000-8000-000000000016', $25 = '5eed0004-0004-4000-8000-000000000017', $26 = '5eed0004-0004-4000-8000-000000000018', $27 = '5eed0004-0004-4000-8000-000000000019', $28 = '5eed0004-0004-4000-8000-00000000001a', $29 = '5eed0004-0004-4000-8000-00000000001b', $30 = '5eed0004-0004-4000-8000-00000000001c', $31 = '5eed0004-0004-4000-8000-00000000001d', $32 = '5eed0004-0004-4000-8000-00000000001e', $33 = '5eed0004-0004-4000-8000-00000000001f', $34 = '5eed0004-0004-4000-8000-000000000020', $35 = '5eed0004-0004-4000-8000-000000000021', $36 = '5eed0004-0004-4000-8000-000000000022', $37 = '5eed0004-0004-4000-8000-000000000023', $38 = '5eed0004-0004-4000-8000-000000000024', $39 = '5eed0004-0004-4000-8000-000000000025', $40 = '5eed0004-0004-4000-8000-000000000026', $41 = '5eed0004-0004-4000-8000-000000000027', $42 = '5eed0004-0004-4000-8000-000000000028', $43 = '5eed0004-0004-4000-8000-000000000029', $44 = '5eed0004-0004-4000-8000-00000000002a', $45 = '5eed0004-0004-4000-8000-00000000002b', $46 = '5eed0004-0004-4000-8000-00000000002c', $47 = '5eed0004-0004-4000-8000-00000000002d', $48 = '5eed0004-0004-4000-8000-00000000002e', $49 = '5eed0004-0004-4000-8000-00000000002f', $50 = '5eed0004-0004-4000-8000-000000000030', $51 = '5eed0004-0004-4000-8000-000000000031'
Index Scan using inventories_product_id_unique on inventories  (cost=0.29..23.45 rows=1 width=20) (actual time=0.067..0.088 rows=45.00 loops=1)
  Index Cond: (product_id = ANY ('{5eed0004-0004-4000-8000-000000000000,5eed0004-0004-4000-8000-000000000001,5eed0004-0004-4000-8000-000000000002,5eed0004-0004-4000-8000-000000000003,5eed0004-0004-4000-8000-000000000004,5eed0004-0004-4000-8000-000000000005,5eed0004-0004-4000-8000-000000000006,5eed0004-0004-4000-8000-000000000007,5eed0004-0004-4000-8000-000000000008,5eed0004-0004-4000-8000-000000000009,5eed0004-0004-4000-8000-00000000000a,5eed0004-0004-4000-8000-00000000000b,5eed0004-0004-4000-8000-00000000000c,5eed0004-0004-4000-8000-00000000000d,5eed0004-0004-4000-8000-00000000000e,5eed0004-0004-4000-8000-00000000000f,5eed0004-0004-4000-8000-000000000010,5eed0004-0004-4000-8000-000000000011,5eed0004-0004-4000-8000-000000000012,5eed0004-0004-4000-8000-000000000013,5eed0004-0004-4000-8000-000000000014,5eed0004-0004-4000-8000-000000000015,5eed0004-0004-4000-8000-000000000016,5eed0004-0004-4000-8000-000000000017,5eed0004-0004-4000-8000-000000000018,5eed0004-0004-4000-8000-000000000019,5eed0004-0004-4000-8000-00000000001a,5eed0004-0004-4000-8000-00000000001b,5eed0004-0004-4000-8000-00000000001c,5eed0004-0004-4000-8000-00000000001d,5eed0004-0004-4000-8000-00000000001e,5eed0004-0004-4000-8000-00000000001f,5eed0004-0004-4000-8000-000000000020,5eed0004-0004-4000-8000-000000000021,5eed0004-0004-4000-8000-000000000022,5eed0004-0004-4000-8000-000000000023,5eed0004-0004-4000-8000-000000000024,5eed0004-0004-4000-8000-000000000025,5eed0004-0004-4000-8000-000000000026,5eed0004-0004-4000-8000-000000000027,5eed0004-0004-4000-8000-000000000028,5eed0004-0004-4000-8000-000000000029,5eed0004-0004-4000-8000-00000000002a,5eed0004-0004-4000-8000-00000000002b,5eed0004-0004-4000-8000-00000000002c,5eed0004-0004-4000-8000-00000000002d,5eed0004-0004-4000-8000-00000000002e,5eed0004-0004-4000-8000-00000000002f,5eed0004-0004-4000-8000-000000000030,5eed0004-0004-4000-8000-000000000031}'::uuid[]))
  Filter: (organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid)
  Index Searches: 1
  Buffers: shared hit=4
```

## crm.searchClients (sin texto)

Resultado: 25/50 filas.

### Consulta 1 de 2

```text
duration: 0.071 ms  plan:
Query Text: select count(*) from "clients" where "clients"."organization_id" = $1
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021'
Aggregate  (cost=2.39..2.40 rows=1 width=8) (actual time=0.066..0.067 rows=1.00 loops=1)
  Buffers: shared hit=4
  ->  Index Only Scan using clients_organization_display_name_unaccent_idx on clients  (cost=0.29..2.26 rows=50 width=0) (actual time=0.040..0.054 rows=50.00 loops=1)
        Index Cond: (organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid)
        Heap Fetches: 0
        Index Searches: 1
        Buffers: shared hit=4
```

### Consulta 2 de 2

```text
duration: 0.235 ms  plan:
Query Text: select "id", "display_name", "phone_e164", "notes", "is_active", "created_at", "updated_at" from "clients" where "clients"."organization_id" = $1 order by lower("clients"."display_name"), "clients"."id" asc limit $2
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '25'
Limit  (cost=26.07..26.13 rows=25 width=131) (actual time=0.187..0.193 rows=25.00 loops=1)
  Buffers: shared hit=15
  ->  Sort  (cost=26.07..26.20 rows=50 width=131) (actual time=0.185..0.188 rows=25.00 loops=1)
        Sort Key: (lower(display_name)), id
        Sort Method: quicksort  Memory: 31kB
        Buffers: shared hit=15
        ->  Index Scan using clients_organization_display_name_unaccent_idx on clients  (cost=0.29..24.66 rows=50 width=131) (actual time=0.050..0.132 rows=50.00 loops=1)
              Index Cond: (organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid)
              Index Searches: 1
              Buffers: shared hit=15
```

## crm.searchClients (página profunda)

Resultado: 25/50 filas.

### Consulta 1 de 2

```text
duration: 0.059 ms  plan:
Query Text: select count(*) from "clients" where "clients"."organization_id" = $1
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021'
Aggregate  (cost=2.39..2.40 rows=1 width=8) (actual time=0.055..0.056 rows=1.00 loops=1)
  Buffers: shared hit=4
  ->  Index Only Scan using clients_organization_display_name_unaccent_idx on clients  (cost=0.29..2.26 rows=50 width=0) (actual time=0.028..0.043 rows=50.00 loops=1)
        Index Cond: (organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid)
        Heap Fetches: 0
        Index Searches: 1
        Buffers: shared hit=4
```

### Consulta 2 de 2

```text
duration: 0.224 ms  plan:
Query Text: select "id", "display_name", "phone_e164", "notes", "is_active", "created_at", "updated_at" from "clients" where "clients"."organization_id" = $1 order by lower("clients"."display_name"), "clients"."id" asc limit $2 offset $3
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '25', $3 = '25'
Limit  (cost=26.13..26.20 rows=25 width=131) (actual time=0.179..0.185 rows=25.00 loops=1)
  Buffers: shared hit=15
  ->  Sort  (cost=26.07..26.20 rows=50 width=131) (actual time=0.173..0.178 rows=50.00 loops=1)
        Sort Key: (lower(display_name)), id
        Sort Method: quicksort  Memory: 31kB
        Buffers: shared hit=15
        ->  Index Scan using clients_organization_display_name_unaccent_idx on clients  (cost=0.29..24.66 rows=50 width=131) (actual time=0.043..0.123 rows=50.00 loops=1)
              Index Cond: (organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid)
              Index Searches: 1
              Buffers: shared hit=15
```

## crm.searchClients (prefijo de nombre)

Resultado: 5/5 filas.

### Consulta 1 de 4

```text
duration: 2.022 ms  plan:
Query Text:  SELECT public.unaccent('public.unaccent'::regdictionary, $1) 
Query Parameters: $1 = 'ana%'
Result  (cost=0.00..0.01 rows=1 width=32) (actual time=2.016..2.016 rows=1.00 loops=1)
  Buffers: shared hit=12
```

### Consulta 2 de 4

```text
duration: 0.154 ms  plan:
Query Text: select count(*) from "clients" where ("clients"."organization_id" = $1 and immutable_unaccent(lower("clients"."display_name")) like immutable_unaccent(lower($2)))
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = 'ana%'
Aggregate  (cost=5.81..5.82 rows=1 width=8) (actual time=0.150..0.151 rows=1.00 loops=1)
  Buffers: shared hit=5
  ->  Index Scan using clients_organization_display_name_unaccent_idx on clients  (cost=0.29..5.80 rows=5 width=0) (actual time=0.101..0.145 rows=5.00 loops=1)
        Index Cond: ((organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid) AND (immutable_unaccent(lower(display_name)) ~>=~ 'ana'::text) AND (immutable_unaccent(lower(display_name)) ~<~ 'anb'::text))
        Filter: (immutable_unaccent(lower(display_name)) ~~ 'ana%'::text)
        Index Searches: 1
        Buffers: shared hit=5
```

### Consulta 3 de 4

```text
duration: 0.007 ms  plan:
Query Text:  SELECT public.unaccent('public.unaccent'::regdictionary, $1) 
Query Parameters: $1 = 'ana%'
Result  (cost=0.00..0.01 rows=1 width=32) (actual time=0.004..0.004 rows=1.00 loops=1)
```

### Consulta 4 de 4

```text
duration: 0.143 ms  plan:
Query Text: select "id", "display_name", "phone_e164", "notes", "is_active", "created_at", "updated_at" from "clients" where ("clients"."organization_id" = $1 and immutable_unaccent(lower("clients"."display_name")) like immutable_unaccent(lower($2))) order by lower("clients"."display_name"), "clients"."id" asc limit $3
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = 'ana%', $3 = '25'
Limit  (cost=5.87..5.88 rows=5 width=131) (actual time=0.118..0.122 rows=5.00 loops=1)
  Buffers: shared hit=5
  ->  Sort  (cost=5.87..5.88 rows=5 width=131) (actual time=0.117..0.119 rows=5.00 loops=1)
        Sort Key: (lower(display_name)), id
        Sort Method: quicksort  Memory: 25kB
        Buffers: shared hit=5
        ->  Index Scan using clients_organization_display_name_unaccent_idx on clients  (cost=0.29..5.81 rows=5 width=131) (actual time=0.067..0.094 rows=5.00 loops=1)
              Index Cond: ((organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid) AND (immutable_unaccent(lower(display_name)) ~>=~ 'ana'::text) AND (immutable_unaccent(lower(display_name)) ~<~ 'anb'::text))
              Filter: (immutable_unaccent(lower(display_name)) ~~ 'ana%'::text)
              Index Searches: 1
              Buffers: shared hit=5
```

## conversations.listConversations

Resultado: 25/50 filas.

### Consulta 1 de 5

```text
duration: 0.022 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.018..0.019 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.016..0.016 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0004-4000-8000-000000000021'::uuid)
        Rows Removed by Filter: 4
        Buffers: shared hit=1
```

### Consulta 2 de 5

```text
duration: 0.109 ms  plan:
Query Text: select count(*) from "conversations" where "conversations"."organization_id" = $1
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021'
Aggregate  (cost=2.39..2.40 rows=1 width=8) (actual time=0.079..0.080 rows=1.00 loops=1)
  Buffers: shared hit=5
  ->  Index Only Scan using conversations_organization_started_idx on conversations  (cost=0.29..2.26 rows=50 width=0) (actual time=0.050..0.067 rows=50.00 loops=1)
        Index Cond: (organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid)
        Heap Fetches: 29
        Index Searches: 1
        Buffers: shared hit=5
```

### Consulta 3 de 5

```text
duration: 0.158 ms  plan:
Query Text: select "id", "client_id", "channel", "status", "started_at", "last_message_at" from "conversations" where "conversations"."organization_id" = $1 order by "conversations"."last_message_at" desc nulls last, "conversations"."id" desc limit $2
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '25'
Limit  (cost=0.79..14.03 rows=25 width=56) (actual time=0.083..0.089 rows=25.00 loops=1)
  Buffers: shared hit=29
  ->  Incremental Sort  (cost=0.79..27.27 rows=50 width=56) (actual time=0.081..0.084 rows=25.00 loops=1)
        Sort Key: last_message_at DESC NULLS LAST, id DESC
        Presorted Key: last_message_at
        Full-sort Groups: 1  Sort Method: quicksort  Average Memory: 28kB  Peak Memory: 28kB
        Buffers: shared hit=29
        ->  Index Scan using conversations_organization_last_message_idx on conversations  (cost=0.29..25.02 rows=50 width=56) (actual time=0.019..0.045 rows=26.00 loops=1)
              Index Cond: (organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid)
              Index Searches: 1
              Buffers: shared hit=26
```

### Consulta 4 de 5

```text
duration: 0.097 ms  plan:
Query Text: select "id", "display_name", "phone_e164", "notes", "is_active", "created_at", "updated_at" from "clients" where ("clients"."organization_id" = $1 and "clients"."id" in ($2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20))
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '5eed0001-0004-4000-8000-000000000004', $3 = '5eed0001-0004-4000-8000-000000000013', $4 = '5eed0001-0004-4000-8000-000000000024', $5 = '5eed0001-0004-4000-8000-000000000022', $6 = '5eed0001-0004-4000-8000-00000000001c', $7 = '5eed0001-0004-4000-8000-000000000010', $8 = '5eed0001-0004-4000-8000-000000000011', $9 = '5eed0001-0004-4000-8000-000000000030', $10 = '5eed0001-0004-4000-8000-000000000014', $11 = '5eed0001-0004-4000-8000-000000000029', $12 = '5eed0001-0004-4000-8000-000000000026', $13 = '5eed0001-0004-4000-8000-000000000023', $14 = '5eed0001-0004-4000-8000-000000000017', $15 = '5eed0001-0004-4000-8000-00000000000a', $16 = '5eed0001-0004-4000-8000-00000000001f', $17 = '5eed0001-0004-4000-8000-000000000003', $18 = '5eed0001-0004-4000-8000-00000000000c', $19 = '5eed0001-0004-4000-8000-00000000002b', $20 = '5eed0001-0004-4000-8000-00000000002d'
Index Scan using clients_organization_display_name_unaccent_idx on clients  (cost=0.33..24.83 rows=1 width=99) (actual time=0.033..0.065 rows=19.00 loops=1)
  Index Cond: (organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid)
  Filter: (id = ANY ('{5eed0001-0004-4000-8000-000000000004,5eed0001-0004-4000-8000-000000000013,5eed0001-0004-4000-8000-000000000024,5eed0001-0004-4000-8000-000000000022,5eed0001-0004-4000-8000-00000000001c,5eed0001-0004-4000-8000-000000000010,5eed0001-0004-4000-8000-000000000011,5eed0001-0004-4000-8000-000000000030,5eed0001-0004-4000-8000-000000000014,5eed0001-0004-4000-8000-000000000029,5eed0001-0004-4000-8000-000000000026,5eed0001-0004-4000-8000-000000000023,5eed0001-0004-4000-8000-000000000017,5eed0001-0004-4000-8000-00000000000a,5eed0001-0004-4000-8000-00000000001f,5eed0001-0004-4000-8000-000000000003,5eed0001-0004-4000-8000-00000000000c,5eed0001-0004-4000-8000-00000000002b,5eed0001-0004-4000-8000-00000000002d}'::uuid[]))
  Rows Removed by Filter: 31
  Index Searches: 1
  Buffers: shared hit=15
```

### Consulta 5 de 5

```text
duration: 0.370 ms  plan:
Query Text: select "conversation_id", count(*) from "messages" where ("messages"."organization_id" = $1 and "messages"."conversation_id" in ($2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)) group by "messages"."conversation_id"
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '5eed0002-0004-4000-8000-00000000001c', $3 = '5eed0002-0004-4000-8000-000000000031', $4 = '5eed0002-0004-4000-8000-00000000001a', $5 = '5eed0002-0004-4000-8000-000000000007', $6 = '5eed0002-0004-4000-8000-000000000023', $7 = '5eed0002-0004-4000-8000-000000000008', $8 = '5eed0002-0004-4000-8000-000000000030', $9 = '5eed0002-0004-4000-8000-00000000001e', $10 = '5eed0002-0004-4000-8000-00000000002d', $11 = '5eed0002-0004-4000-8000-000000000011', $12 = '5eed0002-0004-4000-8000-000000000020', $13 = '5eed0002-0004-4000-8000-000000000006', $14 = '5eed0002-0004-4000-8000-000000000025', $15 = '5eed0002-0004-4000-8000-00000000000d', $16 = '5eed0002-0004-4000-8000-000000000021', $17 = '5eed0002-0004-4000-8000-000000000001', $18 = '5eed0002-0004-4000-8000-000000000022', $19 = '5eed0002-0004-4000-8000-000000000005', $20 = '5eed0002-0004-4000-8000-00000000000a', $21 = '5eed0002-0004-4000-8000-000000000026', $22 = '5eed0002-0004-4000-8000-000000000004', $23 = '5eed0002-0004-4000-8000-000000000015', $24 = '5eed0002-0004-4000-8000-000000000014', $25 = '5eed0002-0004-4000-8000-000000000029', $26 = '5eed0002-0004-4000-8000-000000000002'
GroupAggregate  (cost=45.66..45.68 rows=1 width=24) (actual time=0.306..0.346 rows=25.00 loops=1)
  Group Key: conversation_id
  Buffers: shared hit=18
  ->  Sort  (cost=45.66..45.66 rows=1 width=16) (actual time=0.292..0.305 rows=124.00 loops=1)
        Sort Key: conversation_id
        Sort Method: quicksort  Memory: 25kB
        Buffers: shared hit=18
        ->  Bitmap Heap Scan on messages  (cost=44.53..45.65 rows=1 width=16) (actual time=0.202..0.240 rows=124.00 loops=1)
              Recheck Cond: ((organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid) AND (conversation_id = ANY ('{5eed0002-0004-4000-8000-00000000001c,5eed0002-0004-4000-8000-000000000031,5eed0002-0004-4000-8000-00000000001a,5eed0002-0004-4000-8000-000000000007,5eed0002-0004-4000-8000-000000000023,5eed0002-0004-4000-8000-000000000008,5eed0002-0004-4000-8000-000000000030,5eed0002-0004-4000-8000-00000000001e,5eed0002-0004-4000-8000-00000000002d,5eed0002-0004-4000-8000-000000000011,5eed0002-0004-4000-8000-000000000020,5eed0002-0004-4000-8000-000000000006,5eed0002-0004-4000-8000-000000000025,5eed0002-0004-4000-8000-00000000000d,5eed0002-0004-4000-8000-000000000021,5eed0002-0004-4000-8000-000000000001,5eed0002-0004-4000-8000-000000000022,5eed0002-0004-4000-8000-000000000005,5eed0002-0004-4000-8000-00000000000a,5eed0002-0004-4000-8000-000000000026,5eed0002-0004-4000-8000-000000000004,5eed0002-0004-4000-8000-000000000015,5eed0002-0004-4000-8000-000000000014,5eed0002-0004-4000-8000-000000000029,5eed0002-0004-4000-8000-000000000002}'::uuid[])))
              Heap Blocks: exact=5
              Buffers: shared hit=15
              ->  BitmapAnd  (cost=44.47..44.47 rows=1 width=0) (actual time=0.173..0.174 rows=0.00 loops=1)
                    Buffers: shared hit=10
                    ->  Bitmap Index Scan on messages_organization_sent_idx  (cost=0.00..4.78 rows=288 width=0) (actual time=0.091..0.091 rows=265.00 loops=1)
                          Index Cond: (organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid)
                          Index Searches: 1
                          Buffers: shared hit=4
                    ->  Bitmap Index Scan on messages_conversation_sent_idx  (cost=0.00..39.44 rows=201 width=0) (actual time=0.078..0.078 rows=130.00 loops=1)
                          Index Cond: (conversation_id = ANY ('{5eed0002-0004-4000-8000-00000000001c,5eed0002-0004-4000-8000-000000000031,5eed0002-0004-4000-8000-00000000001a,5eed0002-0004-4000-8000-000000000007,5eed0002-0004-4000-8000-000000000023,5eed0002-0004-4000-8000-000000000008,5eed0002-0004-4000-8000-000000000030,5eed0002-0004-4000-8000-00000000001e,5eed0002-0004-4000-8000-00000000002d,5eed0002-0004-4000-8000-000000000011,5eed0002-0004-4000-8000-000000000020,5eed0002-0004-4000-8000-000000000006,5eed0002-0004-4000-8000-000000000025,5eed0002-0004-4000-8000-00000000000d,5eed0002-0004-4000-8000-000000000021,5eed0002-0004-4000-8000-000000000001,5eed0002-0004-4000-8000-000000000022,5eed0002-0004-4000-8000-000000000005,5eed0002-0004-4000-8000-00000000000a,5eed0002-0004-4000-8000-000000000026,5eed0002-0004-4000-8000-000000000004,5eed0002-0004-4000-8000-000000000015,5eed0002-0004-4000-8000-000000000014,5eed0002-0004-4000-8000-000000000029,5eed0002-0004-4000-8000-000000000002}'::uuid[]))
                          Index Searches: 2
                          Buffers: shared hit=6
```

## conversations.searchClientsByLastInteraction

Resultado: 25/50 filas.

### Consulta 1 de 4

```text
duration: 0.330 ms  plan:
Query Text: select "id" from "clients" where "clients"."organization_id" = $1 order by lower("clients"."display_name"), "clients"."id" asc
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021'
Sort  (cost=26.07..26.20 rows=50 width=48) (actual time=0.303..0.308 rows=50.00 loops=1)
  Sort Key: (lower(display_name)), id
  Sort Method: quicksort  Memory: 27kB
  Buffers: shared hit=18
  ->  Index Scan using clients_organization_display_name_unaccent_idx on clients  (cost=0.29..24.66 rows=50 width=48) (actual time=0.059..0.186 rows=50.00 loops=1)
        Index Cond: (organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid)
        Index Searches: 1
        Buffers: shared hit=15
```

### Consulta 2 de 4

```text
duration: 0.189 ms  plan:
Query Text: select "client_id", max("last_message_at") from "conversations" where ("conversations"."organization_id" = $1 and "conversations"."client_id" is not null and "conversations"."last_message_at" is not null) group by "conversations"."client_id"
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021'
GroupAggregate  (cost=0.29..2.89 rows=40 width=24) (actual time=0.124..0.159 rows=27.00 loops=1)
  Group Key: client_id
  Buffers: shared hit=7
  ->  Index Only Scan using conversations_organization_client_last_message_idx on conversations  (cost=0.29..2.29 rows=40 width=24) (actual time=0.111..0.129 rows=39.00 loops=1)
        Index Cond: ((organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid) AND (client_id IS NOT NULL) AND (last_message_at IS NOT NULL))
        Heap Fetches: 17
        Index Searches: 1
        Buffers: shared hit=7
```

### Consulta 3 de 4

```text
duration: 0.112 ms  plan:
Query Text: select "id", "display_name", "phone_e164", "notes", "is_active", "created_at", "updated_at" from "clients" where ("clients"."organization_id" = $1 and "clients"."id" in ($2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26))
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '5eed0001-0004-4000-8000-000000000004', $3 = '5eed0001-0004-4000-8000-000000000013', $4 = '5eed0001-0004-4000-8000-000000000024', $5 = '5eed0001-0004-4000-8000-000000000022', $6 = '5eed0001-0004-4000-8000-00000000001c', $7 = '5eed0001-0004-4000-8000-000000000010', $8 = '5eed0001-0004-4000-8000-000000000011', $9 = '5eed0001-0004-4000-8000-000000000030', $10 = '5eed0001-0004-4000-8000-000000000014', $11 = '5eed0001-0004-4000-8000-000000000029', $12 = '5eed0001-0004-4000-8000-000000000026', $13 = '5eed0001-0004-4000-8000-000000000023', $14 = '5eed0001-0004-4000-8000-000000000017', $15 = '5eed0001-0004-4000-8000-00000000000a', $16 = '5eed0001-0004-4000-8000-00000000001f', $17 = '5eed0001-0004-4000-8000-000000000003', $18 = '5eed0001-0004-4000-8000-00000000000c', $19 = '5eed0001-0004-4000-8000-00000000002b', $20 = '5eed0001-0004-4000-8000-00000000002d', $21 = '5eed0001-0004-4000-8000-000000000018', $22 = '5eed0001-0004-4000-8000-000000000005', $23 = '5eed0001-0004-4000-8000-00000000000d', $24 = '5eed0001-0004-4000-8000-00000000001a', $25 = '5eed0001-0004-4000-8000-00000000001b', $26 = '5eed0001-0004-4000-8000-000000000008'
Index Scan using clients_organization_display_name_unaccent_idx on clients  (cost=0.35..24.85 rows=1 width=99) (actual time=0.040..0.073 rows=25.00 loops=1)
  Index Cond: (organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid)
  Filter: (id = ANY ('{5eed0001-0004-4000-8000-000000000004,5eed0001-0004-4000-8000-000000000013,5eed0001-0004-4000-8000-000000000024,5eed0001-0004-4000-8000-000000000022,5eed0001-0004-4000-8000-00000000001c,5eed0001-0004-4000-8000-000000000010,5eed0001-0004-4000-8000-000000000011,5eed0001-0004-4000-8000-000000000030,5eed0001-0004-4000-8000-000000000014,5eed0001-0004-4000-8000-000000000029,5eed0001-0004-4000-8000-000000000026,5eed0001-0004-4000-8000-000000000023,5eed0001-0004-4000-8000-000000000017,5eed0001-0004-4000-8000-00000000000a,5eed0001-0004-4000-8000-00000000001f,5eed0001-0004-4000-8000-000000000003,5eed0001-0004-4000-8000-00000000000c,5eed0001-0004-4000-8000-00000000002b,5eed0001-0004-4000-8000-00000000002d,5eed0001-0004-4000-8000-000000000018,5eed0001-0004-4000-8000-000000000005,5eed0001-0004-4000-8000-00000000000d,5eed0001-0004-4000-8000-00000000001a,5eed0001-0004-4000-8000-00000000001b,5eed0001-0004-4000-8000-000000000008}'::uuid[]))
  Rows Removed by Filter: 25
  Index Searches: 1
  Buffers: shared hit=15
```

### Consulta 4 de 4

```text
duration: 0.024 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.020..0.020 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.018..0.018 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0004-4000-8000-000000000021'::uuid)
        Rows Removed by Filter: 4
        Buffers: shared hit=1
```

## organizations.listMembers

Resultado: 6/6 filas.

### Consulta 1 de 2

```text
duration: 0.075 ms  plan:
Query Text: select "id", "user_id", "role", "created_at" from "organization_members" where "organization_members"."organization_id" = $1
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021'
Index Scan using organization_members_organization_id_idx on organization_members  (cost=0.15..2.45 rows=6 width=44) (actual time=0.026..0.030 rows=6.00 loops=1)
  Index Cond: (organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid)
  Index Searches: 1
  Buffers: shared hit=2
```

### Consulta 2 de 2

```text
duration: 0.068 ms  plan:
Query Text: select "id", "name", "email", "is_active" from "users" where "users"."id" in ($1, $2, $3, $4, $5, $6)
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000022', $2 = '5eed0007-0004-4000-8000-000000000000', $3 = '5eed0007-0004-4000-8000-000000000001', $4 = '5eed0007-0004-4000-8000-000000000002', $5 = '5eed0007-0004-4000-8000-000000000003', $6 = '5eed0007-0004-4000-8000-000000000004'
Index Scan using users_pkey on users  (cost=0.28..5.28 rows=6 width=62) (actual time=0.038..0.059 rows=6.00 loops=1)
  Index Cond: (id = ANY ('{5eed0000-0004-4000-8000-000000000022,5eed0007-0004-4000-8000-000000000000,5eed0007-0004-4000-8000-000000000001,5eed0007-0004-4000-8000-000000000002,5eed0007-0004-4000-8000-000000000003,5eed0007-0004-4000-8000-000000000004}'::uuid[]))
  Index Searches: 2
  Buffers: shared hit=5
```

## inventory.listProductStock (última página)

Resultado: 25/50 filas.

### Consulta 1 de 2

```text
duration: 0.634 ms  plan:
Query Text: select "id", "sku", "name", "description", "unit", "reorder_point", "brand", "category", "condition", "is_active", "created_at", "updated_at" from "products" where ("products"."organization_id" = $1 and "products"."is_active" = $2)
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = 't'
Index Scan using products_organization_sku_lower_unique on products  (cost=0.29..26.06 rows=48 width=172) (actual time=0.034..0.096 rows=50.00 loops=1)
  Index Cond: (organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid)
  Filter: is_active
  Index Searches: 1
  Buffers: shared hit=4
```

### Consulta 2 de 2

```text
duration: 0.109 ms  plan:
Query Text: select "product_id", "quantity_on_hand" from "inventories" where ("inventories"."organization_id" = $1 and "inventories"."product_id" in ($2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51))
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '5eed0004-0004-4000-8000-000000000000', $3 = '5eed0004-0004-4000-8000-000000000001', $4 = '5eed0004-0004-4000-8000-000000000002', $5 = '5eed0004-0004-4000-8000-000000000003', $6 = '5eed0004-0004-4000-8000-000000000004', $7 = '5eed0004-0004-4000-8000-000000000005', $8 = '5eed0004-0004-4000-8000-000000000006', $9 = '5eed0004-0004-4000-8000-000000000007', $10 = '5eed0004-0004-4000-8000-000000000008', $11 = '5eed0004-0004-4000-8000-000000000009', $12 = '5eed0004-0004-4000-8000-00000000000a', $13 = '5eed0004-0004-4000-8000-00000000000b', $14 = '5eed0004-0004-4000-8000-00000000000c', $15 = '5eed0004-0004-4000-8000-00000000000d', $16 = '5eed0004-0004-4000-8000-00000000000e', $17 = '5eed0004-0004-4000-8000-00000000000f', $18 = '5eed0004-0004-4000-8000-000000000010', $19 = '5eed0004-0004-4000-8000-000000000011', $20 = '5eed0004-0004-4000-8000-000000000012', $21 = '5eed0004-0004-4000-8000-000000000013', $22 = '5eed0004-0004-4000-8000-000000000014', $23 = '5eed0004-0004-4000-8000-000000000015', $24 = '5eed0004-0004-4000-8000-000000000016', $25 = '5eed0004-0004-4000-8000-000000000017', $26 = '5eed0004-0004-4000-8000-000000000018', $27 = '5eed0004-0004-4000-8000-000000000019', $28 = '5eed0004-0004-4000-8000-00000000001a', $29 = '5eed0004-0004-4000-8000-00000000001b', $30 = '5eed0004-0004-4000-8000-00000000001c', $31 = '5eed0004-0004-4000-8000-00000000001d', $32 = '5eed0004-0004-4000-8000-00000000001e', $33 = '5eed0004-0004-4000-8000-00000000001f', $34 = '5eed0004-0004-4000-8000-000000000020', $35 = '5eed0004-0004-4000-8000-000000000021', $36 = '5eed0004-0004-4000-8000-000000000022', $37 = '5eed0004-0004-4000-8000-000000000023', $38 = '5eed0004-0004-4000-8000-000000000024', $39 = '5eed0004-0004-4000-8000-000000000025', $40 = '5eed0004-0004-4000-8000-000000000026', $41 = '5eed0004-0004-4000-8000-000000000027', $42 = '5eed0004-0004-4000-8000-000000000028', $43 = '5eed0004-0004-4000-8000-000000000029', $44 = '5eed0004-0004-4000-8000-00000000002a', $45 = '5eed0004-0004-4000-8000-00000000002b', $46 = '5eed0004-0004-4000-8000-00000000002c', $47 = '5eed0004-0004-4000-8000-00000000002d', $48 = '5eed0004-0004-4000-8000-00000000002e', $49 = '5eed0004-0004-4000-8000-00000000002f', $50 = '5eed0004-0004-4000-8000-000000000030', $51 = '5eed0004-0004-4000-8000-000000000031'
Index Scan using inventories_product_id_unique on inventories  (cost=0.29..23.45 rows=1 width=20) (actual time=0.043..0.083 rows=45.00 loops=1)
  Index Cond: (product_id = ANY ('{5eed0004-0004-4000-8000-000000000000,5eed0004-0004-4000-8000-000000000001,5eed0004-0004-4000-8000-000000000002,5eed0004-0004-4000-8000-000000000003,5eed0004-0004-4000-8000-000000000004,5eed0004-0004-4000-8000-000000000005,5eed0004-0004-4000-8000-000000000006,5eed0004-0004-4000-8000-000000000007,5eed0004-0004-4000-8000-000000000008,5eed0004-0004-4000-8000-000000000009,5eed0004-0004-4000-8000-00000000000a,5eed0004-0004-4000-8000-00000000000b,5eed0004-0004-4000-8000-00000000000c,5eed0004-0004-4000-8000-00000000000d,5eed0004-0004-4000-8000-00000000000e,5eed0004-0004-4000-8000-00000000000f,5eed0004-0004-4000-8000-000000000010,5eed0004-0004-4000-8000-000000000011,5eed0004-0004-4000-8000-000000000012,5eed0004-0004-4000-8000-000000000013,5eed0004-0004-4000-8000-000000000014,5eed0004-0004-4000-8000-000000000015,5eed0004-0004-4000-8000-000000000016,5eed0004-0004-4000-8000-000000000017,5eed0004-0004-4000-8000-000000000018,5eed0004-0004-4000-8000-000000000019,5eed0004-0004-4000-8000-00000000001a,5eed0004-0004-4000-8000-00000000001b,5eed0004-0004-4000-8000-00000000001c,5eed0004-0004-4000-8000-00000000001d,5eed0004-0004-4000-8000-00000000001e,5eed0004-0004-4000-8000-00000000001f,5eed0004-0004-4000-8000-000000000020,5eed0004-0004-4000-8000-000000000021,5eed0004-0004-4000-8000-000000000022,5eed0004-0004-4000-8000-000000000023,5eed0004-0004-4000-8000-000000000024,5eed0004-0004-4000-8000-000000000025,5eed0004-0004-4000-8000-000000000026,5eed0004-0004-4000-8000-000000000027,5eed0004-0004-4000-8000-000000000028,5eed0004-0004-4000-8000-000000000029,5eed0004-0004-4000-8000-00000000002a,5eed0004-0004-4000-8000-00000000002b,5eed0004-0004-4000-8000-00000000002c,5eed0004-0004-4000-8000-00000000002d,5eed0004-0004-4000-8000-00000000002e,5eed0004-0004-4000-8000-00000000002f,5eed0004-0004-4000-8000-000000000030,5eed0004-0004-4000-8000-000000000031}'::uuid[]))
  Filter: (organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid)
  Index Searches: 1
  Buffers: shared hit=4
```

## crm.searchClients (última página)

Resultado: 25/50 filas.

### Consulta 1 de 2

```text
duration: 0.060 ms  plan:
Query Text: select count(*) from "clients" where "clients"."organization_id" = $1
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021'
Aggregate  (cost=2.39..2.40 rows=1 width=8) (actual time=0.055..0.056 rows=1.00 loops=1)
  Buffers: shared hit=4
  ->  Index Only Scan using clients_organization_display_name_unaccent_idx on clients  (cost=0.29..2.26 rows=50 width=0) (actual time=0.028..0.043 rows=50.00 loops=1)
        Index Cond: (organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid)
        Heap Fetches: 0
        Index Searches: 1
        Buffers: shared hit=4
```

### Consulta 2 de 2

```text
duration: 0.258 ms  plan:
Query Text: select "id", "display_name", "phone_e164", "notes", "is_active", "created_at", "updated_at" from "clients" where "clients"."organization_id" = $1 order by lower("clients"."display_name"), "clients"."id" asc limit $2 offset $3
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '25', $3 = '25'
Limit  (cost=26.13..26.20 rows=25 width=131) (actual time=0.190..0.196 rows=25.00 loops=1)
  Buffers: shared hit=15
  ->  Sort  (cost=26.07..26.20 rows=50 width=131) (actual time=0.185..0.190 rows=50.00 loops=1)
        Sort Key: (lower(display_name)), id
        Sort Method: quicksort  Memory: 31kB
        Buffers: shared hit=15
        ->  Index Scan using clients_organization_display_name_unaccent_idx on clients  (cost=0.29..24.66 rows=50 width=131) (actual time=0.046..0.132 rows=50.00 loops=1)
              Index Cond: (organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid)
              Index Searches: 1
              Buffers: shared hit=15
```

## conversations.listConversations (última página)

Resultado: 25/50 filas.

### Consulta 1 de 5

```text
duration: 0.027 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.023..0.024 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.021..0.021 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0004-4000-8000-000000000021'::uuid)
        Rows Removed by Filter: 4
        Buffers: shared hit=1
```

### Consulta 2 de 5

```text
duration: 0.088 ms  plan:
Query Text: select count(*) from "conversations" where "conversations"."organization_id" = $1
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021'
Aggregate  (cost=2.39..2.40 rows=1 width=8) (actual time=0.083..0.083 rows=1.00 loops=1)
  Buffers: shared hit=4
  ->  Index Only Scan using conversations_organization_started_idx on conversations  (cost=0.29..2.26 rows=50 width=0) (actual time=0.056..0.069 rows=50.00 loops=1)
        Index Cond: (organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid)
        Heap Fetches: 23
        Index Searches: 1
        Buffers: shared hit=4
```

### Consulta 3 de 5

```text
duration: 0.173 ms  plan:
Query Text: select "id", "client_id", "channel", "status", "started_at", "last_message_at" from "conversations" where "conversations"."organization_id" = $1 order by "conversations"."last_message_at" desc nulls last, "conversations"."id" desc limit $2 offset $3
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '25', $3 = '25'
Limit  (cost=14.03..27.27 rows=25 width=56) (actual time=0.111..0.133 rows=25.00 loops=1)
  Buffers: shared hit=36
  ->  Incremental Sort  (cost=0.79..27.27 rows=50 width=56) (actual time=0.106..0.126 rows=50.00 loops=1)
        Sort Key: last_message_at DESC NULLS LAST, id DESC
        Presorted Key: last_message_at
        Full-sort Groups: 2  Sort Method: quicksort  Average Memory: 28kB  Peak Memory: 28kB
        Buffers: shared hit=36
        ->  Index Scan using conversations_organization_last_message_idx on conversations  (cost=0.29..25.02 rows=50 width=56) (actual time=0.032..0.091 rows=50.00 loops=1)
              Index Cond: (organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid)
              Index Searches: 1
              Buffers: shared hit=36
```

### Consulta 4 de 5

```text
duration: 0.101 ms  plan:
Query Text: select "id", "display_name", "phone_e164", "notes", "is_active", "created_at", "updated_at" from "clients" where ("clients"."organization_id" = $1 and "clients"."id" in ($2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18))
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '5eed0001-0004-4000-8000-000000000018', $3 = '5eed0001-0004-4000-8000-000000000014', $4 = '5eed0001-0004-4000-8000-000000000005', $5 = '5eed0001-0004-4000-8000-000000000023', $6 = '5eed0001-0004-4000-8000-000000000030', $7 = '5eed0001-0004-4000-8000-00000000000d', $8 = '5eed0001-0004-4000-8000-00000000002d', $9 = '5eed0001-0004-4000-8000-00000000001a', $10 = '5eed0001-0004-4000-8000-00000000001b', $11 = '5eed0001-0004-4000-8000-00000000002b', $12 = '5eed0001-0004-4000-8000-000000000008', $13 = '5eed0001-0004-4000-8000-00000000001c', $14 = '5eed0001-0004-4000-8000-00000000001f', $15 = '5eed0001-0004-4000-8000-000000000028', $16 = '5eed0001-0004-4000-8000-00000000000f', $17 = '5eed0001-0004-4000-8000-00000000000c', $18 = '5eed0001-0004-4000-8000-00000000000a'
Index Scan using clients_pkey on clients  (cost=0.29..22.79 rows=1 width=99) (actual time=0.060..0.072 rows=17.00 loops=1)
  Index Cond: (id = ANY ('{5eed0001-0004-4000-8000-000000000018,5eed0001-0004-4000-8000-000000000014,5eed0001-0004-4000-8000-000000000005,5eed0001-0004-4000-8000-000000000023,5eed0001-0004-4000-8000-000000000030,5eed0001-0004-4000-8000-00000000000d,5eed0001-0004-4000-8000-00000000002d,5eed0001-0004-4000-8000-00000000001a,5eed0001-0004-4000-8000-00000000001b,5eed0001-0004-4000-8000-00000000002b,5eed0001-0004-4000-8000-000000000008,5eed0001-0004-4000-8000-00000000001c,5eed0001-0004-4000-8000-00000000001f,5eed0001-0004-4000-8000-000000000028,5eed0001-0004-4000-8000-00000000000f,5eed0001-0004-4000-8000-00000000000c,5eed0001-0004-4000-8000-00000000000a}'::uuid[]))
  Filter: (organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid)
  Index Searches: 1
  Buffers: shared hit=4
```

### Consulta 5 de 5

```text
duration: 0.348 ms  plan:
Query Text: select "conversation_id", count(*) from "messages" where ("messages"."organization_id" = $1 and "messages"."conversation_id" in ($2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)) group by "messages"."conversation_id"
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '5eed0002-0004-4000-8000-000000000024', $3 = '5eed0002-0004-4000-8000-000000000010', $4 = '5eed0002-0004-4000-8000-000000000019', $5 = '5eed0002-0004-4000-8000-00000000001f', $6 = '5eed0002-0004-4000-8000-000000000009', $7 = '5eed0002-0004-4000-8000-00000000000b', $8 = '5eed0002-0004-4000-8000-000000000003', $9 = '5eed0002-0004-4000-8000-000000000028', $10 = '5eed0002-0004-4000-8000-00000000000f', $11 = '5eed0002-0004-4000-8000-00000000002e', $12 = '5eed0002-0004-4000-8000-000000000018', $13 = '5eed0002-0004-4000-8000-00000000000c', $14 = '5eed0002-0004-4000-8000-00000000002b', $15 = '5eed0002-0004-4000-8000-000000000027', $16 = '5eed0002-0004-4000-8000-000000000016', $17 = '5eed0002-0004-4000-8000-000000000000', $18 = '5eed0002-0004-4000-8000-00000000002f', $19 = '5eed0002-0004-4000-8000-00000000002a', $20 = '5eed0002-0004-4000-8000-00000000000e', $21 = '5eed0002-0004-4000-8000-000000000012', $22 = '5eed0002-0004-4000-8000-00000000001b', $23 = '5eed0002-0004-4000-8000-000000000013', $24 = '5eed0002-0004-4000-8000-000000000017', $25 = '5eed0002-0004-4000-8000-00000000002c', $26 = '5eed0002-0004-4000-8000-00000000001d'
GroupAggregate  (cost=45.47..45.49 rows=1 width=24) (actual time=0.294..0.329 rows=25.00 loops=1)
  Group Key: conversation_id
  Buffers: shared hit=13
  ->  Sort  (cost=45.47..45.47 rows=1 width=16) (actual time=0.221..0.233 rows=141.00 loops=1)
        Sort Key: conversation_id
        Sort Method: quicksort  Memory: 25kB
        Buffers: shared hit=13
        ->  Bitmap Heap Scan on messages  (cost=44.34..45.46 rows=1 width=16) (actual time=0.149..0.192 rows=141.00 loops=1)
              Recheck Cond: ((organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid) AND (conversation_id = ANY ('{5eed0002-0004-4000-8000-000000000024,5eed0002-0004-4000-8000-000000000010,5eed0002-0004-4000-8000-000000000019,5eed0002-0004-4000-8000-00000000001f,5eed0002-0004-4000-8000-000000000009,5eed0002-0004-4000-8000-00000000000b,5eed0002-0004-4000-8000-000000000003,5eed0002-0004-4000-8000-000000000028,5eed0002-0004-4000-8000-00000000000f,5eed0002-0004-4000-8000-00000000002e,5eed0002-0004-4000-8000-000000000018,5eed0002-0004-4000-8000-00000000000c,5eed0002-0004-4000-8000-00000000002b,5eed0002-0004-4000-8000-000000000027,5eed0002-0004-4000-8000-000000000016,5eed0002-0004-4000-8000-000000000000,5eed0002-0004-4000-8000-00000000002f,5eed0002-0004-4000-8000-00000000002a,5eed0002-0004-4000-8000-00000000000e,5eed0002-0004-4000-8000-000000000012,5eed0002-0004-4000-8000-00000000001b,5eed0002-0004-4000-8000-000000000013,5eed0002-0004-4000-8000-000000000017,5eed0002-0004-4000-8000-00000000002c,5eed0002-0004-4000-8000-00000000001d}'::uuid[])))
              Heap Blocks: exact=5
              Buffers: shared hit=13
              ->  BitmapAnd  (cost=44.28..44.28 rows=1 width=0) (actual time=0.127..0.128 rows=0.00 loops=1)
                    Buffers: shared hit=8
                    ->  Bitmap Index Scan on messages_organization_sent_idx  (cost=0.00..4.78 rows=288 width=0) (actual time=0.056..0.057 rows=265.00 loops=1)
                          Index Cond: (organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid)
                          Index Searches: 1
                          Buffers: shared hit=4
                    ->  Bitmap Index Scan on messages_conversation_sent_idx  (cost=0.00..39.25 rows=183 width=0) (actual time=0.067..0.067 rows=141.00 loops=1)
                          Index Cond: (conversation_id = ANY ('{5eed0002-0004-4000-8000-000000000024,5eed0002-0004-4000-8000-000000000010,5eed0002-0004-4000-8000-000000000019,5eed0002-0004-4000-8000-00000000001f,5eed0002-0004-4000-8000-000000000009,5eed0002-0004-4000-8000-00000000000b,5eed0002-0004-4000-8000-000000000003,5eed0002-0004-4000-8000-000000000028,5eed0002-0004-4000-8000-00000000000f,5eed0002-0004-4000-8000-00000000002e,5eed0002-0004-4000-8000-000000000018,5eed0002-0004-4000-8000-00000000000c,5eed0002-0004-4000-8000-00000000002b,5eed0002-0004-4000-8000-000000000027,5eed0002-0004-4000-8000-000000000016,5eed0002-0004-4000-8000-000000000000,5eed0002-0004-4000-8000-00000000002f,5eed0002-0004-4000-8000-00000000002a,5eed0002-0004-4000-8000-00000000000e,5eed0002-0004-4000-8000-000000000012,5eed0002-0004-4000-8000-00000000001b,5eed0002-0004-4000-8000-000000000013,5eed0002-0004-4000-8000-000000000017,5eed0002-0004-4000-8000-00000000002c,5eed0002-0004-4000-8000-00000000001d}'::uuid[]))
                          Index Searches: 1
                          Buffers: shared hit=4
```

## conversations.searchClientsByLastInteraction (última página)

Resultado: 25/50 filas.

### Consulta 1 de 4

```text
duration: 0.235 ms  plan:
Query Text: select "id" from "clients" where "clients"."organization_id" = $1 order by lower("clients"."display_name"), "clients"."id" asc
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021'
Sort  (cost=26.07..26.20 rows=50 width=48) (actual time=0.207..0.212 rows=50.00 loops=1)
  Sort Key: (lower(display_name)), id
  Sort Method: quicksort  Memory: 27kB
  Buffers: shared hit=15
  ->  Index Scan using clients_organization_display_name_unaccent_idx on clients  (cost=0.29..24.66 rows=50 width=48) (actual time=0.042..0.123 rows=50.00 loops=1)
        Index Cond: (organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid)
        Index Searches: 1
        Buffers: shared hit=15
```

### Consulta 2 de 4

```text
duration: 0.109 ms  plan:
Query Text: select "client_id", max("last_message_at") from "conversations" where ("conversations"."organization_id" = $1 and "conversations"."client_id" is not null and "conversations"."last_message_at" is not null) group by "conversations"."client_id"
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021'
GroupAggregate  (cost=0.29..2.89 rows=40 width=24) (actual time=0.056..0.084 rows=27.00 loops=1)
  Group Key: client_id
  Buffers: shared hit=4
  ->  Index Only Scan using conversations_organization_client_last_message_idx on conversations  (cost=0.29..2.29 rows=40 width=24) (actual time=0.042..0.058 rows=39.00 loops=1)
        Index Cond: ((organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid) AND (client_id IS NOT NULL) AND (last_message_at IS NOT NULL))
        Heap Fetches: 17
        Index Searches: 1
        Buffers: shared hit=4
```

### Consulta 3 de 4

```text
duration: 0.161 ms  plan:
Query Text: select "id", "display_name", "phone_e164", "notes", "is_active", "created_at", "updated_at" from "clients" where ("clients"."organization_id" = $1 and "clients"."id" in ($2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26))
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '5eed0001-0004-4000-8000-000000000028', $3 = '5eed0001-0004-4000-8000-00000000000f', $4 = '5eed0001-0004-4000-8000-000000000006', $5 = '5eed0001-0004-4000-8000-000000000027', $6 = '5eed0001-0004-4000-8000-00000000001d', $7 = '5eed0001-0004-4000-8000-00000000001e', $8 = '5eed0001-0004-4000-8000-000000000012', $9 = '5eed0001-0004-4000-8000-000000000009', $10 = '5eed0001-0004-4000-8000-000000000025', $11 = '5eed0001-0004-4000-8000-000000000031', $12 = '5eed0001-0004-4000-8000-000000000015', $13 = '5eed0001-0004-4000-8000-00000000002c', $14 = '5eed0001-0004-4000-8000-000000000016', $15 = '5eed0001-0004-4000-8000-000000000019', $16 = '5eed0001-0004-4000-8000-000000000007', $17 = '5eed0001-0004-4000-8000-000000000001', $18 = '5eed0001-0004-4000-8000-00000000000b', $19 = '5eed0001-0004-4000-8000-00000000000e', $20 = '5eed0001-0004-4000-8000-000000000000', $21 = '5eed0001-0004-4000-8000-000000000021', $22 = '5eed0001-0004-4000-8000-000000000020', $23 = '5eed0001-0004-4000-8000-00000000002a', $24 = '5eed0001-0004-4000-8000-00000000002f', $25 = '5eed0001-0004-4000-8000-00000000002e', $26 = '5eed0001-0004-4000-8000-000000000002'
Index Scan using clients_organization_display_name_unaccent_idx on clients  (cost=0.35..24.85 rows=1 width=99) (actual time=0.035..0.066 rows=25.00 loops=1)
  Index Cond: (organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid)
  Filter: (id = ANY ('{5eed0001-0004-4000-8000-000000000028,5eed0001-0004-4000-8000-00000000000f,5eed0001-0004-4000-8000-000000000006,5eed0001-0004-4000-8000-000000000027,5eed0001-0004-4000-8000-00000000001d,5eed0001-0004-4000-8000-00000000001e,5eed0001-0004-4000-8000-000000000012,5eed0001-0004-4000-8000-000000000009,5eed0001-0004-4000-8000-000000000025,5eed0001-0004-4000-8000-000000000031,5eed0001-0004-4000-8000-000000000015,5eed0001-0004-4000-8000-00000000002c,5eed0001-0004-4000-8000-000000000016,5eed0001-0004-4000-8000-000000000019,5eed0001-0004-4000-8000-000000000007,5eed0001-0004-4000-8000-000000000001,5eed0001-0004-4000-8000-00000000000b,5eed0001-0004-4000-8000-00000000000e,5eed0001-0004-4000-8000-000000000000,5eed0001-0004-4000-8000-000000000021,5eed0001-0004-4000-8000-000000000020,5eed0001-0004-4000-8000-00000000002a,5eed0001-0004-4000-8000-00000000002f,5eed0001-0004-4000-8000-00000000002e,5eed0001-0004-4000-8000-000000000002}'::uuid[]))
  Rows Removed by Filter: 25
  Index Searches: 1
  Buffers: shared hit=15
```

### Consulta 4 de 4

```text
duration: 0.027 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.023..0.023 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.020..0.021 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0004-4000-8000-000000000021'::uuid)
        Rows Removed by Filter: 4
        Buffers: shared hit=1
```

## organizations.listMembers (última página)

Resultado: 6/6 filas.

### Consulta 1 de 2

```text
duration: 0.046 ms  plan:
Query Text: select "id", "user_id", "role", "created_at" from "organization_members" where "organization_members"."organization_id" = $1
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021'
Index Scan using organization_members_organization_id_idx on organization_members  (cost=0.15..2.45 rows=6 width=44) (actual time=0.027..0.031 rows=6.00 loops=1)
  Index Cond: (organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid)
  Index Searches: 1
  Buffers: shared hit=2
```

### Consulta 2 de 2

```text
duration: 0.052 ms  plan:
Query Text: select "id", "name", "email", "is_active" from "users" where "users"."id" in ($1, $2, $3, $4, $5, $6)
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000022', $2 = '5eed0007-0004-4000-8000-000000000000', $3 = '5eed0007-0004-4000-8000-000000000001', $4 = '5eed0007-0004-4000-8000-000000000002', $5 = '5eed0007-0004-4000-8000-000000000003', $6 = '5eed0007-0004-4000-8000-000000000004'
Index Scan using users_pkey on users  (cost=0.28..5.28 rows=6 width=62) (actual time=0.034..0.044 rows=6.00 loops=1)
  Index Cond: (id = ANY ('{5eed0000-0004-4000-8000-000000000022,5eed0007-0004-4000-8000-000000000000,5eed0007-0004-4000-8000-000000000001,5eed0007-0004-4000-8000-000000000002,5eed0007-0004-4000-8000-000000000003,5eed0007-0004-4000-8000-000000000004}'::uuid[]))
  Index Searches: 2
  Buffers: shared hit=5
```

## inventory.listStockMovements (producto con 6, última página)

Resultado: 6/6 filas.

### Consulta 1 de 6

```text
duration: 0.048 ms  plan:
Query Text: select "id", "sku", "name", "description", "unit", "reorder_point", "brand", "category", "condition", "is_active", "created_at", "updated_at" from "products" where ("products"."organization_id" = $1 and "products"."id" = $2) limit $3
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '5eed0004-0004-4000-8000-000000000005', $3 = '1'
Limit  (cost=0.29..2.50 rows=1 width=172) (actual time=0.032..0.033 rows=1.00 loops=1)
  Buffers: shared hit=3
  ->  Index Scan using products_organization_id_id_unique on products  (cost=0.29..2.50 rows=1 width=172) (actual time=0.030..0.031 rows=1.00 loops=1)
        Index Cond: ((organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid) AND (id = '5eed0004-0004-4000-8000-000000000005'::uuid))
        Index Searches: 1
        Buffers: shared hit=3
```

### Consulta 2 de 6

```text
duration: 0.024 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.020..0.021 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.018..0.018 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0004-4000-8000-000000000021'::uuid)
        Rows Removed by Filter: 4
        Buffers: shared hit=1
```

### Consulta 3 de 6

```text
duration: 0.043 ms  plan:
Query Text: select count(*) from "inventory_movements" where ("inventory_movements"."organization_id" = $1 and "inventory_movements"."product_id" = $2)
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '5eed0004-0004-4000-8000-000000000005'
Aggregate  (cost=1.54..1.55 rows=1 width=8) (actual time=0.038..0.039 rows=1.00 loops=1)
  Buffers: shared hit=4
  ->  Index Only Scan using inventory_movements_product_history_idx on inventory_movements  (cost=0.41..1.54 rows=1 width=0) (actual time=0.028..0.030 rows=6.00 loops=1)
        Index Cond: ((organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid) AND (product_id = '5eed0004-0004-4000-8000-000000000005'::uuid))
        Heap Fetches: 0
        Index Searches: 1
        Buffers: shared hit=4
```

### Consulta 4 de 6

```text
duration: 0.080 ms  plan:
Query Text: select "id", "type", "quantity", "balance_after", "reason", "created_by", "created_at" from "inventory_movements" where ("inventory_movements"."organization_id" = $1 and "inventory_movements"."product_id" = $2) order by "inventory_movements"."created_at" desc, "inventory_movements"."id" desc limit $3
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '5eed0004-0004-4000-8000-000000000005', $3 = '25'
Limit  (cost=2.64..2.65 rows=1 width=70) (actual time=0.056..0.058 rows=6.00 loops=1)
  Buffers: shared hit=4
  ->  Sort  (cost=2.64..2.65 rows=1 width=70) (actual time=0.055..0.056 rows=6.00 loops=1)
        Sort Key: created_at DESC, id DESC
        Sort Method: quicksort  Memory: 25kB
        Buffers: shared hit=4
        ->  Index Scan using inventory_movements_product_history_idx on inventory_movements  (cost=0.41..2.63 rows=1 width=70) (actual time=0.036..0.040 rows=6.00 loops=1)
              Index Cond: ((organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid) AND (product_id = '5eed0004-0004-4000-8000-000000000005'::uuid))
              Index Searches: 1
              Buffers: shared hit=4
```

### Consulta 5 de 6

```text
duration: 0.036 ms  plan:
Query Text: select "user_id" from "organization_members" where ("organization_members"."organization_id" = $1 and "organization_members"."user_id" in ($2))
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '5eed0000-0004-4000-8000-000000000022'
Index Scan using organization_members_organization_id_idx on organization_members  (cost=0.15..2.47 rows=1 width=16) (actual time=0.027..0.031 rows=1.00 loops=1)
  Index Cond: (organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid)
  Filter: (user_id = '5eed0000-0004-4000-8000-000000000022'::uuid)
  Rows Removed by Filter: 5
  Index Searches: 1
  Buffers: shared hit=2
```

### Consulta 6 de 6

```text
duration: 0.036 ms  plan:
Query Text: select "id", "name", "email", "is_active" from "users" where "users"."id" in ($1)
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000022'
Index Scan using users_pkey on users  (cost=0.28..2.49 rows=1 width=62) (actual time=0.029..0.030 rows=1.00 loops=1)
  Index Cond: (id = '5eed0000-0004-4000-8000-000000000022'::uuid)
  Index Searches: 1
  Buffers: shared hit=3
```

## inventory.listStockMovements (producto con 6)

Resultado: 6/6 filas.

### Consulta 1 de 6

```text
duration: 0.056 ms  plan:
Query Text: select "id", "sku", "name", "description", "unit", "reorder_point", "brand", "category", "condition", "is_active", "created_at", "updated_at" from "products" where ("products"."organization_id" = $1 and "products"."id" = $2) limit $3
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '5eed0004-0004-4000-8000-000000000005', $3 = '1'
Limit  (cost=0.29..2.50 rows=1 width=172) (actual time=0.039..0.040 rows=1.00 loops=1)
  Buffers: shared hit=3
  ->  Index Scan using products_organization_id_id_unique on products  (cost=0.29..2.50 rows=1 width=172) (actual time=0.036..0.036 rows=1.00 loops=1)
        Index Cond: ((organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid) AND (id = '5eed0004-0004-4000-8000-000000000005'::uuid))
        Index Searches: 1
        Buffers: shared hit=3
```

### Consulta 2 de 6

```text
duration: 0.028 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.023..0.024 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.022..0.022 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0004-4000-8000-000000000021'::uuid)
        Rows Removed by Filter: 4
        Buffers: shared hit=1
```

### Consulta 3 de 6

```text
duration: 0.046 ms  plan:
Query Text: select count(*) from "inventory_movements" where ("inventory_movements"."organization_id" = $1 and "inventory_movements"."product_id" = $2)
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '5eed0004-0004-4000-8000-000000000005'
Aggregate  (cost=1.54..1.55 rows=1 width=8) (actual time=0.042..0.042 rows=1.00 loops=1)
  Buffers: shared hit=4
  ->  Index Only Scan using inventory_movements_product_history_idx on inventory_movements  (cost=0.41..1.54 rows=1 width=0) (actual time=0.032..0.034 rows=6.00 loops=1)
        Index Cond: ((organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid) AND (product_id = '5eed0004-0004-4000-8000-000000000005'::uuid))
        Heap Fetches: 0
        Index Searches: 1
        Buffers: shared hit=4
```

### Consulta 4 de 6

```text
duration: 0.071 ms  plan:
Query Text: select "id", "type", "quantity", "balance_after", "reason", "created_by", "created_at" from "inventory_movements" where ("inventory_movements"."organization_id" = $1 and "inventory_movements"."product_id" = $2) order by "inventory_movements"."created_at" desc, "inventory_movements"."id" desc limit $3
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '5eed0004-0004-4000-8000-000000000005', $3 = '25'
Limit  (cost=2.64..2.65 rows=1 width=70) (actual time=0.047..0.049 rows=6.00 loops=1)
  Buffers: shared hit=4
  ->  Sort  (cost=2.64..2.65 rows=1 width=70) (actual time=0.046..0.047 rows=6.00 loops=1)
        Sort Key: created_at DESC, id DESC
        Sort Method: quicksort  Memory: 25kB
        Buffers: shared hit=4
        ->  Index Scan using inventory_movements_product_history_idx on inventory_movements  (cost=0.41..2.63 rows=1 width=70) (actual time=0.031..0.034 rows=6.00 loops=1)
              Index Cond: ((organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid) AND (product_id = '5eed0004-0004-4000-8000-000000000005'::uuid))
              Index Searches: 1
              Buffers: shared hit=4
```

### Consulta 5 de 6

```text
duration: 0.033 ms  plan:
Query Text: select "user_id" from "organization_members" where ("organization_members"."organization_id" = $1 and "organization_members"."user_id" in ($2))
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '5eed0000-0004-4000-8000-000000000022'
Index Scan using organization_members_organization_id_idx on organization_members  (cost=0.15..2.47 rows=1 width=16) (actual time=0.027..0.030 rows=1.00 loops=1)
  Index Cond: (organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid)
  Filter: (user_id = '5eed0000-0004-4000-8000-000000000022'::uuid)
  Rows Removed by Filter: 5
  Index Searches: 1
  Buffers: shared hit=2
```

### Consulta 6 de 6

```text
duration: 0.035 ms  plan:
Query Text: select "id", "name", "email", "is_active" from "users" where "users"."id" in ($1)
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000022'
Index Scan using users_pkey on users  (cost=0.28..2.49 rows=1 width=62) (actual time=0.027..0.029 rows=1.00 loops=1)
  Index Cond: (id = '5eed0000-0004-4000-8000-000000000022'::uuid)
  Index Searches: 1
  Buffers: shared hit=3
```

## API products: palabras («cafe molido»)

Resultado: 0 filas.

### Consulta 1 de 3

```text
duration: 0.007 ms  plan:
Query Text:  SELECT public.unaccent('public.unaccent'::regdictionary, $1) 
Query Parameters: $1 = 'cafe molido'
Result  (cost=0.00..0.01 rows=1 width=32) (actual time=0.004..0.004 rows=1.00 loops=1)
```

### Consulta 2 de 3

```text
duration: 0.007 ms  plan:
Query Text:  SELECT public.unaccent('public.unaccent'::regdictionary, $1) 
Query Parameters: $1 = 'cafe molido'
Result  (cost=0.00..0.01 rows=1 width=32) (actual time=0.004..0.004 rows=1.00 loops=1)
```

### Consulta 3 de 3

```text
duration: 0.216 ms  plan:
Query Text: select "id", "sku", "name", "description", "unit", "reorder_point", "brand", "category", "condition", "is_active", "created_at", "updated_at" from "products" where ("products"."organization_id" = $1 and "products"."is_active" = $2 and ("products"."search" @@ (select string_agg('''' || replace(replace(l.lexeme, '\', '\\'), '''', '''''') || ''':*', ' & ')::tsquery
    from unnest(to_tsvector('simple', immutable_unaccent(lower($3)))) l) or lower("products"."sku") = lower($4))) order by lower("products"."sku") = lower($5) desc, coalesce(ts_rank("products"."search", (select string_agg('''' || replace(replace(l.lexeme, '\', '\\'), '''', '''''') || ''':*', ' & ')::tsquery
    from unnest(to_tsvector('simple', immutable_unaccent(lower($6)))) l)), 0) desc, "products"."name", "products"."id" limit $7
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = 't', $3 = 'cafe molido', $4 = 'cafe molido', $5 = 'cafe molido', $6 = 'cafe molido', $7 = '10'
Limit  (cost=26.94..26.95 rows=1 width=177) (actual time=0.212..0.213 rows=0.00 loops=1)
  Buffers: shared hit=12
  InitPlan 1
    ->  Aggregate  (cost=0.23..0.25 rows=1 width=32) (never executed)
          ->  Function Scan on unnest l  (cost=0.00..0.10 rows=10 width=32) (never executed)
  InitPlan 2
    ->  Aggregate  (cost=0.23..0.25 rows=1 width=32) (actual time=0.042..0.043 rows=1.00 loops=1)
          ->  Function Scan on unnest l_1  (cost=0.00..0.10 rows=10 width=32) (actual time=0.024..0.025 rows=2.00 loops=1)
  ->  Sort  (cost=26.45..26.46 rows=1 width=177) (actual time=0.210..0.210 rows=0.00 loops=1)
        Sort Key: ((lower(products.sku) = 'cafe molido'::text)) DESC, (COALESCE(ts_rank(products.search, (InitPlan 1).col1), '0'::real)) DESC, products.name, products.id
        Sort Method: quicksort  Memory: 25kB
        Buffers: shared hit=12
        ->  Index Scan using products_organization_sku_lower_unique on products  (cost=0.29..26.44 rows=1 width=177) (actual time=0.154..0.154 rows=0.00 loops=1)
              Index Cond: (organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid)
              Filter: (is_active AND ((search @@ (InitPlan 2).col1) OR (lower(sku) = 'cafe molido'::text)))
              Rows Removed by Filter: 50
              Index Searches: 1
              Buffers: shared hit=4
```

## API products: SKU exacto

Resultado: 1 filas.

### Consulta 1 de 5

```text
duration: 0.008 ms  plan:
Query Text:  SELECT public.unaccent('public.unaccent'::regdictionary, $1) 
Query Parameters: $1 = 'sku-000001'
Result  (cost=0.00..0.01 rows=1 width=32) (actual time=0.005..0.005 rows=1.00 loops=1)
```

### Consulta 2 de 5

```text
duration: 0.004 ms  plan:
Query Text:  SELECT public.unaccent('public.unaccent'::regdictionary, $1) 
Query Parameters: $1 = 'sku-000001'
Result  (cost=0.00..0.01 rows=1 width=32) (actual time=0.003..0.003 rows=1.00 loops=1)
```

### Consulta 3 de 5

```text
duration: 1.029 ms  plan:
Query Text: select "id", "sku", "name", "description", "unit", "reorder_point", "brand", "category", "condition", "is_active", "created_at", "updated_at" from "products" where ("products"."organization_id" = $1 and "products"."is_active" = $2 and ("products"."search" @@ (select string_agg('''' || replace(replace(l.lexeme, '\', '\\'), '''', '''''') || ''':*', ' & ')::tsquery
    from unnest(to_tsvector('simple', immutable_unaccent(lower($3)))) l) or lower("products"."sku") = lower($4))) order by lower("products"."sku") = lower($5) desc, coalesce(ts_rank("products"."search", (select string_agg('''' || replace(replace(l.lexeme, '\', '\\'), '''', '''''') || ''':*', ' & ')::tsquery
    from unnest(to_tsvector('simple', immutable_unaccent(lower($6)))) l)), 0) desc, "products"."name", "products"."id" limit $7
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = 't', $3 = 'SKU-000001', $4 = 'SKU-000001', $5 = 'SKU-000001', $6 = 'SKU-000001', $7 = '10'
Limit  (cost=26.94..26.95 rows=1 width=177) (actual time=0.999..1.006 rows=1.00 loops=1)
  Buffers: shared hit=4
  InitPlan 1
    ->  Aggregate  (cost=0.23..0.25 rows=1 width=32) (actual time=0.010..0.011 rows=1.00 loops=1)
          ->  Function Scan on unnest l  (cost=0.00..0.10 rows=10 width=32) (actual time=0.005..0.006 rows=2.00 loops=1)
  InitPlan 2
    ->  Aggregate  (cost=0.23..0.25 rows=1 width=32) (actual time=0.036..0.037 rows=1.00 loops=1)
          ->  Function Scan on unnest l_1  (cost=0.00..0.10 rows=10 width=32) (actual time=0.018..0.018 rows=2.00 loops=1)
  ->  Sort  (cost=26.45..26.46 rows=1 width=177) (actual time=0.997..0.999 rows=1.00 loops=1)
        Sort Key: ((lower(products.sku) = 'sku-000001'::text)) DESC, (COALESCE(ts_rank(products.search, (InitPlan 1).col1), '0'::real)) DESC, products.name, products.id
        Sort Method: quicksort  Memory: 25kB
        Buffers: shared hit=4
        ->  Index Scan using products_organization_sku_lower_unique on products  (cost=0.29..26.44 rows=1 width=177) (actual time=0.100..0.982 rows=1.00 loops=1)
              Index Cond: (organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid)
              Filter: (is_active AND ((search @@ (InitPlan 2).col1) OR (lower(sku) = 'sku-000001'::text)))
              Rows Removed by Filter: 49
              Index Searches: 1
              Buffers: shared hit=4
```

### Consulta 4 de 5

```text
duration: 0.047 ms  plan:
Query Text: select distinct on ("product_prices"."product_id") "id", "product_id", "amount", "currency", "created_by", "created_at" from "product_prices" where ("product_prices"."organization_id" = $1 and "product_prices"."product_id" in ($2)) order by "product_prices"."product_id", "product_prices"."created_at" desc, "product_prices"."id" desc
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '5eed0004-0004-4000-8000-000000000000'
Limit  (cost=2.51..2.52 rows=1 width=66) (actual time=0.044..0.045 rows=0.00 loops=1)
  Buffers: shared hit=2
  ->  Sort  (cost=2.51..2.52 rows=1 width=66) (actual time=0.043..0.043 rows=0.00 loops=1)
        Sort Key: created_at DESC, id DESC
        Sort Method: quicksort  Memory: 25kB
        Buffers: shared hit=2
        ->  Index Scan using product_prices_product_history_idx on product_prices  (cost=0.29..2.50 rows=1 width=66) (actual time=0.035..0.035 rows=0.00 loops=1)
              Index Cond: ((organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid) AND (product_id = '5eed0004-0004-4000-8000-000000000000'::uuid))
              Index Searches: 1
              Buffers: shared hit=2
```

### Consulta 5 de 5

```text
duration: 0.036 ms  plan:
Query Text: select "product_id", "quantity_on_hand" from "inventories" where ("inventories"."organization_id" = $1 and "inventories"."product_id" in ($2))
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '5eed0004-0004-4000-8000-000000000000'
Index Scan using inventories_product_id_unique on inventories  (cost=0.29..2.51 rows=1 width=20) (actual time=0.029..0.030 rows=1.00 loops=1)
  Index Cond: (product_id = '5eed0004-0004-4000-8000-000000000000'::uuid)
  Filter: (organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid)
  Index Searches: 1
  Buffers: shared hit=3
```

## API products: sin coincidencias

Resultado: 0 filas.

### Consulta 1 de 3

```text
duration: 0.008 ms  plan:
Query Text:  SELECT public.unaccent('public.unaccent'::regdictionary, $1) 
Query Parameters: $1 = 'inexistente'
Result  (cost=0.00..0.01 rows=1 width=32) (actual time=0.005..0.005 rows=1.00 loops=1)
```

### Consulta 2 de 3

```text
duration: 0.010 ms  plan:
Query Text:  SELECT public.unaccent('public.unaccent'::regdictionary, $1) 
Query Parameters: $1 = 'inexistente'
Result  (cost=0.00..0.01 rows=1 width=32) (actual time=0.006..0.006 rows=1.00 loops=1)
```

### Consulta 3 de 3

```text
duration: 0.182 ms  plan:
Query Text: select "id", "sku", "name", "description", "unit", "reorder_point", "brand", "category", "condition", "is_active", "created_at", "updated_at" from "products" where ("products"."organization_id" = $1 and "products"."is_active" = $2 and ("products"."search" @@ (select string_agg('''' || replace(replace(l.lexeme, '\', '\\'), '''', '''''') || ''':*', ' & ')::tsquery
    from unnest(to_tsvector('simple', immutable_unaccent(lower($3)))) l) or lower("products"."sku") = lower($4))) order by lower("products"."sku") = lower($5) desc, coalesce(ts_rank("products"."search", (select string_agg('''' || replace(replace(l.lexeme, '\', '\\'), '''', '''''') || ''':*', ' & ')::tsquery
    from unnest(to_tsvector('simple', immutable_unaccent(lower($6)))) l)), 0) desc, "products"."name", "products"."id" limit $7
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = 't', $3 = 'inexistente', $4 = 'inexistente', $5 = 'inexistente', $6 = 'inexistente', $7 = '10'
Limit  (cost=26.94..26.95 rows=1 width=177) (actual time=0.179..0.180 rows=0.00 loops=1)
  Buffers: shared hit=4
  InitPlan 1
    ->  Aggregate  (cost=0.23..0.25 rows=1 width=32) (never executed)
          ->  Function Scan on unnest l  (cost=0.00..0.10 rows=10 width=32) (never executed)
  InitPlan 2
    ->  Aggregate  (cost=0.23..0.25 rows=1 width=32) (actual time=0.032..0.032 rows=1.00 loops=1)
          ->  Function Scan on unnest l_1  (cost=0.00..0.10 rows=10 width=32) (actual time=0.017..0.017 rows=1.00 loops=1)
  ->  Sort  (cost=26.45..26.46 rows=1 width=177) (actual time=0.177..0.178 rows=0.00 loops=1)
        Sort Key: ((lower(products.sku) = 'inexistente'::text)) DESC, (COALESCE(ts_rank(products.search, (InitPlan 1).col1), '0'::real)) DESC, products.name, products.id
        Sort Method: quicksort  Memory: 25kB
        Buffers: shared hit=4
        ->  Index Scan using products_organization_sku_lower_unique on products  (cost=0.29..26.44 rows=1 width=177) (actual time=0.166..0.166 rows=0.00 loops=1)
              Index Cond: (organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid)
              Filter: (is_active AND ((search @@ (InitPlan 2).col1) OR (lower(sku) = 'inexistente'::text)))
              Rows Removed by Filter: 50
              Index Searches: 1
              Buffers: shared hit=4
```

## API products/{product_id}

Resultado: 1 filas.

### Consulta 1 de 3

```text
duration: 0.050 ms  plan:
Query Text: select "id", "sku", "name", "description", "unit", "reorder_point", "brand", "category", "condition", "is_active", "created_at", "updated_at" from "products" where ("products"."organization_id" = $1 and "products"."id" = $2) limit $3
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '5eed0004-0004-4000-8000-000000000000', $3 = '1'
Limit  (cost=0.29..2.50 rows=1 width=172) (actual time=0.033..0.033 rows=1.00 loops=1)
  Buffers: shared hit=3
  ->  Index Scan using products_organization_id_id_unique on products  (cost=0.29..2.50 rows=1 width=172) (actual time=0.031..0.031 rows=1.00 loops=1)
        Index Cond: ((organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid) AND (id = '5eed0004-0004-4000-8000-000000000000'::uuid))
        Index Searches: 1
        Buffers: shared hit=3
```

### Consulta 2 de 3

```text
duration: 0.037 ms  plan:
Query Text: select distinct on ("product_prices"."product_id") "id", "product_id", "amount", "currency", "created_by", "created_at" from "product_prices" where ("product_prices"."organization_id" = $1 and "product_prices"."product_id" in ($2)) order by "product_prices"."product_id", "product_prices"."created_at" desc, "product_prices"."id" desc
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '5eed0004-0004-4000-8000-000000000000'
Limit  (cost=2.51..2.52 rows=1 width=66) (actual time=0.034..0.035 rows=0.00 loops=1)
  Buffers: shared hit=2
  ->  Sort  (cost=2.51..2.52 rows=1 width=66) (actual time=0.032..0.033 rows=0.00 loops=1)
        Sort Key: created_at DESC, id DESC
        Sort Method: quicksort  Memory: 25kB
        Buffers: shared hit=2
        ->  Index Scan using product_prices_product_history_idx on product_prices  (cost=0.29..2.50 rows=1 width=66) (actual time=0.024..0.024 rows=0.00 loops=1)
              Index Cond: ((organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid) AND (product_id = '5eed0004-0004-4000-8000-000000000000'::uuid))
              Index Searches: 1
              Buffers: shared hit=2
```

### Consulta 3 de 3

```text
duration: 0.039 ms  plan:
Query Text: select "product_id", "quantity_on_hand" from "inventories" where ("inventories"."organization_id" = $1 and "inventories"."product_id" in ($2))
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '5eed0004-0004-4000-8000-000000000000'
Index Scan using inventories_product_id_unique on inventories  (cost=0.29..2.51 rows=1 width=20) (actual time=0.031..0.033 rows=1.00 loops=1)
  Index Cond: (product_id = '5eed0004-0004-4000-8000-000000000000'::uuid)
  Filter: (organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid)
  Index Searches: 1
  Buffers: shared hit=3
```

## API knowledge: vigentes sin texto

Resultado: 20 filas.

### Consulta 1 de 2

```text
duration: 0.025 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.020..0.021 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.018..0.019 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0004-4000-8000-000000000021'::uuid)
        Rows Removed by Filter: 4
        Buffers: shared hit=1
```

### Consulta 2 de 2

```text
duration: 0.522 ms  plan:
Query Text: select "id", "title", "category", "content", "is_active", "valid_from", "valid_until", case
    when not "is_active" then 'inactive'
    when "valid_from" > (now() at time zone $1)::date then 'scheduled'
    when "valid_until" < (now() at time zone $2)::date then 'expired'
    else 'current' end, "created_at", "updated_at" from "knowledge_entries" where ("knowledge_entries"."organization_id" = $3 and case
    when not "knowledge_entries"."is_active" then 'inactive'
    when "knowledge_entries"."valid_from" > (now() at time zone $4)::date then 'scheduled'
    when "knowledge_entries"."valid_until" < (now() at time zone $5)::date then 'expired'
    else 'current' end = $6) order by "knowledge_entries"."category" asc, "knowledge_entries"."title" asc, "knowledge_entries"."id" asc limit $7
Query Parameters: $1 = 'America/Argentina/Buenos_Aires', $2 = 'America/Argentina/Buenos_Aires', $3 = '5eed0000-0004-4000-8000-000000000021', $4 = 'America/Argentina/Buenos_Aires', $5 = 'America/Argentina/Buenos_Aires', $6 = 'current', $7 = '20'
Limit  (cost=15.90..15.90 rows=1 width=164) (actual time=0.482..0.488 rows=20.00 loops=1)
  Buffers: shared hit=16
  ->  Sort  (cost=15.90..15.90 rows=1 width=164) (actual time=0.480..0.482 rows=20.00 loops=1)
        Sort Key: category, title, id
        Sort Method: quicksort  Memory: 30kB
        Buffers: shared hit=16
        ->  Index Scan using knowledge_entries_organization_title_lower_unique on knowledge_entries  (cost=0.28..15.89 rows=1 width=164) (actual time=0.338..0.430 rows=21.00 loops=1)
              Index Cond: (organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid)
              Filter: (CASE WHEN (NOT is_active) THEN 'inactive'::text WHEN (valid_from > ((now() AT TIME ZONE 'America/Argentina/Buenos_Aires'::text))::date) THEN 'scheduled'::text WHEN (valid_until < ((now() AT TIME ZONE 'America/Argentina/Buenos_Aires'::text))::date) THEN 'expired'::text ELSE 'current'::text END = 'current'::text)
              Rows Removed by Filter: 9
              Index Searches: 1
              Buffers: shared hit=16
```

## API knowledge: vigentes con texto

Resultado: 2 filas.

### Consulta 1 de 4

```text
duration: 0.027 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.023..0.024 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.021..0.022 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0004-4000-8000-000000000021'::uuid)
        Rows Removed by Filter: 4
        Buffers: shared hit=1
```

### Consulta 2 de 4

```text
duration: 0.007 ms  plan:
Query Text:  SELECT public.unaccent('public.unaccent'::regdictionary, $1) 
Query Parameters: $1 = 'horario'
Result  (cost=0.00..0.01 rows=1 width=32) (actual time=0.004..0.005 rows=1.00 loops=1)
```

### Consulta 3 de 4

```text
duration: 0.003 ms  plan:
Query Text:  SELECT public.unaccent('public.unaccent'::regdictionary, $1) 
Query Parameters: $1 = 'horario'
Result  (cost=0.00..0.01 rows=1 width=32) (actual time=0.002..0.002 rows=1.00 loops=1)
```

### Consulta 4 de 4

```text
duration: 0.771 ms  plan:
Query Text: select "id", "title", "category", "content", "is_active", "valid_from", "valid_until", case
    when not "is_active" then 'inactive'
    when "valid_from" > (now() at time zone $1)::date then 'scheduled'
    when "valid_until" < (now() at time zone $2)::date then 'expired'
    else 'current' end, "created_at", "updated_at" from "knowledge_entries" where ("knowledge_entries"."organization_id" = $3 and case
    when not "knowledge_entries"."is_active" then 'inactive'
    when "knowledge_entries"."valid_from" > (now() at time zone $4)::date then 'scheduled'
    when "knowledge_entries"."valid_until" < (now() at time zone $5)::date then 'expired'
    else 'current' end = $6 and "knowledge_entries"."search" @@ (select string_agg('''' || replace(replace(l.lexeme, '\', '\\'), '''', '''''') || ''':*', ' & ')::tsquery
    from unnest(to_tsvector('simple', immutable_unaccent(lower($7)))) l)) order by ts_rank("knowledge_entries"."search", (select string_agg('''' || replace(replace(l.lexeme, '\', '\\'), '''', '''''') || ''':*', ' & ')::tsquery
    from unnest(to_tsvector('simple', immutable_unaccent(lower($8)))) l)) desc, "knowledge_entries"."title" asc, "knowledge_entries"."id" asc limit $9
Query Parameters: $1 = 'America/Argentina/Buenos_Aires', $2 = 'America/Argentina/Buenos_Aires', $3 = '5eed0000-0004-4000-8000-000000000021', $4 = 'America/Argentina/Buenos_Aires', $5 = 'America/Argentina/Buenos_Aires', $6 = 'current', $7 = 'horario', $8 = 'horario', $9 = '20'
Limit  (cost=6.29..6.29 rows=1 width=168) (actual time=0.750..0.755 rows=2.00 loops=1)
  Buffers: shared hit=7
  InitPlan 1
    ->  Aggregate  (cost=0.23..0.25 rows=1 width=32) (actual time=0.043..0.044 rows=1.00 loops=1)
          ->  Function Scan on unnest l  (cost=0.00..0.10 rows=10 width=32) (actual time=0.029..0.029 rows=1.00 loops=1)
  InitPlan 2
    ->  Aggregate  (cost=0.23..0.25 rows=1 width=32) (actual time=0.032..0.032 rows=1.00 loops=1)
          ->  Function Scan on unnest l_1  (cost=0.00..0.10 rows=10 width=32) (actual time=0.016..0.017 rows=1.00 loops=1)
  ->  Sort  (cost=5.80..5.80 rows=1 width=168) (actual time=0.748..0.750 rows=2.00 loops=1)
        Sort Key: (ts_rank(knowledge_entries.search, (InitPlan 1).col1)) DESC, knowledge_entries.title, knowledge_entries.id
        Sort Method: quicksort  Memory: 25kB
        Buffers: shared hit=7
        ->  Bitmap Heap Scan on knowledge_entries  (cost=4.63..5.79 rows=1 width=168) (actual time=0.713..0.726 rows=2.00 loops=1)
              Recheck Cond: ((organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid) AND (search @@ (InitPlan 2).col1))
              Filter: (CASE WHEN (NOT is_active) THEN 'inactive'::text WHEN (valid_from > ((now() AT TIME ZONE 'America/Argentina/Buenos_Aires'::text))::date) THEN 'scheduled'::text WHEN (valid_until < ((now() AT TIME ZONE 'America/Argentina/Buenos_Aires'::text))::date) THEN 'expired'::text ELSE 'current'::text END = 'current'::text)
              Rows Removed by Filter: 3
              Heap Blocks: exact=2
              Buffers: shared hit=7
              ->  BitmapAnd  (cost=4.63..4.63 rows=1 width=0) (actual time=0.617..0.618 rows=0.00 loops=1)
                    Buffers: shared hit=5
                    ->  Bitmap Index Scan on knowledge_entries_organization_title_lower_unique  (cost=0.00..1.60 rows=30 width=0) (actual time=0.019..0.020 rows=30.00 loops=1)
                          Index Cond: (organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid)
                          Index Searches: 1
                          Buffers: shared hit=2
                    ->  Bitmap Index Scan on knowledge_entries_search_idx  (cost=0.00..2.78 rows=7 width=0) (actual time=0.592..0.592 rows=174.00 loops=1)
                          Index Cond: (search @@ (InitPlan 2).col1)
                          Index Searches: 1
                          Buffers: shared hit=3
```

## conversations.resolveIngestedConversation (con vigente)

Resultado: conversación vigente.

### Consulta 1 de 4

```text
duration: 0.107 ms  plan:
Query Text: select "id" from "clients" where ("clients"."organization_id" = $1 and "clients"."phone_e164" = $2) for update
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '+5491160000019'
LockRows  (cost=0.29..2.51 rows=1 width=22) (actual time=0.099..0.102 rows=1.00 loops=1)
  Buffers: shared hit=5 dirtied=1
  ->  Index Scan using clients_organization_phone_unique on clients  (cost=0.29..2.50 rows=1 width=22) (actual time=0.037..0.039 rows=1.00 loops=1)
        Index Cond: ((organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid) AND (phone_e164 = '+5491160000019'::text))
        Index Searches: 1
        Buffers: shared hit=3
```

### Consulta 2 de 4

```text
duration: 0.047 ms  plan:
Query Text: 
    select id, external_ref, status
    from conversations
    where organization_id = $1
      and client_id = $2
      and channel = $3
      and status in ('open', 'pending')
      and external_ref is not null
      and last_message_at >= $4
      and started_at <= $5
    order by greatest(started_at - $6::timestamptz, $7::timestamptz - last_message_at, interval '0'),
      last_message_at desc, id desc
    limit 1
    for update
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '5eed0001-0004-4000-8000-000000000013', $3 = 'whatsapp', $4 = '2026-09-13 09:35:04.308+00', $5 = '2026-09-15 09:35:04.308+00', $6 = '2026-09-14 09:35:04.308+00', $7 = '2026-09-14 09:35:04.308+00'
Limit  (cost=2.53..2.55 rows=1 width=65) (actual time=0.040..0.041 rows=1.00 loops=1)
  Buffers: shared hit=6
  ->  LockRows  (cost=2.53..2.55 rows=1 width=65) (actual time=0.039..0.040 rows=1.00 loops=1)
        Buffers: shared hit=6
        ->  Sort  (cost=2.53..2.54 rows=1 width=65) (actual time=0.032..0.032 rows=1.00 loops=1)
              Sort Key: (GREATEST((started_at - '2026-09-14 09:35:04.308+00'::timestamp with time zone), ('2026-09-14 09:35:04.308+00'::timestamp with time zone - last_message_at), '00:00:00'::interval)), last_message_at DESC, id DESC
              Sort Method: quicksort  Memory: 25kB
              Buffers: shared hit=5
              ->  Index Scan using conversations_organization_client_last_message_idx on conversations  (cost=0.29..2.52 rows=1 width=65) (actual time=0.016..0.017 rows=1.00 loops=1)
                    Index Cond: ((organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid) AND (client_id = '5eed0001-0004-4000-8000-000000000013'::uuid) AND (last_message_at >= '2026-09-13 09:35:04.308+00'::timestamp with time zone))
                    Filter: ((external_ref IS NOT NULL) AND (status = ANY ('{open,pending}'::conversation_status[])) AND (started_at <= '2026-09-15 09:35:04.308+00'::timestamp with time zone) AND (channel = 'whatsapp'::conversation_channel))
                    Index Searches: 1
                    Buffers: shared hit=3
```

### Consulta 3 de 4

```text
duration: 1.068 ms  plan:
Query Text: 
    insert into messages
      (organization_id, conversation_id, direction, external_ref, sent_at, body_text, kind, sent_by)
    values ($1, $2, $3,
      $4, $5, $6, $7, $8)
    on conflict (organization_id, conversation_id, external_ref) where external_ref is not null
    do nothing
    returning id
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '5eed0002-0004-4000-8000-000000000031', $3 = 'inbound', $4 = 'medicion-13-2-mensaje', $5 = '2026-09-14 09:35:04.308+00', $6 = 'Mensaje de la medición', $7 = NULL, $8 = NULL
Insert on messages  (cost=0.00..0.01 rows=1 width=140) (actual time=0.274..0.276 rows=1.00 loops=1)
  Conflict Resolution: NOTHING
  Conflict Arbiter Indexes: messages_organization_conversation_external_ref_unique
  Tuples Inserted: 1
  Conflicting Tuples: 0
  Buffers: shared hit=21
  ->  Result  (cost=0.00..0.01 rows=1 width=140) (actual time=0.037..0.037 rows=1.00 loops=1)
```

### Consulta 4 de 4

```text
duration: 0.353 ms  plan:
Query Text: update "conversations" set "started_at" = least("conversations"."started_at", $1), "last_message_at" = greatest("conversations"."last_message_at", $2), "updated_at" = $3 where ("conversations"."organization_id" = $4 and "conversations"."id" = $5) returning "id"
Query Parameters: $1 = '2026-09-14 09:35:04.308+00', $2 = '2026-09-14 09:35:04.308+00', $3 = '2026-09-30 14:33:26.624+00', $4 = '5eed0000-0004-4000-8000-000000000021', $5 = '5eed0002-0004-4000-8000-000000000031'
Update on conversations  (cost=0.29..2.51 rows=1 width=30) (actual time=0.343..0.346 rows=1.00 loops=1)
  Buffers: shared hit=32
  ->  Index Scan using conversations_organization_id_id_unique on conversations  (cost=0.29..2.51 rows=1 width=30) (actual time=0.019..0.021 rows=1.00 loops=1)
        Index Cond: ((organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid) AND (id = '5eed0002-0004-4000-8000-000000000031'::uuid))
        Index Searches: 1
        Buffers: shared hit=3
```

## conversations.resolveIngestedConversation (sin vigente)

Resultado: conversación nueva.

### Consulta 1 de 4

```text
duration: 0.075 ms  plan:
Query Text: select "id" from "clients" where ("clients"."organization_id" = $1 and "clients"."phone_e164" = $2) for update
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '+5491160000019'
LockRows  (cost=0.29..2.51 rows=1 width=22) (actual time=0.068..0.071 rows=1.00 loops=1)
  Buffers: shared hit=5
  ->  Index Scan using clients_organization_phone_unique on clients  (cost=0.29..2.50 rows=1 width=22) (actual time=0.046..0.047 rows=1.00 loops=1)
        Index Cond: ((organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid) AND (phone_e164 = '+5491160000019'::text))
        Index Searches: 1
        Buffers: shared hit=3
```

### Consulta 2 de 4

```text
duration: 0.039 ms  plan:
Query Text: 
    select id, external_ref, status
    from conversations
    where organization_id = $1
      and client_id = $2
      and channel = $3
      and status in ('open', 'pending')
      and external_ref is not null
      and last_message_at >= $4
      and started_at <= $5
    order by greatest(started_at - $6::timestamptz, $7::timestamptz - last_message_at, interval '0'),
      last_message_at desc, id desc
    limit 1
    for update
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '5eed0001-0004-4000-8000-000000000013', $3 = 'whatsapp', $4 = '2026-10-13 09:34:04.308+00', $5 = '2026-10-15 09:34:04.308+00', $6 = '2026-10-14 09:34:04.308+00', $7 = '2026-10-14 09:34:04.308+00'
Limit  (cost=2.53..2.55 rows=1 width=65) (actual time=0.037..0.038 rows=0.00 loops=1)
  Buffers: shared hit=2
  ->  LockRows  (cost=2.53..2.55 rows=1 width=65) (actual time=0.036..0.037 rows=0.00 loops=1)
        Buffers: shared hit=2
        ->  Sort  (cost=2.53..2.54 rows=1 width=65) (actual time=0.036..0.036 rows=0.00 loops=1)
              Sort Key: (GREATEST((started_at - '2026-10-14 09:34:04.308+00'::timestamp with time zone), ('2026-10-14 09:34:04.308+00'::timestamp with time zone - last_message_at), '00:00:00'::interval)), last_message_at DESC, id DESC
              Sort Method: quicksort  Memory: 25kB
              Buffers: shared hit=2
              ->  Index Scan using conversations_organization_client_last_message_idx on conversations  (cost=0.29..2.52 rows=1 width=65) (actual time=0.027..0.027 rows=0.00 loops=1)
                    Index Cond: ((organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid) AND (client_id = '5eed0001-0004-4000-8000-000000000013'::uuid) AND (last_message_at >= '2026-10-13 09:34:04.308+00'::timestamp with time zone))
                    Filter: ((external_ref IS NOT NULL) AND (status = ANY ('{open,pending}'::conversation_status[])) AND (started_at <= '2026-10-15 09:34:04.308+00'::timestamp with time zone) AND (channel = 'whatsapp'::conversation_channel))
                    Index Searches: 1
                    Buffers: shared hit=2
```

### Consulta 3 de 4

```text
duration: 2.327 ms  plan:
Query Text: 
    insert into conversations
      (organization_id, client_id, channel, external_ref, status, started_at, last_message_at)
    values ($1, $2, $3,
      $4, 'open', $5, $6)
    on conflict (organization_id, channel, external_ref) where external_ref is not null
    do nothing
    returning id
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '5eed0001-0004-4000-8000-000000000013', $3 = 'whatsapp', $4 = 'medicion-13-2-propuesta', $5 = '2026-10-14 09:34:04.308+00', $6 = '2026-10-14 09:34:04.308+00'
Insert on conversations  (cost=0.00..0.02 rows=1 width=120) (actual time=0.214..0.215 rows=1.00 loops=1)
  Conflict Resolution: NOTHING
  Conflict Arbiter Indexes: conversations_organization_channel_external_ref_unique
  Tuples Inserted: 1
  Conflicting Tuples: 0
  Buffers: shared hit=19
  ->  Result  (cost=0.00..0.02 rows=1 width=120) (actual time=0.038..0.038 rows=1.00 loops=1)
```

### Consulta 4 de 4

```text
duration: 0.542 ms  plan:
Query Text: 
    insert into messages
      (organization_id, conversation_id, direction, external_ref, sent_at, body_text, kind, sent_by)
    values ($1, $2, $3,
      $4, $5, $6, $7, $8)
    on conflict (organization_id, conversation_id, external_ref) where external_ref is not null
    do nothing
    returning id
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '52c23bee-d0f0-4303-903b-63af88a291ed', $3 = 'inbound', $4 = 'medicion-13-2-mensaje', $5 = '2026-10-14 09:34:04.308+00', $6 = 'Mensaje de la medición', $7 = NULL, $8 = NULL
Insert on messages  (cost=0.00..0.01 rows=1 width=140) (actual time=0.251..0.252 rows=1.00 loops=1)
  Conflict Resolution: NOTHING
  Conflict Arbiter Indexes: messages_organization_conversation_external_ref_unique
  Tuples Inserted: 1
  Conflicting Tuples: 0
  Buffers: shared hit=11
  ->  Result  (cost=0.00..0.01 rows=1 width=140) (actual time=0.036..0.036 rows=1.00 loops=1)
```

## conversations.listRecentMessagesForService (20 de 12, de 265 de la organización)

Resultado: 12 filas.

### Consulta 1 de 2

```text
duration: 0.063 ms  plan:
Query Text: select "id" from "conversations" where ("conversations"."organization_id" = $1 and "conversations"."channel" = $2 and "conversations"."external_ref" = $3) limit $4
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = 'whatsapp', $3 = 'vol-conv-4-38', $4 = '1'
Limit  (cost=0.41..2.63 rows=1 width=16) (actual time=0.058..0.059 rows=1.00 loops=1)
  Buffers: shared hit=4
  ->  Index Scan using conversations_organization_channel_external_ref_unique on conversations  (cost=0.41..2.63 rows=1 width=16) (actual time=0.057..0.057 rows=1.00 loops=1)
        Index Cond: ((organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid) AND (channel = 'whatsapp'::conversation_channel) AND (external_ref = 'vol-conv-4-38'::text))
        Index Searches: 1
        Buffers: shared hit=4
```

### Consulta 2 de 2

```text
duration: 0.079 ms  plan:
Query Text: select "external_ref", "direction", "sent_at", "body_text", "kind", "sent_by" from "messages" where ("messages"."organization_id" = $1 and "messages"."conversation_id" = $2) order by "messages"."sent_at" desc, "messages"."id" desc limit $3
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '5eed0002-0004-4000-8000-000000000025', $3 = '20'
Limit  (cost=5.66..5.71 rows=2 width=100) (actual time=0.043..0.046 rows=12.00 loops=1)
  Buffers: shared hit=4
  ->  Incremental Sort  (cost=5.66..5.71 rows=2 width=100) (actual time=0.041..0.042 rows=12.00 loops=1)
        Sort Key: sent_at DESC, id DESC
        Presorted Key: sent_at
        Full-sort Groups: 1  Sort Method: quicksort  Average Memory: 26kB  Peak Memory: 26kB
        Buffers: shared hit=4
        ->  Index Scan Backward using messages_conversation_sent_idx on messages  (cost=0.42..5.65 rows=1 width=100) (actual time=0.020..0.025 rows=12.00 loops=1)
              Index Cond: (conversation_id = '5eed0002-0004-4000-8000-000000000025'::uuid)
              Filter: (organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid)
              Index Searches: 1
              Buffers: shared hit=4
```

## conversations.listRecentMessagesForService (50, el máximo del contrato)

Resultado: 12 filas.

### Consulta 1 de 2

```text
duration: 0.049 ms  plan:
Query Text: select "id" from "conversations" where ("conversations"."organization_id" = $1 and "conversations"."channel" = $2 and "conversations"."external_ref" = $3) limit $4
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = 'whatsapp', $3 = 'vol-conv-4-38', $4 = '1'
Limit  (cost=0.41..2.63 rows=1 width=16) (actual time=0.045..0.046 rows=1.00 loops=1)
  Buffers: shared hit=4
  ->  Index Scan using conversations_organization_channel_external_ref_unique on conversations  (cost=0.41..2.63 rows=1 width=16) (actual time=0.043..0.043 rows=1.00 loops=1)
        Index Cond: ((organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid) AND (channel = 'whatsapp'::conversation_channel) AND (external_ref = 'vol-conv-4-38'::text))
        Index Searches: 1
        Buffers: shared hit=4
```

### Consulta 2 de 2

```text
duration: 0.086 ms  plan:
Query Text: select "external_ref", "direction", "sent_at", "body_text", "kind", "sent_by" from "messages" where ("messages"."organization_id" = $1 and "messages"."conversation_id" = $2) order by "messages"."sent_at" desc, "messages"."id" desc limit $3
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '5eed0002-0004-4000-8000-000000000025', $3 = '50'
Limit  (cost=5.66..5.71 rows=2 width=100) (actual time=0.059..0.063 rows=12.00 loops=1)
  Buffers: shared hit=4
  ->  Incremental Sort  (cost=5.66..5.71 rows=2 width=100) (actual time=0.057..0.059 rows=12.00 loops=1)
        Sort Key: sent_at DESC, id DESC
        Presorted Key: sent_at
        Full-sort Groups: 1  Sort Method: quicksort  Average Memory: 26kB  Peak Memory: 26kB
        Buffers: shared hit=4
        ->  Index Scan Backward using messages_conversation_sent_idx on messages  (cost=0.42..5.65 rows=1 width=100) (actual time=0.035..0.040 rows=12.00 loops=1)
              Index Cond: (conversation_id = '5eed0002-0004-4000-8000-000000000025'::uuid)
              Filter: (organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid)
              Index Searches: 1
              Buffers: shared hit=4
```

## analytics 1 conversaciones iniciadas

Resultado: valor 7.

### Consulta 1 de 3

```text
duration: 0.026 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.021..0.022 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.020..0.020 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0004-4000-8000-000000000021'::uuid)
        Rows Removed by Filter: 4
        Buffers: shared hit=1
```

### Consulta 2 de 3

```text
duration: 0.028 ms  plan:
Query Text: select to_char((now() at time zone $1)::date, 'YYYY-MM-DD') as today
Query Parameters: $1 = 'America/Argentina/Buenos_Aires'
Result  (cost=0.00..0.02 rows=1 width=32) (actual time=0.025..0.025 rows=1.00 loops=1)
```

### Consulta 3 de 3

```text
duration: 0.039 ms  plan:
Query Text: select count(*) from "conversations" where ("conversations"."organization_id" = $1 and "conversations"."started_at" >= ($2::date::timestamp at time zone $3) and "conversations"."started_at" < (($4::date + 1)::timestamp at time zone $5))
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '2026-08-31', $3 = 'America/Argentina/Buenos_Aires', $4 = '2026-09-29', $5 = 'America/Argentina/Buenos_Aires'
Aggregate  (cost=1.59..1.60 rows=1 width=8) (actual time=0.035..0.035 rows=1.00 loops=1)
  Buffers: shared hit=6
  ->  Index Only Scan using conversations_organization_started_idx on conversations  (cost=0.29..1.57 rows=8 width=0) (actual time=0.020..0.028 rows=7.00 loops=1)
        Index Cond: ((organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid) AND (started_at >= '2026-08-31 03:00:00+00'::timestamp with time zone) AND (started_at < '2026-09-30 03:00:00+00'::timestamp with time zone))
        Heap Fetches: 5
        Index Searches: 1
        Buffers: shared hit=6
```

## analytics 2 conversaciones activas

Resultado: valor 7.

### Consulta 1 de 3

```text
duration: 0.026 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.021..0.022 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.019..0.020 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0004-4000-8000-000000000021'::uuid)
        Rows Removed by Filter: 4
        Buffers: shared hit=1
```

### Consulta 2 de 3

```text
duration: 0.026 ms  plan:
Query Text: select to_char((now() at time zone $1)::date, 'YYYY-MM-DD') as today
Query Parameters: $1 = 'America/Argentina/Buenos_Aires'
Result  (cost=0.00..0.02 rows=1 width=32) (actual time=0.022..0.023 rows=1.00 loops=1)
```

### Consulta 3 de 3

```text
duration: 0.378 ms  plan:
Query Text: select count(distinct "conversation_id") from "messages" where ("messages"."organization_id" = $1 and "messages"."sent_at" >= ($2::date::timestamp at time zone $3) and "messages"."sent_at" < (($4::date + 1)::timestamp at time zone $5))
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '2026-08-31', $3 = 'America/Argentina/Buenos_Aires', $4 = '2026-09-29', $5 = 'America/Argentina/Buenos_Aires'
Aggregate  (cost=33.41..33.42 rows=1 width=8) (actual time=0.367..0.369 rows=1.00 loops=1)
  Buffers: shared hit=14
  ->  Sort  (cost=33.12..33.27 rows=57 width=16) (actual time=0.075..0.081 rows=32.00 loops=1)
        Sort Key: conversation_id
        Sort Method: quicksort  Memory: 25kB
        Buffers: shared hit=14
        ->  Index Scan using messages_organization_sent_idx on messages  (cost=0.42..31.46 rows=57 width=16) (actual time=0.035..0.058 rows=32.00 loops=1)
              Index Cond: ((organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid) AND (sent_at >= '2026-08-31 03:00:00+00'::timestamp with time zone) AND (sent_at < '2026-09-30 03:00:00+00'::timestamp with time zone))
              Index Searches: 1
              Buffers: shared hit=14
```

## analytics 3 clientes únicos

Resultado: valor {"clients":5,"withoutClient":2}.

### Consulta 1 de 3

```text
duration: 0.026 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.022..0.023 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.020..0.020 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0004-4000-8000-000000000021'::uuid)
        Rows Removed by Filter: 4
        Buffers: shared hit=1
```

### Consulta 2 de 3

```text
duration: 0.024 ms  plan:
Query Text: select to_char((now() at time zone $1)::date, 'YYYY-MM-DD') as today
Query Parameters: $1 = 'America/Argentina/Buenos_Aires'
Result  (cost=0.00..0.02 rows=1 width=32) (actual time=0.021..0.021 rows=1.00 loops=1)
```

### Consulta 3 de 3

```text
duration: 0.201 ms  plan:
Query Text: select count(distinct "client_id"), count(*) filter (where "client_id" is null) from "conversations" where ("conversations"."organization_id" = $1 and "conversations"."id" in (select distinct "conversation_id" from "messages" where ("messages"."organization_id" = $2 and "messages"."sent_at" >= ($3::date::timestamp at time zone $4) and "messages"."sent_at" < (($5::date + 1)::timestamp at time zone $6))))
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '5eed0000-0004-4000-8000-000000000021', $3 = '2026-08-31', $4 = 'America/Argentina/Buenos_Aires', $5 = '2026-09-29', $6 = 'America/Argentina/Buenos_Aires'
Aggregate  (cost=58.05..58.06 rows=1 width=16) (actual time=0.192..0.194 rows=1.00 loops=1)
  Buffers: shared hit=45
  ->  Sort  (cost=58.04..58.05 rows=1 width=16) (actual time=0.178..0.181 rows=7.00 loops=1)
        Sort Key: conversations.client_id
        Sort Method: quicksort  Memory: 25kB
        Buffers: shared hit=45
        ->  Hash Join  (cost=33.17..58.03 rows=1 width=16) (actual time=0.127..0.168 rows=7.00 loops=1)
              Hash Cond: (conversations.id = messages.conversation_id)
              Buffers: shared hit=45
              ->  Index Scan using conversations_organization_client_last_message_idx on conversations  (cost=0.29..25.02 rows=50 width=32) (actual time=0.035..0.066 rows=50.00 loops=1)
                    Index Cond: (organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid)
                    Index Searches: 1
                    Buffers: shared hit=33
              ->  Hash  (cost=32.17..32.17 rows=57 width=16) (actual time=0.080..0.080 rows=7.00 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 9kB
                    Buffers: shared hit=12
                    ->  HashAggregate  (cost=31.60..32.17 rows=57 width=16) (actual time=0.069..0.071 rows=7.00 loops=1)
                          Group Key: messages.conversation_id
                          Batches: 1  Memory Usage: 32kB
                          Buffers: shared hit=12
                          ->  Index Scan using messages_organization_sent_idx on messages  (cost=0.42..31.46 rows=57 width=16) (actual time=0.029..0.047 rows=32.00 loops=1)
                                Index Cond: ((organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid) AND (sent_at >= '2026-08-31 03:00:00+00'::timestamp with time zone) AND (sent_at < '2026-09-30 03:00:00+00'::timestamp with time zone))
                                Index Searches: 1
                                Buffers: shared hit=12
```

## analytics 4-5 mensajes

Resultado: valor {"inbound":19,"outbound":13}.

### Consulta 1 de 3

```text
duration: 0.027 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.023..0.023 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.021..0.021 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0004-4000-8000-000000000021'::uuid)
        Rows Removed by Filter: 4
        Buffers: shared hit=1
```

### Consulta 2 de 3

```text
duration: 0.025 ms  plan:
Query Text: select to_char((now() at time zone $1)::date, 'YYYY-MM-DD') as today
Query Parameters: $1 = 'America/Argentina/Buenos_Aires'
Result  (cost=0.00..0.02 rows=1 width=32) (actual time=0.022..0.022 rows=1.00 loops=1)
```

### Consulta 3 de 3

```text
duration: 0.071 ms  plan:
Query Text: select count(*) filter (where "direction" = 'inbound'), count(*) filter (where "direction" = 'outbound') from "messages" where ("messages"."organization_id" = $1 and "messages"."sent_at" >= ($2::date::timestamp at time zone $3) and "messages"."sent_at" < (($4::date + 1)::timestamp at time zone $5))
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '2026-08-31', $3 = 'America/Argentina/Buenos_Aires', $4 = '2026-09-29', $5 = 'America/Argentina/Buenos_Aires'
Aggregate  (cost=32.03..32.04 rows=1 width=16) (actual time=0.065..0.066 rows=1.00 loops=1)
  Buffers: shared hit=12
  ->  Index Scan using messages_organization_sent_idx on messages  (cost=0.42..31.46 rows=57 width=4) (actual time=0.034..0.051 rows=32.00 loops=1)
        Index Cond: ((organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid) AND (sent_at >= '2026-08-31 03:00:00+00'::timestamp with time zone) AND (sent_at < '2026-09-30 03:00:00+00'::timestamp with time zone))
        Index Searches: 1
        Buffers: shared hit=12
```

## analytics 6 mensajes por conversación

Resultado: valor {"status":"value","conversations":.

### Consulta 1 de 3

```text
duration: 0.028 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.023..0.024 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.021..0.022 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0004-4000-8000-000000000021'::uuid)
        Rows Removed by Filter: 4
        Buffers: shared hit=1
```

### Consulta 2 de 3

```text
duration: 0.025 ms  plan:
Query Text: select to_char((now() at time zone $1)::date, 'YYYY-MM-DD') as today
Query Parameters: $1 = 'America/Argentina/Buenos_Aires'
Result  (cost=0.00..0.02 rows=1 width=32) (actual time=0.021..0.022 rows=1.00 loops=1)
```

### Consulta 3 de 3

```text
duration: 0.150 ms  plan:
Query Text: 
    with per_conversation as (
      select count(*) as n
      from "messages"
      where ("messages"."organization_id" = $1 and "messages"."sent_at" >= ($2::date::timestamp at time zone $3) and "messages"."sent_at" < (($4::date + 1)::timestamp at time zone $5))
      group by "messages"."conversation_id"
    )
    select count(*) as conversations,
           coalesce(sum(n), 0) as messages,
           percentile_cont(0.5) within group (order by n) as median
    from per_conversation
  
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '2026-08-31', $3 = 'America/Argentina/Buenos_Aires', $4 = '2026-09-29', $5 = 'America/Argentina/Buenos_Aires'
Aggregate  (cost=33.46..33.47 rows=1 width=48) (actual time=0.143..0.144 rows=1.00 loops=1)
  Buffers: shared hit=20
  ->  HashAggregate  (cost=31.75..32.32 rows=57 width=24) (actual time=0.057..0.060 rows=7.00 loops=1)
        Group Key: messages.conversation_id
        Batches: 1  Memory Usage: 32kB
        Buffers: shared hit=12
        ->  Index Scan using messages_organization_sent_idx on messages  (cost=0.42..31.46 rows=57 width=16) (actual time=0.020..0.036 rows=32.00 loops=1)
              Index Cond: ((organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid) AND (sent_at >= '2026-08-31 03:00:00+00'::timestamp with time zone) AND (sent_at < '2026-09-30 03:00:00+00'::timestamp with time zone))
              Index Searches: 1
              Buffers: shared hit=12
```

## analytics 10 actividad diaria

Resultado: valor [{"day":"2026-08-31","started":0,".

### Consulta 1 de 3

```text
duration: 0.027 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.023..0.024 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.021..0.022 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0004-4000-8000-000000000021'::uuid)
        Rows Removed by Filter: 4
        Buffers: shared hit=1
```

### Consulta 2 de 3

```text
duration: 0.025 ms  plan:
Query Text: select to_char((now() at time zone $1)::date, 'YYYY-MM-DD') as today
Query Parameters: $1 = 'America/Argentina/Buenos_Aires'
Result  (cost=0.00..0.02 rows=1 width=32) (actual time=0.022..0.022 rows=1.00 loops=1)
```

### Consulta 3 de 3

```text
duration: 0.316 ms  plan:
Query Text: 
    with days as (
      select d::date as day
      from generate_series($1::date, $2::date, interval '1 day') as d
    ),
    started as (
      select ("conversations"."started_at" at time zone $3)::date as day,
             count(*) as started
      from "conversations"
      where "conversations"."organization_id" = $4
        and "conversations"."started_at" >= ($5::date::timestamp at time zone $6)
        and "conversations"."started_at" < (($7::date + 1)::timestamp at time zone $8)
      group by 1
    ),
    sent as (
      select ("messages"."sent_at" at time zone $9)::date as day,
             count(distinct "messages"."conversation_id") as active,
             count(*) filter (where "messages"."direction" = 'inbound') as inbound,
             count(*) filter (where "messages"."direction" = 'outbound') as outbound
      from "messages"
      where ("messages"."organization_id" = $10 and "messages"."sent_at" >= ($11::date::timestamp at time zone $12) and "messages"."sent_at" < (($13::date + 1)::timestamp at time zone $14))
      group by 1
    )
    select to_char(days.day, 'YYYY-MM-DD') as day,
           coalesce(started.started, 0) as started,
           coalesce(sent.active, 0) as active,
           coalesce(sent.inbound, 0) as inbound,
           coalesce(sent.outbound, 0) as outbound
    from days
    left join started on started.day = days.day
    left join sent on sent.day = days.day
    order by days.day
  
Query Parameters: $1 = '2026-08-31', $2 = '2026-09-29', $3 = 'America/Argentina/Buenos_Aires', $4 = '5eed0000-0004-4000-8000-000000000021', $5 = '2026-08-31', $6 = 'America/Argentina/Buenos_Aires', $7 = '2026-09-29', $8 = 'America/Argentina/Buenos_Aires', $9 = 'America/Argentina/Buenos_Aires', $10 = '5eed0000-0004-4000-8000-000000000021', $11 = '2026-08-31', $12 = 'America/Argentina/Buenos_Aires', $13 = '2026-09-29', $14 = 'America/Argentina/Buenos_Aires'
Merge Left Join  (cost=36.49..40.02 rows=30 width=68) (actual time=0.240..0.292 rows=30.00 loops=1)
  Merge Cond: (((d.d)::date) = (((messages.sent_at AT TIME ZONE 'America/Argentina/Buenos_Aires'::text))::date))
  Buffers: shared hit=16
  ->  Sort  (cost=3.08..3.16 rows=30 width=16) (actual time=0.122..0.127 rows=30.00 loops=1)
        Sort Key: ((d.d)::date)
        Sort Method: quicksort  Memory: 25kB
        Buffers: shared hit=4
        ->  Hash Left Join  (cost=1.95..2.35 rows=30 width=16) (actual time=0.090..0.111 rows=30.00 loops=1)
              Hash Cond: ((d.d)::date = started.day)
              Buffers: shared hit=4
              ->  Function Scan on generate_series d  (cost=0.01..0.31 rows=30 width=8) (actual time=0.024..0.027 rows=30.00 loops=1)
              ->  Hash  (cost=1.85..1.85 rows=8 width=12) (actual time=0.060..0.061 rows=6.00 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 9kB
                    Buffers: shared hit=4
                    ->  Subquery Scan on started  (cost=1.65..1.85 rows=8 width=12) (actual time=0.048..0.052 rows=6.00 loops=1)
                          Buffers: shared hit=4
                          ->  HashAggregate  (cost=1.65..1.77 rows=8 width=12) (actual time=0.047..0.049 rows=6.00 loops=1)
                                Group Key: ((conversations.started_at AT TIME ZONE 'America/Argentina/Buenos_Aires'::text))::date
                                Batches: 1  Memory Usage: 32kB
                                Buffers: shared hit=4
                                ->  Index Only Scan using conversations_organization_started_idx on conversations  (cost=0.29..1.61 rows=8 width=4) (actual time=0.026..0.033 rows=7.00 loops=1)
                                      Index Cond: ((organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid) AND (started_at >= '2026-08-31 03:00:00+00'::timestamp with time zone) AND (started_at < '2026-09-30 03:00:00+00'::timestamp with time zone))
                                      Heap Fetches: 4
                                      Index Searches: 1
                                      Buffers: shared hit=4
  ->  GroupAggregate  (cost=33.41..35.26 rows=57 width=28) (actual time=0.104..0.118 rows=7.00 loops=1)
        Group Key: (((messages.sent_at AT TIME ZONE 'America/Argentina/Buenos_Aires'::text))::date)
        Buffers: shared hit=12
        ->  Sort  (cost=33.41..33.55 rows=57 width=24) (actual time=0.096..0.099 rows=32.00 loops=1)
              Sort Key: (((messages.sent_at AT TIME ZONE 'America/Argentina/Buenos_Aires'::text))::date), messages.conversation_id
              Sort Method: quicksort  Memory: 26kB
              Buffers: shared hit=12
              ->  Index Scan using messages_organization_sent_idx on messages  (cost=0.42..31.75 rows=57 width=24) (actual time=0.026..0.066 rows=32.00 loops=1)
                    Index Cond: ((organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid) AND (sent_at >= '2026-08-31 03:00:00+00'::timestamp with time zone) AND (sent_at < '2026-09-30 03:00:00+00'::timestamp with time zone))
                    Index Searches: 1
                    Buffers: shared hit=12
```

## analytics 7 respondidas

Resultado: valor 6.

### Consulta 1 de 3

```text
duration: 0.029 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.023..0.024 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.022..0.022 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0004-4000-8000-000000000021'::uuid)
        Rows Removed by Filter: 4
        Buffers: shared hit=1
```

### Consulta 2 de 3

```text
duration: 0.024 ms  plan:
Query Text: select to_char((now() at time zone $1)::date, 'YYYY-MM-DD') as today
Query Parameters: $1 = 'America/Argentina/Buenos_Aires'
Result  (cost=0.00..0.02 rows=1 width=32) (actual time=0.021..0.021 rows=1.00 loops=1)
```

### Consulta 3 de 3

```text
duration: 0.261 ms  plan:
Query Text: 
    with per_conversation as (
      select min("messages"."sent_at") filter (where "messages"."direction" = 'inbound') as first_inbound,
             max("messages"."sent_at") filter (where "messages"."direction" = 'outbound') as last_outbound
      from "messages"
      where ("messages"."organization_id" = $1 and "messages"."sent_at" >= ($2::date::timestamp at time zone $3) and "messages"."sent_at" < (($4::date + 1)::timestamp at time zone $5))
      group by "messages"."conversation_id"
    )
    select count(*) as responded
    from per_conversation
    where first_inbound is not null
      and last_outbound is not null
      and last_outbound > first_inbound
  
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '2026-08-31', $3 = 'America/Argentina/Buenos_Aires', $4 = '2026-09-29', $5 = 'America/Argentina/Buenos_Aires'
Aggregate  (cost=33.12..33.13 rows=1 width=8) (actual time=0.254..0.255 rows=1.00 loops=1)
  Buffers: shared hit=12
  ->  HashAggregate  (cost=32.17..32.89 rows=19 width=32) (actual time=0.245..0.250 rows=6.00 loops=1)
        Group Key: messages.conversation_id
        Filter: ((min(messages.sent_at) FILTER (WHERE (messages.direction = 'inbound'::message_direction)) IS NOT NULL) AND (max(messages.sent_at) FILTER (WHERE (messages.direction = 'outbound'::message_direction)) IS NOT NULL) AND (max(messages.sent_at) FILTER (WHERE (messages.direction = 'outbound'::message_direction)) > min(messages.sent_at) FILTER (WHERE (messages.direction = 'inbound'::message_direction))))
        Batches: 1  Memory Usage: 32kB
        Rows Removed by Filter: 1
        Buffers: shared hit=12
        ->  Index Scan using messages_organization_sent_idx on messages  (cost=0.42..31.46 rows=57 width=28) (actual time=0.102..0.123 rows=32.00 loops=1)
              Index Cond: ((organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid) AND (sent_at >= '2026-08-31 03:00:00+00'::timestamp with time zone) AND (sent_at < '2026-09-30 03:00:00+00'::timestamp with time zone))
              Index Searches: 1
              Buffers: shared hit=12
```

## analytics 8 cobertura de respuesta

Resultado: valor {"status":"value","responded":6,"w.

### Consulta 1 de 3

```text
duration: 0.027 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.023..0.024 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.021..0.021 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0004-4000-8000-000000000021'::uuid)
        Rows Removed by Filter: 4
        Buffers: shared hit=1
```

### Consulta 2 de 3

```text
duration: 0.023 ms  plan:
Query Text: select to_char((now() at time zone $1)::date, 'YYYY-MM-DD') as today
Query Parameters: $1 = 'America/Argentina/Buenos_Aires'
Result  (cost=0.00..0.02 rows=1 width=32) (actual time=0.019..0.020 rows=1.00 loops=1)
```

### Consulta 3 de 3

```text
duration: 0.091 ms  plan:
Query Text: 
    with per_conversation as (
      select min("messages"."sent_at") filter (where "messages"."direction" = 'inbound') as first_inbound,
             max("messages"."sent_at") filter (where "messages"."direction" = 'outbound') as last_outbound
      from "messages"
      where ("messages"."organization_id" = $1 and "messages"."sent_at" >= ($2::date::timestamp at time zone $3) and "messages"."sent_at" < (($4::date + 1)::timestamp at time zone $5))
      group by "messages"."conversation_id"
    )
    select count(*) filter (
             where last_outbound is not null and last_outbound > first_inbound
           ) as responded,
           count(*) as with_inbound
    from per_conversation
    where first_inbound is not null
  
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '2026-08-31', $3 = 'America/Argentina/Buenos_Aires', $4 = '2026-09-29', $5 = 'America/Argentina/Buenos_Aires'
Aggregate  (cost=33.74..33.75 rows=1 width=16) (actual time=0.085..0.086 rows=1.00 loops=1)
  Buffers: shared hit=12
  ->  HashAggregate  (cost=32.17..32.74 rows=57 width=32) (actual time=0.078..0.081 rows=7.00 loops=1)
        Group Key: messages.conversation_id
        Filter: (min(messages.sent_at) FILTER (WHERE (messages.direction = 'inbound'::message_direction)) IS NOT NULL)
        Batches: 1  Memory Usage: 32kB
        Buffers: shared hit=12
        ->  Index Scan using messages_organization_sent_idx on messages  (cost=0.42..31.46 rows=57 width=28) (actual time=0.034..0.052 rows=32.00 loops=1)
              Index Cond: ((organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid) AND (sent_at >= '2026-08-31 03:00:00+00'::timestamp with time zone) AND (sent_at < '2026-09-30 03:00:00+00'::timestamp with time zone))
              Index Searches: 1
              Buffers: shared hit=12
```

## analytics 9 tiempo de primera respuesta

Resultado: valor {"population":7,"withoutResponse":.

### Consulta 1 de 3

```text
duration: 0.027 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.022..0.023 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.020..0.020 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0004-4000-8000-000000000021'::uuid)
        Rows Removed by Filter: 4
        Buffers: shared hit=1
```

### Consulta 2 de 3

```text
duration: 0.024 ms  plan:
Query Text: select to_char((now() at time zone $1)::date, 'YYYY-MM-DD') as today
Query Parameters: $1 = 'America/Argentina/Buenos_Aires'
Result  (cost=0.00..0.02 rows=1 width=32) (actual time=0.021..0.021 rows=1.00 loops=1)
```

### Consulta 3 de 3

```text
duration: 0.328 ms  plan:
Query Text: 
    with candidates as (
      select distinct "messages"."conversation_id" as conversation_id
      from "messages"
      where ("messages"."organization_id" = $1 and "messages"."sent_at" >= ($2::date::timestamp at time zone $3) and "messages"."sent_at" < (($4::date + 1)::timestamp at time zone $5))
    ),
    -- materialized: sin esto, PostgreSQL inlinea el CTE y repite la subconsulta del primer
    -- entrante una vez por cada condición que la filtra, duplicando las búsquedas por índice
    -- (brief-7.2, medición).
    first_inbound as materialized (
      select candidates.conversation_id,
             (select min(m.sent_at)
              from "messages" m
              where m.conversation_id = candidates.conversation_id
                and m.organization_id = $6
                and m.direction = 'inbound') as sent_at
      from candidates
    ),
    population as (
      select conversation_id, sent_at
      from first_inbound
      where sent_at >= ($7::date::timestamp at time zone $8)
        and sent_at < (($9::date + 1)::timestamp at time zone $10)
    ),
    deltas as (
      select population.conversation_id,
             (select min(m.sent_at)
              from "messages" m
              where m.conversation_id = population.conversation_id
                and m.organization_id = $11
                and m.direction = 'outbound'
                and m.sent_at > population.sent_at) - population.sent_at as delta
      from population
    )
    select count(*) as population,
           count(delta) as with_response,
           percentile_cont(0.5) within group (
             order by extract(epoch from delta) / 60
           ) filter (where delta is not null) as median_minutes
    from deltas
  
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '2026-08-31', $3 = 'America/Argentina/Buenos_Aires', $4 = '2026-09-29', $5 = 'America/Argentina/Buenos_Aires', $6 = '5eed0000-0004-4000-8000-000000000021', $7 = '2026-08-31', $8 = 'America/Argentina/Buenos_Aires', $9 = '2026-09-29', $10 = 'America/Argentina/Buenos_Aires', $11 = '5eed0000-0004-4000-8000-000000000021'
Aggregate  (cost=397.08..397.09 rows=1 width=24) (actual time=0.314..0.319 rows=1.00 loops=1)
  Buffers: shared hit=118
  CTE first_inbound
    ->  Subquery Scan on candidates  (cost=31.60..384.63 rows=57 width=24) (actual time=0.114..0.153 rows=7.00 loops=1)
          Buffers: shared hit=40
          ->  HashAggregate  (cost=31.60..32.17 rows=57 width=16) (actual time=0.087..0.090 rows=7.00 loops=1)
                Group Key: messages.conversation_id
                Batches: 1  Memory Usage: 32kB
                Buffers: shared hit=12
                ->  Index Scan using messages_organization_sent_idx on messages  (cost=0.42..31.46 rows=57 width=16) (actual time=0.041..0.062 rows=32.00 loops=1)
                      Index Cond: ((organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid) AND (sent_at >= '2026-08-31 03:00:00+00'::timestamp with time zone) AND (sent_at < '2026-09-30 03:00:00+00'::timestamp with time zone))
                      Index Searches: 1
                      Buffers: shared hit=12
          SubPlan 2
            ->  Result  (cost=6.17..6.18 rows=1 width=8) (actual time=0.007..0.007 rows=1.00 loops=7)
                  Buffers: shared hit=28
                  InitPlan 1
                    ->  Limit  (cost=0.42..6.17 rows=1 width=8) (actual time=0.006..0.006 rows=1.00 loops=7)
                          Buffers: shared hit=28
                          ->  Index Scan using messages_conversation_sent_idx on messages m  (cost=0.42..6.17 rows=1 width=8) (actual time=0.005..0.005 rows=1.00 loops=7)
                                Index Cond: (conversation_id = candidates.conversation_id)
                                Filter: ((organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid) AND (direction = 'inbound'::message_direction))
                                Rows Removed by Filter: 0
                                Index Searches: 7
                                Buffers: shared hit=28
  ->  CTE Scan on first_inbound  (cost=0.00..1.43 rows=1 width=24) (actual time=0.118..0.160 rows=7.00 loops=1)
        Filter: ((sent_at >= '2026-08-31 03:00:00+00'::timestamp with time zone) AND (sent_at < '2026-09-30 03:00:00+00'::timestamp with time zone))
        Storage: Memory  Maximum Storage: 17kB
        Buffers: shared hit=40
  SubPlan 5
    ->  Result  (cost=3.66..3.67 rows=1 width=8) (actual time=0.006..0.006 rows=1.00 loops=7)
          Buffers: shared hit=27
          InitPlan 4
            ->  Limit  (cost=0.42..3.66 rows=1 width=8) (actual time=0.005..0.006 rows=0.86 loops=7)
                  Buffers: shared hit=27
                  ->  Index Scan using messages_conversation_sent_idx on messages m_1  (cost=0.42..3.66 rows=1 width=8) (actual time=0.005..0.005 rows=0.86 loops=7)
                        Index Cond: ((conversation_id = first_inbound.conversation_id) AND (sent_at > first_inbound.sent_at))
                        Filter: ((organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid) AND (direction = 'outbound'::message_direction))
                        Rows Removed by Filter: 0
                        Index Searches: 7
                        Buffers: shared hit=27
  SubPlan 9
    ->  Result  (cost=3.66..3.67 rows=1 width=8) (actual time=0.004..0.004 rows=1.00 loops=7)
          Buffers: shared hit=27
          InitPlan 8
            ->  Limit  (cost=0.42..3.66 rows=1 width=8) (actual time=0.003..0.003 rows=0.86 loops=7)
                  Buffers: shared hit=27
                  ->  Index Scan using messages_conversation_sent_idx on messages m_3  (cost=0.42..3.66 rows=1 width=8) (actual time=0.003..0.003 rows=0.86 loops=7)
                        Index Cond: ((conversation_id = first_inbound.conversation_id) AND (sent_at > first_inbound.sent_at))
                        Filter: ((organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid) AND (direction = 'outbound'::message_direction))
                        Rows Removed by Filter: 0
                        Index Searches: 7
                        Buffers: shared hit=27
  SubPlan 7
    ->  Result  (cost=3.66..3.67 rows=1 width=8) (actual time=0.004..0.005 rows=1.00 loops=6)
          Buffers: shared hit=24
          InitPlan 6
            ->  Limit  (cost=0.42..3.66 rows=1 width=8) (actual time=0.004..0.004 rows=1.00 loops=6)
                  Buffers: shared hit=24
                  ->  Index Scan using messages_conversation_sent_idx on messages m_2  (cost=0.42..3.66 rows=1 width=8) (actual time=0.003..0.003 rows=1.00 loops=6)
                        Index Cond: ((conversation_id = first_inbound.conversation_id) AND (sent_at > first_inbound.sent_at))
                        Filter: ((organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid) AND (direction = 'outbound'::message_direction))
                        Rows Removed by Filter: 0
                        Index Searches: 6
                        Buffers: shared hit=24
```

## analytics 11 distribución de estado

Resultado: valor {"open":1,"pending":4,"closed":2}.

### Consulta 1 de 3

```text
duration: 0.033 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.028..0.029 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.025..0.026 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0004-4000-8000-000000000021'::uuid)
        Rows Removed by Filter: 4
        Buffers: shared hit=1
```

### Consulta 2 de 3

```text
duration: 0.024 ms  plan:
Query Text: select to_char((now() at time zone $1)::date, 'YYYY-MM-DD') as today
Query Parameters: $1 = 'America/Argentina/Buenos_Aires'
Result  (cost=0.00..0.02 rows=1 width=32) (actual time=0.020..0.020 rows=1.00 loops=1)
```

### Consulta 3 de 3

```text
duration: 0.140 ms  plan:
Query Text: select count(*) filter (where "status" = 'open'), count(*) filter (where "status" = 'pending'), count(*) filter (where "status" = 'closed') from "conversations" where ("conversations"."organization_id" = $1 and "conversations"."id" in (select distinct "conversation_id" from "messages" where ("messages"."organization_id" = $2 and "messages"."sent_at" >= ($3::date::timestamp at time zone $4) and "messages"."sent_at" < (($5::date + 1)::timestamp at time zone $6))))
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '5eed0000-0004-4000-8000-000000000021', $3 = '2026-08-31', $4 = 'America/Argentina/Buenos_Aires', $5 = '2026-09-29', $6 = 'America/Argentina/Buenos_Aires'
Aggregate  (cost=58.05..58.06 rows=1 width=24) (actual time=0.132..0.135 rows=1.00 loops=1)
  Buffers: shared hit=19
  ->  Hash Join  (cost=33.17..58.03 rows=1 width=4) (actual time=0.106..0.127 rows=7.00 loops=1)
        Hash Cond: (conversations.id = messages.conversation_id)
        Buffers: shared hit=19
        ->  Index Scan using conversations_organization_id_id_unique on conversations  (cost=0.29..25.02 rows=50 width=20) (actual time=0.036..0.051 rows=50.00 loops=1)
              Index Cond: (organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid)
              Index Searches: 1
              Buffers: shared hit=7
        ->  Hash  (cost=32.17..32.17 rows=57 width=16) (actual time=0.060..0.061 rows=7.00 loops=1)
              Buckets: 1024  Batches: 1  Memory Usage: 9kB
              Buffers: shared hit=12
              ->  HashAggregate  (cost=31.60..32.17 rows=57 width=16) (actual time=0.055..0.057 rows=7.00 loops=1)
                    Group Key: messages.conversation_id
                    Batches: 1  Memory Usage: 32kB
                    Buffers: shared hit=12
                    ->  Index Scan using messages_organization_sent_idx on messages  (cost=0.42..31.46 rows=57 width=16) (actual time=0.018..0.035 rows=32.00 loops=1)
                          Index Cond: ((organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid) AND (sent_at >= '2026-08-31 03:00:00+00'::timestamp with time zone) AND (sent_at < '2026-09-30 03:00:00+00'::timestamp with time zone))
                          Index Searches: 1
                          Buffers: shared hit=12
```

## analytics 12 errores de ingestión

Resultado: valor {"status":"value","total":20,"fail.

### Consulta 1 de 3

```text
duration: 0.026 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.022..0.023 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.020..0.021 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0004-4000-8000-000000000021'::uuid)
        Rows Removed by Filter: 4
        Buffers: shared hit=1
```

### Consulta 2 de 3

```text
duration: 0.020 ms  plan:
Query Text: select to_char((now() at time zone $1)::date, 'YYYY-MM-DD') as today
Query Parameters: $1 = 'America/Argentina/Buenos_Aires'
Result  (cost=0.00..0.02 rows=1 width=32) (actual time=0.017..0.018 rows=1.00 loops=1)
```

### Consulta 3 de 3

```text
duration: 0.112 ms  plan:
Query Text: 
    with events as (
      select "ingestion_events"."status" as status,
             "ingestion_events"."source" as source,
             "ingestion_events"."error_code" as error_code
      from "ingestion_events"
      where ("ingestion_events"."organization_id" = $1 and "ingestion_events"."received_at" >= ($2::date::timestamp at time zone $3) and "ingestion_events"."received_at" < (($4::date + 1)::timestamp at time zone $5) and "ingestion_events"."event_type" not in ('client.resolved', 'conversation.escalated'))
    ),
    groups as (
      select source, error_code, count(*)::int as failures
      from events
      where status = 'failed'
      group by source, error_code
    )
    select (select count(*)::int from events) as total,
           (select count(*)::int from events where status = 'failed') as failed,
           coalesce(
             (select json_agg(
                json_build_object('source', source, 'errorCode', error_code, 'count', failures)
                order by failures desc, source, error_code)
              from groups),
             '[]'::json
           ) as groups
  
Query Parameters: $1 = '5eed0000-0004-4000-8000-000000000021', $2 = '2026-08-31', $3 = 'America/Argentina/Buenos_Aires', $4 = '2026-09-29', $5 = 'America/Argentina/Buenos_Aires'
Result  (cost=11.84..11.85 rows=1 width=40) (actual time=0.105..0.107 rows=1.00 loops=1)
  Buffers: shared hit=16
  CTE events
    ->  Index Scan using ingestion_events_organization_received_idx on ingestion_events  (cost=0.29..10.61 rows=17 width=26) (actual time=0.041..0.061 rows=20.00 loops=1)
          Index Cond: ((organization_id = '5eed0000-0004-4000-8000-000000000021'::uuid) AND (received_at >= '2026-08-31 03:00:00+00'::timestamp with time zone) AND (received_at < '2026-09-30 03:00:00+00'::timestamp with time zone))
          Filter: (event_type <> ALL ('{client.resolved,conversation.escalated}'::text[]))
          Index Searches: 1
          Buffers: shared hit=16
  InitPlan 2
    ->  Aggregate  (cost=0.38..0.40 rows=1 width=4) (actual time=0.083..0.084 rows=1.00 loops=1)
          Buffers: shared hit=16
          ->  CTE Scan on events  (cost=0.00..0.34 rows=17 width=0) (actual time=0.046..0.076 rows=20.00 loops=1)
                Storage: Memory  Maximum Storage: 17kB
                Buffers: shared hit=16
  InitPlan 3
    ->  Aggregate  (cost=0.39..0.40 rows=1 width=4) (actual time=0.005..0.005 rows=1.00 loops=1)
          ->  CTE Scan on events events_1  (cost=0.00..0.38 rows=1 width=0) (actual time=0.004..0.004 rows=0.00 loops=1)
                Filter: (status = 'failed'::ingestion_event_status)
                Rows Removed by Filter: 20
                Storage: Memory  Maximum Storage: 17kB
  InitPlan 4
    ->  Aggregate  (cost=0.43..0.44 rows=1 width=32) (actual time=0.012..0.013 rows=1.00 loops=1)
          ->  Sort  (cost=0.41..0.42 rows=1 width=68) (actual time=0.011..0.011 rows=0.00 loops=1)
                Sort Key: ((count(*))::integer) DESC, events_2.source, events_2.error_code
                Sort Method: quicksort  Memory: 25kB
                ->  HashAggregate  (cost=0.39..0.40 rows=1 width=68) (actual time=0.003..0.004 rows=0.00 loops=1)
                      Group Key: events_2.source, events_2.error_code
                      Batches: 1  Memory Usage: 32kB
                      ->  CTE Scan on events events_2  (cost=0.00..0.38 rows=1 width=64) (actual time=0.002..0.002 rows=0.00 loops=1)
                            Filter: (status = 'failed'::ingestion_event_status)
                            Rows Removed by Filter: 20
                            Storage: Memory  Maximum Storage: 17kB
```
