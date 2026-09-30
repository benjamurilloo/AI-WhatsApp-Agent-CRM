# Planes — producción, grande

Parámetros: effective_cache_size = 131072 8kB; plan_cache_mode = auto; random_page_cost = 1.1; seq_page_cost = 1; server_version = 18.6 (Ubuntu 18.6-1.pgdg24.04+2); shared_buffers = 16384 8kB; work_mem = 4096 kB.

## catalog.searchProducts (sin texto)

Resultado: 9491 filas.

### Consulta 1 de 1

```text
duration: 60.727 ms  plan:
Query Text: select "id", "sku", "name", "description", "unit", "reorder_point", "brand", "category", "condition", "is_active", "created_at", "updated_at" from "products" where ("products"."organization_id" = $1 and "products"."is_active" = $2)
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = 't'
Seq Scan on products  (cost=0.00..506.25 rows=9504 width=172) (actual time=0.016..15.417 rows=9491.00 loops=1)
  Filter: (is_active AND (organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid))
  Rows Removed by Filter: 4609
  Buffers: shared hit=330
```

## inventory.listProductStock (sin filtro)

Resultado: 25/9491 filas.

### Consulta 1 de 2

```text
duration: 66.831 ms  plan:
Query Text: select "id", "sku", "name", "description", "unit", "reorder_point", "brand", "category", "condition", "is_active", "created_at", "updated_at" from "products" where ("products"."organization_id" = $1 and "products"."is_active" = $2)
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = 't'
Seq Scan on products  (cost=0.00..506.25 rows=9504 width=172) (actual time=0.019..13.146 rows=9491.00 loops=1)
  Filter: (is_active AND (organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid))
  Rows Removed by Filter: 4609
  Buffers: shared hit=330
```

### Consulta 2 de 2

```text
duration: 34.035 ms  plan:
Query Text: select "product_id", "quantity_on_hand" from "inventories" where ("inventories"."organization_id" = $1 and "inventories"."product_id" in ($2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51, $52, $53, $54, $55, $56, $57, $58, $59, $60, $61, $62, $63, $64, $65, $66, $67, $68, $69, $70, $71, $72, $73, $74, $75, $76, $77, $78, $79, $80, $81, $82, $83, $84, $85, $86, $87, $88, $89, $90, $91, $92, $93 [… recortado: la línea tiene 65483 caracteres]
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '5eed0004-0000-4000-8000-000000000000', $3 = '5eed0004-0000-4000-8000-000000000002', $4 = '5eed0004-0000-4000-8000-000000000003', $5 = '5eed0004-0000-4000-8000-000000000004', $6 = '5eed0004-0000-4000-8000-000000000005', $7 = '5eed0004-0000-4000-8000-000000000006', $8 = '5eed0004-0000-4000-8000-000000000007', $9 = '5eed0004-0000-4000-8000-000000000008', $10 = '5eed0004-0000-4000-8000-000000000009', $11 = '5eed0004-0000-4000-8000-00000000000a', $12 = '5eed0004-0000-4000-8000-00000000000b', $13 = '5eed0004-0000-4000-8000-00000000 [… recortado: la línea tiene 454525 caracteres]
Index Scan using inventories_product_id_unique on inventories  (cost=0.29..341.13 rows=6718 width=20) (actual time=1.900..23.261 rows=8122.00 loops=1)
  Index Cond: (product_id = ANY ('{5eed0004-0000-4000-8000-000000000000,5eed0004-0000-4000-8000-000000000002,5eed0004-0000-4000-8000-000000000003,5eed0004-0000-4000-8000-000000000004,5eed0004-0000-4000-8000-000000000005,5eed0004-0000-4000-8000-000000000006,5eed0004-0000-4000-8000-000000000007,5eed0004-0000-4000-8000-000000000008,5eed0004-0000-4000-8000-000000000009,5eed0004-0000-4000-8000-00000000000a,5eed0004-0000-4000-8000-00000000000b,5eed0004-0000-4000-8000-00000000000c,5eed0004-0000-4000-8000-00000000000d,5eed0004-0000-4000-8000-00000000000e,5eed0004-0000-4000-8000-00000000000f,5eed0004-0 [… recortado: la línea tiene 351213 caracteres]
  Filter: (organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid)
  Index Searches: 1
  Buffers: shared hit=132
```

## inventory.listProductStock (página profunda)

Resultado: 25/9491 filas.

### Consulta 1 de 2

```text
duration: 50.623 ms  plan:
Query Text: select "id", "sku", "name", "description", "unit", "reorder_point", "brand", "category", "condition", "is_active", "created_at", "updated_at" from "products" where ("products"."organization_id" = $1 and "products"."is_active" = $2)
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = 't'
Seq Scan on products  (cost=0.00..506.25 rows=9504 width=172) (actual time=0.024..11.974 rows=9491.00 loops=1)
  Filter: (is_active AND (organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid))
  Rows Removed by Filter: 4609
  Buffers: shared hit=330
```

### Consulta 2 de 2

```text
duration: 22.931 ms  plan:
Query Text: select "product_id", "quantity_on_hand" from "inventories" where ("inventories"."organization_id" = $1 and "inventories"."product_id" in ($2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51, $52, $53, $54, $55, $56, $57, $58, $59, $60, $61, $62, $63, $64, $65, $66, $67, $68, $69, $70, $71, $72, $73, $74, $75, $76, $77, $78, $79, $80, $81, $82, $83, $84, $85, $86, $87, $88, $89, $90, $91, $92, $93 [… recortado: la línea tiene 65483 caracteres]
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '5eed0004-0000-4000-8000-000000000000', $3 = '5eed0004-0000-4000-8000-000000000002', $4 = '5eed0004-0000-4000-8000-000000000003', $5 = '5eed0004-0000-4000-8000-000000000004', $6 = '5eed0004-0000-4000-8000-000000000005', $7 = '5eed0004-0000-4000-8000-000000000006', $8 = '5eed0004-0000-4000-8000-000000000007', $9 = '5eed0004-0000-4000-8000-000000000008', $10 = '5eed0004-0000-4000-8000-000000000009', $11 = '5eed0004-0000-4000-8000-00000000000a', $12 = '5eed0004-0000-4000-8000-00000000000b', $13 = '5eed0004-0000-4000-8000-00000000 [… recortado: la línea tiene 454525 caracteres]
Index Scan using inventories_product_id_unique on inventories  (cost=0.29..341.13 rows=6718 width=20) (actual time=0.959..11.006 rows=8122.00 loops=1)
  Index Cond: (product_id = ANY ('{5eed0004-0000-4000-8000-000000000000,5eed0004-0000-4000-8000-000000000002,5eed0004-0000-4000-8000-000000000003,5eed0004-0000-4000-8000-000000000004,5eed0004-0000-4000-8000-000000000005,5eed0004-0000-4000-8000-000000000006,5eed0004-0000-4000-8000-000000000007,5eed0004-0000-4000-8000-000000000008,5eed0004-0000-4000-8000-000000000009,5eed0004-0000-4000-8000-00000000000a,5eed0004-0000-4000-8000-00000000000b,5eed0004-0000-4000-8000-00000000000c,5eed0004-0000-4000-8000-00000000000d,5eed0004-0000-4000-8000-00000000000e,5eed0004-0000-4000-8000-00000000000f,5eed0004-0 [… recortado: la línea tiene 351213 caracteres]
  Filter: (organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid)
  Index Searches: 1
  Buffers: shared hit=132
```

## crm.searchClients (sin texto)

Resultado: 25/10000 filas.

### Consulta 1 de 2

```text
duration: 3.209 ms  plan:
Query Text: select count(*) from "clients" where "clients"."organization_id" = $1
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021'
Aggregate  (cost=268.23..268.24 rows=1 width=8) (actual time=3.193..3.195 rows=1.00 loops=1)
  Buffers: shared hit=63
  ->  Index Only Scan using clients_organization_id_id_unique on clients  (cost=0.29..243.26 rows=9987 width=0) (actual time=0.039..2.228 rows=10000.00 loops=1)
        Index Cond: (organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid)
        Heap Fetches: 0
        Index Searches: 1
        Buffers: shared hit=63
```

### Consulta 2 de 2

```text
duration: 21.448 ms  plan:
Query Text: select "id", "display_name", "phone_e164", "notes", "is_active", "created_at", "updated_at" from "clients" where "clients"."organization_id" = $1 order by lower("clients"."display_name"), "clients"."id" asc limit $2
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '25'
Limit  (cost=680.81..680.87 rows=25 width=131) (actual time=21.381..21.390 rows=25.00 loops=1)
  Buffers: shared hit=198
  ->  Sort  (cost=680.81..705.77 rows=9987 width=131) (actual time=21.377..21.382 rows=25.00 loops=1)
        Sort Key: (lower(display_name)), id
        Sort Method: top-N heapsort  Memory: 30kB
        Buffers: shared hit=198
        ->  Seq Scan on clients  (cost=0.00..398.98 rows=9987 width=131) (actual time=0.055..15.431 rows=10000.00 loops=1)
              Filter: (organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid)
              Rows Removed by Filter: 4100
              Buffers: shared hit=198
```

## crm.searchClients (página profunda)

Resultado: 25/10000 filas.

### Consulta 1 de 2

```text
duration: 3.353 ms  plan:
Query Text: select count(*) from "clients" where "clients"."organization_id" = $1
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021'
Aggregate  (cost=268.23..268.24 rows=1 width=8) (actual time=3.340..3.341 rows=1.00 loops=1)
  Buffers: shared hit=63
  ->  Index Only Scan using clients_organization_id_id_unique on clients  (cost=0.29..243.26 rows=9987 width=0) (actual time=0.037..2.030 rows=10000.00 loops=1)
        Index Cond: (organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid)
        Heap Fetches: 0
        Index Searches: 1
        Buffers: shared hit=63
```

### Consulta 2 de 2

```text
duration: 41.112 ms  plan:
Query Text: select "id", "display_name", "phone_e164", "notes", "is_active", "created_at", "updated_at" from "clients" where "clients"."organization_id" = $1 order by lower("clients"."display_name"), "clients"."id" asc limit $2 offset $3
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '25', $3 = '2475'
Limit  (cost=1018.75..1018.82 rows=25 width=131) (actual time=41.042..41.054 rows=25.00 loops=1)
  Buffers: shared hit=198
  ->  Sort  (cost=1012.57..1037.53 rows=9987 width=131) (actual time=40.440..40.897 rows=2500.00 loops=1)
        Sort Key: (lower(display_name)), id
        Sort Method: top-N heapsort  Memory: 751kB
        Buffers: shared hit=198
        ->  Seq Scan on clients  (cost=0.00..398.98 rows=9987 width=131) (actual time=0.032..16.090 rows=10000.00 loops=1)
              Filter: (organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid)
              Rows Removed by Filter: 4100
              Buffers: shared hit=198
```

## crm.searchClients (prefijo de nombre)

Resultado: 25/961 filas.

### Consulta 1 de 4

```text
duration: 1.293 ms  plan:
Query Text:  SELECT public.unaccent('public.unaccent'::regdictionary, $1) 
Query Parameters: $1 = 'ana%'
Result  (cost=0.00..0.01 rows=1 width=32) (actual time=1.287..1.287 rows=1.00 loops=1)
  Buffers: shared hit=12
```

### Consulta 2 de 4

```text
duration: 5.597 ms  plan:
Query Text: select count(*) from "clients" where ("clients"."organization_id" = $1 and immutable_unaccent(lower("clients"."display_name")) like immutable_unaccent(lower($2)))
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = 'ana%'
Aggregate  (cost=399.91..399.92 rows=1 width=8) (actual time=5.589..5.590 rows=1.00 loops=1)
  Buffers: shared hit=683
  ->  Index Scan using clients_organization_display_name_unaccent_idx on clients  (cost=0.29..397.56 rows=940 width=0) (actual time=0.119..5.409 rows=961.00 loops=1)
        Index Cond: ((organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid) AND (immutable_unaccent(lower(display_name)) ~>=~ 'ana'::text) AND (immutable_unaccent(lower(display_name)) ~<~ 'anb'::text))
        Filter: (immutable_unaccent(lower(display_name)) ~~ 'ana%'::text)
        Index Searches: 1
        Buffers: shared hit=683
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
duration: 10.587 ms  plan:
Query Text: select "id", "display_name", "phone_e164", "notes", "is_active", "created_at", "updated_at" from "clients" where ("clients"."organization_id" = $1 and immutable_unaccent(lower("clients"."display_name")) like immutable_unaccent(lower($2))) order by lower("clients"."display_name"), "clients"."id" asc limit $3
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = 'ana%', $3 = '25'
Limit  (cost=426.44..426.50 rows=25 width=131) (actual time=10.532..10.539 rows=25.00 loops=1)
  Buffers: shared hit=683
  ->  Sort  (cost=426.44..428.79 rows=940 width=131) (actual time=10.530..10.533 rows=25.00 loops=1)
        Sort Key: (lower(display_name)), id
        Sort Method: top-N heapsort  Memory: 28kB
        Buffers: shared hit=683
        ->  Index Scan using clients_organization_display_name_unaccent_idx on clients  (cost=0.29..399.91 rows=940 width=131) (actual time=0.261..8.447 rows=961.00 loops=1)
              Index Cond: ((organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid) AND (immutable_unaccent(lower(display_name)) ~>=~ 'ana'::text) AND (immutable_unaccent(lower(display_name)) ~<~ 'anb'::text))
              Filter: (immutable_unaccent(lower(display_name)) ~~ 'ana%'::text)
              Index Searches: 1
              Buffers: shared hit=683
```

## conversations.listConversations

Resultado: 25/10000 filas.

### Consulta 1 de 5

```text
duration: 0.025 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.021..0.022 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.019..0.019 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0000-4000-8000-000000000021'::uuid)
        Buffers: shared hit=1
```

### Consulta 2 de 5

```text
duration: 3.296 ms  plan:
Query Text: select count(*) from "conversations" where "conversations"."organization_id" = $1
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021'
Aggregate  (cost=268.49..268.50 rows=1 width=8) (actual time=3.281..3.283 rows=1.00 loops=1)
  Buffers: shared hit=68
  ->  Index Only Scan using conversations_organization_id_id_unique on conversations  (cost=0.29..243.48 rows=10000 width=0) (actual time=0.045..2.360 rows=10000.00 loops=1)
        Index Cond: (organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid)
        Heap Fetches: 69
        Index Searches: 1
        Buffers: shared hit=68
```

### Consulta 3 de 5

```text
duration: 0.228 ms  plan:
Query Text: select "id", "client_id", "channel", "status", "started_at", "last_message_at" from "conversations" where "conversations"."organization_id" = $1 order by "conversations"."last_message_at" desc nulls last, "conversations"."id" desc limit $2
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '25'
Limit  (cost=0.34..2.60 rows=25 width=56) (actual time=0.141..0.148 rows=25.00 loops=1)
  Buffers: shared hit=32
  ->  Incremental Sort  (cost=0.34..904.29 rows=10000 width=56) (actual time=0.139..0.142 rows=25.00 loops=1)
        Sort Key: last_message_at DESC NULLS LAST, id DESC
        Presorted Key: last_message_at
        Full-sort Groups: 1  Sort Method: quicksort  Average Memory: 28kB  Peak Memory: 28kB
        Buffers: shared hit=32
        ->  Index Scan using conversations_organization_last_message_idx on conversations  (cost=0.29..454.29 rows=10000 width=56) (actual time=0.031..0.074 rows=26.00 loops=1)
              Index Cond: (organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid)
              Index Searches: 1
              Buffers: shared hit=29
```

### Consulta 4 de 5

```text
duration: 0.193 ms  plan:
Query Text: select "id", "display_name", "phone_e164", "notes", "is_active", "created_at", "updated_at" from "clients" where ("clients"."organization_id" = $1 and "clients"."id" in ($2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24))
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '5eed0001-0000-4000-8000-000000000b60', $3 = '5eed0001-0000-4000-8000-0000000024ef', $4 = '5eed0001-0000-4000-8000-0000000016ba', $5 = '5eed0001-0000-4000-8000-0000000010e3', $6 = '5eed0001-0000-4000-8000-0000000000c2', $7 = '5eed0001-0000-4000-8000-00000000099d', $8 = '5eed0001-0000-4000-8000-0000000025c2', $9 = '5eed0001-0000-4000-8000-0000000009dc', $10 = '5eed0001-0000-4000-8000-0000000025ba', $11 = '5eed0001-0000-4000-8000-0000000008da', $12 = '5eed0001-0000-4000-8000-0000000000df', $13 = '5eed0001-0000-4000-8000-000000000b45', $14 = '5eed0001-0000-4000-8000-000000000944', $15 = '5eed0001-0000-4000-8000-00000000127b', $16 = '5eed0001-0000-4000-8000-0000000013fa', $17 = '5eed0001-0000-4000-8000-000000000ae5', $18 = '5eed0001-0000-4000-8000-000000000f69', $19 = '5eed0001-0000-4000-8000-00000000130d', $20 = '5eed0001-0000-4000-8000-000000001379', $21 = '5eed0001-0000-4000-8000-0000000026b8', $22 = '5eed0001-0000-4000-8000-0000000021de', $23 = '5eed0001-0000-4000-8000-000000001310', $24 = '5eed0001-0000-4000-8000-000000001f56'
Index Scan using clients_pkey on clients  (cost=0.29..25.66 rows=16 width=99) (actual time=0.043..0.153 rows=23.00 loops=1)
  Index Cond: (id = ANY ('{5eed0001-0000-4000-8000-000000000b60,5eed0001-0000-4000-8000-0000000024ef,5eed0001-0000-4000-8000-0000000016ba,5eed0001-0000-4000-8000-0000000010e3,5eed0001-0000-4000-8000-0000000000c2,5eed0001-0000-4000-8000-00000000099d,5eed0001-0000-4000-8000-0000000025c2,5eed0001-0000-4000-8000-0000000009dc,5eed0001-0000-4000-8000-0000000025ba,5eed0001-0000-4000-8000-0000000008da,5eed0001-0000-4000-8000-0000000000df,5eed0001-0000-4000-8000-000000000b45,5eed0001-0000-4000-8000-000000000944,5eed0001-0000-4000-8000-00000000127b,5eed0001-0000-4000-8000-0000000013fa,5eed0001-0000-4000-8000-000000000ae5,5eed0001-0000-4000-8000-000000000f69,5eed0001-0000-4000-8000-00000000130d,5eed0001-0000-4000-8000-000000001379,5eed0001-0000-4000-8000-0000000026b8,5eed0001-0000-4000-8000-0000000021de,5eed0001-0000-4000-8000-000000001310,5eed0001-0000-4000-8000-000000001f56}'::uuid[]))
  Filter: (organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid)
  Index Searches: 14
  Buffers: shared hit=48
```

### Consulta 5 de 5

```text
duration: 0.651 ms  plan:
Query Text: select "conversation_id", count(*) from "messages" where ("messages"."organization_id" = $1 and "messages"."conversation_id" in ($2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)) group by "messages"."conversation_id"
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '5eed0002-0000-4000-8000-00000000213a', $3 = '5eed0002-0000-4000-8000-0000000023dd', $4 = '5eed0002-0000-4000-8000-0000000000c9', $5 = '5eed0002-0000-4000-8000-000000000d91', $6 = '5eed0002-0000-4000-8000-00000000047b', $7 = '5eed0002-0000-4000-8000-0000000025d1', $8 = '5eed0002-0000-4000-8000-000000001dd1', $9 = '5eed0002-0000-4000-8000-0000000026cc', $10 = '5eed0002-0000-4000-8000-000000001a29', $11 = '5eed0002-0000-4000-8000-00000000208a', $12 = '5eed0002-0000-4000-8000-000000000d2a', $13 = '5eed0002-0000-4000-8000-000000000455', $14 = '5eed0002-0000-4000-8000-0000000015de', $15 = '5eed0002-0000-4000-8000-000000000b61', $16 = '5eed0002-0000-4000-8000-000000001200', $17 = '5eed0002-0000-4000-8000-00000000136f', $18 = '5eed0002-0000-4000-8000-000000000a42', $19 = '5eed0002-0000-4000-8000-000000000a27', $20 = '5eed0002-0000-4000-8000-0000000022b9', $21 = '5eed0002-0000-4000-8000-00000000045e', $22 = '5eed0002-0000-4000-8000-000000000db5', $23 = '5eed0002-0000-4000-8000-000000002634', $24 = '5eed0002-0000-4000-8000-0000000017d1', $25 = '5eed0002-0000-4000-8000-000000001f37', $26 = '5eed0002-0000-4000-8000-000000001a4a'
GroupAggregate  (cost=0.42..129.61 rows=123 width=24) (actual time=0.102..0.579 rows=25.00 loops=1)
  Group Key: conversation_id
  Buffers: shared hit=102
  ->  Index Scan using messages_conversation_sent_idx on messages  (cost=0.42..127.76 rows=124 width=16) (actual time=0.066..0.498 rows=203.00 loops=1)
        Index Cond: (conversation_id = ANY ('{5eed0002-0000-4000-8000-00000000213a,5eed0002-0000-4000-8000-0000000023dd,5eed0002-0000-4000-8000-0000000000c9,5eed0002-0000-4000-8000-000000000d91,5eed0002-0000-4000-8000-00000000047b,5eed0002-0000-4000-8000-0000000025d1,5eed0002-0000-4000-8000-000000001dd1,5eed0002-0000-4000-8000-0000000026cc,5eed0002-0000-4000-8000-000000001a29,5eed0002-0000-4000-8000-00000000208a,5eed0002-0000-4000-8000-000000000d2a,5eed0002-0000-4000-8000-000000000455,5eed0002-0000-4000-8000-0000000015de,5eed0002-0000-4000-8000-000000000b61,5eed0002-0000-4000-8000-000000001200,5eed0002-0000-4000-8000-00000000136f,5eed0002-0000-4000-8000-000000000a42,5eed0002-0000-4000-8000-000000000a27,5eed0002-0000-4000-8000-0000000022b9,5eed0002-0000-4000-8000-00000000045e,5eed0002-0000-4000-8000-000000000db5,5eed0002-0000-4000-8000-000000002634,5eed0002-0000-4000-8000-0000000017d1,5eed0002-0000-4000-8000-000000001f37,5eed0002-0000-4000-8000-000000001a4a}'::uuid[]))
        Filter: (organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid)
        Index Searches: 24
        Buffers: shared hit=102
```

## conversations.searchClientsByLastInteraction

Resultado: 25/10000 filas.

### Consulta 1 de 4

```text
duration: 58.681 ms  plan:
Query Text: select "id" from "clients" where "clients"."organization_id" = $1 order by lower("clients"."display_name"), "clients"."id" asc
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021'
Sort  (cost=1062.41..1087.38 rows=9987 width=48) (actual time=44.571..47.837 rows=10000.00 loops=1)
  Sort Key: (lower(display_name)), id
  Sort Method: quicksort  Memory: 924kB
  Buffers: shared hit=204
  ->  Seq Scan on clients  (cost=0.00..398.98 rows=9987 width=48) (actual time=0.076..15.591 rows=10000.00 loops=1)
        Filter: (organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid)
        Rows Removed by Filter: 4100
        Buffers: shared hit=198
```

### Consulta 2 de 4

```text
duration: 27.674 ms  plan:
Query Text: select "client_id", max("last_message_at") from "conversations" where ("conversations"."organization_id" = $1 and "conversations"."client_id" is not null and "conversations"."last_message_at" is not null) group by "conversations"."client_id"
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021'
GroupAggregate  (cost=0.29..358.71 rows=6093 width=24) (actual time=2.242..17.358 rows=5552.00 loops=1)
  Group Key: client_id
  Buffers: shared hit=76
  ->  Index Only Scan using conversations_organization_client_last_message_idx on conversations  (cost=0.29..257.69 rows=8018 width=24) (actual time=2.223..8.215 rows=8009.00 loops=1)
        Index Cond: ((organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid) AND (client_id IS NOT NULL) AND (last_message_at IS NOT NULL))
        Heap Fetches: 54
        Index Searches: 1
        Buffers: shared hit=76
```

### Consulta 3 de 4

```text
duration: 0.225 ms  plan:
Query Text: select "id", "display_name", "phone_e164", "notes", "is_active", "created_at", "updated_at" from "clients" where ("clients"."organization_id" = $1 and "clients"."id" in ($2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26))
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '5eed0001-0000-4000-8000-000000000b60', $3 = '5eed0001-0000-4000-8000-0000000024ef', $4 = '5eed0001-0000-4000-8000-0000000016ba', $5 = '5eed0001-0000-4000-8000-0000000010e3', $6 = '5eed0001-0000-4000-8000-0000000000c2', $7 = '5eed0001-0000-4000-8000-00000000099d', $8 = '5eed0001-0000-4000-8000-0000000025c2', $9 = '5eed0001-0000-4000-8000-0000000009dc', $10 = '5eed0001-0000-4000-8000-0000000025ba', $11 = '5eed0001-0000-4000-8000-0000000008da', $12 = '5eed0001-0000-4000-8000-0000000000df', $13 = '5eed0001-0000-4000-8000-000000000b45', $14 = '5eed0001-0000-4000-8000-000000000944', $15 = '5eed0001-0000-4000-8000-00000000127b', $16 = '5eed0001-0000-4000-8000-0000000013fa', $17 = '5eed0001-0000-4000-8000-000000000ae5', $18 = '5eed0001-0000-4000-8000-000000000f69', $19 = '5eed0001-0000-4000-8000-00000000130d', $20 = '5eed0001-0000-4000-8000-000000001379', $21 = '5eed0001-0000-4000-8000-0000000026b8', $22 = '5eed0001-0000-4000-8000-0000000021de', $23 = '5eed0001-0000-4000-8000-000000001310', $24 = '5eed0001-0000-4000-8000-000000001f56', $25 = '5eed0001-0000-4000-8000-000000001a41', $26 = '5eed0001-0000-4000-8000-000000001fff'
Index Scan using clients_pkey on clients  (cost=0.29..25.68 rows=18 width=99) (actual time=0.042..0.175 rows=25.00 loops=1)
  Index Cond: (id = ANY ('{5eed0001-0000-4000-8000-000000000b60,5eed0001-0000-4000-8000-0000000024ef,5eed0001-0000-4000-8000-0000000016ba,5eed0001-0000-4000-8000-0000000010e3,5eed0001-0000-4000-8000-0000000000c2,5eed0001-0000-4000-8000-00000000099d,5eed0001-0000-4000-8000-0000000025c2,5eed0001-0000-4000-8000-0000000009dc,5eed0001-0000-4000-8000-0000000025ba,5eed0001-0000-4000-8000-0000000008da,5eed0001-0000-4000-8000-0000000000df,5eed0001-0000-4000-8000-000000000b45,5eed0001-0000-4000-8000-000000000944,5eed0001-0000-4000-8000-00000000127b,5eed0001-0000-4000-8000-0000000013fa,5eed0001-0000-4000-8000-000000000ae5,5eed0001-0000-4000-8000-000000000f69,5eed0001-0000-4000-8000-00000000130d,5eed0001-0000-4000-8000-000000001379,5eed0001-0000-4000-8000-0000000026b8,5eed0001-0000-4000-8000-0000000021de,5eed0001-0000-4000-8000-000000001310,5eed0001-0000-4000-8000-000000001f56,5eed0001-0000-4000-8000-000000001a41,5eed0001-0000-4000-8000-000000001fff}'::uuid[]))
  Filter: (organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid)
  Index Searches: 16
  Buffers: shared hit=54
```

### Consulta 4 de 4

```text
duration: 0.021 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.017..0.018 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.016..0.016 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0000-4000-8000-000000000021'::uuid)
        Buffers: shared hit=1
```

## organizations.listMembers

Resultado: 25/501 filas.

### Consulta 1 de 2

```text
duration: 2.694 ms  plan:
Query Text: select "id", "user_id", "role", "created_at" from "organization_members" where "organization_members"."organization_id" = $1
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021'
Index Scan using organization_members_organization_id_idx on organization_members  (cost=0.15..18.22 rows=501 width=44) (actual time=0.016..0.282 rows=501.00 loops=1)
  Index Cond: (organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid)
  Index Searches: 1
  Buffers: shared hit=8
```

### Consulta 2 de 2

```text
duration: 0.913 ms  plan:
Query Text: select "id", "name", "email", "is_active" from "users" where "users"."id" in ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51, $52, $53, $54, $55, $56, $57, $58, $59, $60, $61, $62, $63, $64, $65, $66, $67, $68, $69, $70, $71, $72, $73, $74, $75, $76, $77, $78, $79, $80, $81, $82, $83, $84, $85, $86, $87, $88, $89, $90, $91, $92, $93, $94, $95, $96, $97, $98, $99, $100, $101, $102, $103, $104, $105, $106, $107, $108, $109, $110, $111, $112, $113, $114, $115, $116, $117, $118, $119, $120, $121, $122, $123, $124, $125, $126, $127, $128, $129, $130, $131, $132, $133, $134, $135, $136, $137, $138, $139, $140, $141, $142, $143, $144, $145, $146, $147, $148, $149, $150, $151, $152, $153, $154, $155, $156, $157, $158, $159, $160, $161, $162, $163, $164, $165, $166, $167, $168, $169, $170, $171, $172, $173, $174, $175, $176, $177, $178, $179, $180, $181, $182, $183, $184, $185, $186, $187, $188, $189, $190, $191, $192, $193, $194, $195, $196, $197, $198, $199, $200, $201, $202, $203, $204, $205, $206, $207, $208, $209, $210, $211, $212, $213, $214, $215, $216, $217, $218, $219, $220, $221, $222, $223, $224, $225, $226, $227, $228, $229, $230, $231, $232, $233, $234, $235, $236, $237, $238, $239, $240, $241, $242, $243, $244, $245, $246, $247, $248, $249, $250, $251, $252, $253, $254, $255, $256, $257, $258, $259, $260, $261, $262, $263, $264, $265, $266, $267, $268, $269, $270, $271, $272, $273, $274, $275, $276, $277, $278, $279, $280, $281, $282, $283, $284, $285, $286, $287, $288, $289, $290, $291, $292, $293, $294, $295, $296, $297, $298, $299, $300, $301, $302, $303, $304, $305, $306, $307, $308, $309, $310, $311, $312, $313, $314, $315, $316, $317, $318, $319, $320, $321, $322, $323, $324, $325, $326, $327, $328, $329, $330, $331, $332, $333, $334, $335, $336, $337, $338, $339, $340, $341, $342, $343, $344, $345, $346, $347, $348, $349, $350, $351, $352, $353, $354, $355, $356, $357, $358, $359, $360, $361, $362, $363, $364, $365, $366, $367, $368, $369, $370, $371, $372, $373, $374, $375, $376, $377, $378, $379, $380, $381, $382, $383, $384, $385, $386, $387, $388, $389, $390, $391, $392, $393, $394, $395, $396, $397, $398, $399, $400, $401, $402, $403, $404, $405, $406, $407, $408, $409, $410, $411, $412, $413, $414, $415, $416, $417, $418, $419, $420, $421, $422, $423, $424, $425, $426, $427, $428, $429, $430, $431, $432, $433, $434, $435, $436, $437, $438, $439, $440, $441, $442, $443, $444, $445, $446, $447, $448, $449, $450, $451, $452, $453, $454, $455, $456, $457, $458, $459, $460, $461, $462, $463, $464, $465, $466, $467, $468, $469, $470, $471, $472, $473, $474, $475, $476, $477, $478, $479, $480, $481, $482, $483, $484, $485, $486, $487, $488, $489, $490, $491, $492, $493, $494, $495, $496, $497, $498, $499, $500, $501)
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000022', $2 = '5eed0007-0000-4000-8000-000000000000', $3 = '5eed0007-0000-4000-8000-000000000001', $4 = '5eed0007-0000-4000-8000-000000000002', $5 = '5eed0007-0000-4000-8000-000000000003', $6 = '5eed0007-0000-4000-8000-000000000004', $7 = '5eed0007-0000-4000-8000-000000000005', $8 = '5eed0007-0000-4000-8000-000000000006', $9 = '5eed0007-0000-4000-8000-000000000007', $10 = '5eed0007-0000-4000-8000-000000000008', $11 = '5eed0007-0000-4000-8000-000000000009', $12 = '5eed0007-0000-4000-8000-00000000000a', $13 = '5eed0007-0000-4000-8000-00000000 [… recortado: la línea tiene 23455 caracteres]
Index Scan using users_pkey on users  (cost=0.28..28.61 rows=501 width=62) (actual time=0.122..0.431 rows=501.00 loops=1)
  Index Cond: (id = ANY ('{5eed0000-0000-4000-8000-000000000022,5eed0007-0000-4000-8000-000000000000,5eed0007-0000-4000-8000-000000000001,5eed0007-0000-4000-8000-000000000002,5eed0007-0000-4000-8000-000000000003,5eed0007-0000-4000-8000-000000000004,5eed0007-0000-4000-8000-000000000005,5eed0007-0000-4000-8000-000000000006,5eed0007-0000-4000-8000-000000000007,5eed0007-0000-4000-8000-000000000008,5eed0007-0000-4000-8000-000000000009,5eed0007-0000-4000-8000-00000000000a,5eed0007-0000-4000-8000-00000000000b,5eed0007-0000-4000-8000-00000000000c,5eed0007-0000-4000-8000-00000000000d,5eed0007-0000-4000 [… recortado: la línea tiene 18575 caracteres]
  Index Searches: 1
  Buffers: shared hit=17
```

## inventory.listProductStock (última página)

Resultado: 16/9491 filas.

### Consulta 1 de 2

```text
duration: 90.956 ms  plan:
Query Text: select "id", "sku", "name", "description", "unit", "reorder_point", "brand", "category", "condition", "is_active", "created_at", "updated_at" from "products" where ("products"."organization_id" = $1 and "products"."is_active" = $2)
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = 't'
Seq Scan on products  (cost=0.00..506.25 rows=9504 width=172) (actual time=0.021..25.450 rows=9491.00 loops=1)
  Filter: (is_active AND (organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid))
  Rows Removed by Filter: 4609
  Buffers: shared hit=330
```

### Consulta 2 de 2

```text
duration: 23.207 ms  plan:
Query Text: select "product_id", "quantity_on_hand" from "inventories" where ("inventories"."organization_id" = $1 and "inventories"."product_id" in ($2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51, $52, $53, $54, $55, $56, $57, $58, $59, $60, $61, $62, $63, $64, $65, $66, $67, $68, $69, $70, $71, $72, $73, $74, $75, $76, $77, $78, $79, $80, $81, $82, $83, $84, $85, $86, $87, $88, $89, $90, $91, $92, $93 [… recortado: la línea tiene 65483 caracteres]
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '5eed0004-0000-4000-8000-000000000000', $3 = '5eed0004-0000-4000-8000-000000000002', $4 = '5eed0004-0000-4000-8000-000000000003', $5 = '5eed0004-0000-4000-8000-000000000004', $6 = '5eed0004-0000-4000-8000-000000000005', $7 = '5eed0004-0000-4000-8000-000000000006', $8 = '5eed0004-0000-4000-8000-000000000007', $9 = '5eed0004-0000-4000-8000-000000000008', $10 = '5eed0004-0000-4000-8000-000000000009', $11 = '5eed0004-0000-4000-8000-00000000000a', $12 = '5eed0004-0000-4000-8000-00000000000b', $13 = '5eed0004-0000-4000-8000-00000000 [… recortado: la línea tiene 454525 caracteres]
Index Scan using inventories_product_id_unique on inventories  (cost=0.29..341.13 rows=6718 width=20) (actual time=1.832..13.715 rows=8122.00 loops=1)
  Index Cond: (product_id = ANY ('{5eed0004-0000-4000-8000-000000000000,5eed0004-0000-4000-8000-000000000002,5eed0004-0000-4000-8000-000000000003,5eed0004-0000-4000-8000-000000000004,5eed0004-0000-4000-8000-000000000005,5eed0004-0000-4000-8000-000000000006,5eed0004-0000-4000-8000-000000000007,5eed0004-0000-4000-8000-000000000008,5eed0004-0000-4000-8000-000000000009,5eed0004-0000-4000-8000-00000000000a,5eed0004-0000-4000-8000-00000000000b,5eed0004-0000-4000-8000-00000000000c,5eed0004-0000-4000-8000-00000000000d,5eed0004-0000-4000-8000-00000000000e,5eed0004-0000-4000-8000-00000000000f,5eed0004-0 [… recortado: la línea tiene 351213 caracteres]
  Filter: (organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid)
  Index Searches: 1
  Buffers: shared hit=132
```

## crm.searchClients (última página)

Resultado: 25/10000 filas.

### Consulta 1 de 2

```text
duration: 3.439 ms  plan:
Query Text: select count(*) from "clients" where "clients"."organization_id" = $1
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021'
Aggregate  (cost=268.23..268.24 rows=1 width=8) (actual time=3.423..3.425 rows=1.00 loops=1)
  Buffers: shared hit=63
  ->  Index Only Scan using clients_organization_id_id_unique on clients  (cost=0.29..243.26 rows=9987 width=0) (actual time=0.036..2.357 rows=10000.00 loops=1)
        Index Cond: (organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid)
        Heap Fetches: 0
        Index Searches: 1
        Buffers: shared hit=63
```

### Consulta 2 de 2

```text
duration: 52.495 ms  plan:
Query Text: select "id", "display_name", "phone_e164", "notes", "is_active", "created_at", "updated_at" from "clients" where "clients"."organization_id" = $1 order by lower("clients"."display_name"), "clients"."id" asc limit $2 offset $3
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '25', $3 = '9975'
Limit  (cost=1087.35..1087.38 rows=12 width=131) (actual time=52.419..52.430 rows=25.00 loops=1)
  Buffers: shared hit=198
  ->  Sort  (cost=1062.41..1087.38 rows=9987 width=131) (actual time=49.821..51.767 rows=10000.00 loops=1)
        Sort Key: (lower(display_name)), id
        Sort Method: quicksort  Memory: 1713kB
        Buffers: shared hit=198
        ->  Seq Scan on clients  (cost=0.00..398.98 rows=9987 width=131) (actual time=0.029..17.120 rows=10000.00 loops=1)
              Filter: (organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid)
              Rows Removed by Filter: 4100
              Buffers: shared hit=198
```

## conversations.listConversations (última página)

Resultado: 25/10000 filas.

### Consulta 1 de 5

```text
duration: 0.024 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.020..0.021 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.018..0.019 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0000-4000-8000-000000000021'::uuid)
        Buffers: shared hit=1
```

### Consulta 2 de 5

```text
duration: 3.128 ms  plan:
Query Text: select count(*) from "conversations" where "conversations"."organization_id" = $1
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021'
Aggregate  (cost=268.49..268.50 rows=1 width=8) (actual time=3.113..3.115 rows=1.00 loops=1)
  Buffers: shared hit=64
  ->  Index Only Scan using conversations_organization_id_id_unique on conversations  (cost=0.29..243.48 rows=10000 width=0) (actual time=0.036..2.269 rows=10000.00 loops=1)
        Index Cond: (organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid)
        Heap Fetches: 62
        Index Searches: 1
        Buffers: shared hit=64
```

### Consulta 3 de 5

```text
duration: 13.838 ms  plan:
Query Text: select "id", "client_id", "channel", "status", "started_at", "last_message_at" from "conversations" where "conversations"."organization_id" = $1 order by "conversations"."last_message_at" desc nulls last, "conversations"."id" desc limit $2 offset $3
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '25', $3 = '9975'
Limit  (cost=902.03..904.29 rows=25 width=56) (actual time=13.759..13.785 rows=25.00 loops=1)
  Buffers: shared hit=10004
  ->  Incremental Sort  (cost=0.34..904.29 rows=10000 width=56) (actual time=0.180..13.170 rows=10000.00 loops=1)
        Sort Key: last_message_at DESC NULLS LAST, id DESC
        Presorted Key: last_message_at
        Full-sort Groups: 313  Sort Method: quicksort  Average Memory: 29kB  Peak Memory: 29kB
        Buffers: shared hit=10004
        ->  Index Scan using conversations_organization_last_message_idx on conversations  (cost=0.29..454.29 rows=10000 width=56) (actual time=0.038..9.107 rows=10000.00 loops=1)
              Index Cond: (organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid)
              Index Searches: 1
              Buffers: shared hit=10004
```

### Consulta 4 de 5

```text
duration: 0.147 ms  plan:
Query Text: select "id", "display_name", "phone_e164", "notes", "is_active", "created_at", "updated_at" from "clients" where ("clients"."organization_id" = $1 and "clients"."id" in ($2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17))
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '5eed0001-0000-4000-8000-000000001ab2', $3 = '5eed0001-0000-4000-8000-00000000136f', $4 = '5eed0001-0000-4000-8000-0000000007cf', $5 = '5eed0001-0000-4000-8000-0000000007ad', $6 = '5eed0001-0000-4000-8000-000000000c8a', $7 = '5eed0001-0000-4000-8000-000000002369', $8 = '5eed0001-0000-4000-8000-000000002551', $9 = '5eed0001-0000-4000-8000-00000000183e', $10 = '5eed0001-0000-4000-8000-0000000026be', $11 = '5eed0001-0000-4000-8000-000000000d5e', $12 = '5eed0001-0000-4000-8000-000000000104', $13 = '5eed0001-0000-4000-8000-00000000061f', $14 = '5eed0001-0000-4000-8000-0000000002ce', $15 = '5eed0001-0000-4000-8000-0000000022b9', $16 = '5eed0001-0000-4000-8000-0000000016ec', $17 = '5eed0001-0000-4000-8000-0000000009e2'
Index Scan using clients_pkey on clients  (cost=0.29..21.39 rows=11 width=99) (actual time=0.038..0.119 rows=16.00 loops=1)
  Index Cond: (id = ANY ('{5eed0001-0000-4000-8000-000000001ab2,5eed0001-0000-4000-8000-00000000136f,5eed0001-0000-4000-8000-0000000007cf,5eed0001-0000-4000-8000-0000000007ad,5eed0001-0000-4000-8000-000000000c8a,5eed0001-0000-4000-8000-000000002369,5eed0001-0000-4000-8000-000000002551,5eed0001-0000-4000-8000-00000000183e,5eed0001-0000-4000-8000-0000000026be,5eed0001-0000-4000-8000-000000000d5e,5eed0001-0000-4000-8000-000000000104,5eed0001-0000-4000-8000-00000000061f,5eed0001-0000-4000-8000-0000000002ce,5eed0001-0000-4000-8000-0000000022b9,5eed0001-0000-4000-8000-0000000016ec,5eed0001-0000-4000-8000-0000000009e2}'::uuid[]))
  Filter: (organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid)
  Index Searches: 14
  Buffers: shared hit=43
```

### Consulta 5 de 5

```text
duration: 0.283 ms  plan:
Query Text: select "conversation_id", count(*) from "messages" where ("messages"."organization_id" = $1 and "messages"."conversation_id" in ($2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)) group by "messages"."conversation_id"
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '5eed0002-0000-4000-8000-000000002526', $3 = '5eed0002-0000-4000-8000-0000000022e6', $4 = '5eed0002-0000-4000-8000-000000002236', $5 = '5eed0002-0000-4000-8000-0000000020db', $6 = '5eed0002-0000-4000-8000-0000000011ef', $7 = '5eed0002-0000-4000-8000-0000000001ba', $8 = '5eed0002-0000-4000-8000-000000000c24', $9 = '5eed0002-0000-4000-8000-000000001771', $10 = '5eed0002-0000-4000-8000-000000001901', $11 = '5eed0002-0000-4000-8000-0000000015c8', $12 = '5eed0002-0000-4000-8000-000000000df7', $13 = '5eed0002-0000-4000-8000-000000000bce', $14 = '5eed0002-0000-4000-8000-000000001463', $15 = '5eed0002-0000-4000-8000-000000001b70', $16 = '5eed0002-0000-4000-8000-0000000007dd', $17 = '5eed0002-0000-4000-8000-000000000094', $18 = '5eed0002-0000-4000-8000-000000000d64', $19 = '5eed0002-0000-4000-8000-000000001ac4', $20 = '5eed0002-0000-4000-8000-00000000152a', $21 = '5eed0002-0000-4000-8000-000000001e1e', $22 = '5eed0002-0000-4000-8000-000000001c28', $23 = '5eed0002-0000-4000-8000-000000000445', $24 = '5eed0002-0000-4000-8000-000000002248', $25 = '5eed0002-0000-4000-8000-000000001b4a', $26 = '5eed0002-0000-4000-8000-000000002446'
GroupAggregate  (cost=0.42..129.61 rows=123 width=24) (actual time=0.057..0.267 rows=25.00 loops=1)
  Group Key: conversation_id
  Buffers: shared hit=101
  ->  Index Scan using messages_conversation_sent_idx on messages  (cost=0.42..127.76 rows=124 width=16) (actual time=0.041..0.233 rows=141.00 loops=1)
        Index Cond: (conversation_id = ANY ('{5eed0002-0000-4000-8000-000000002526,5eed0002-0000-4000-8000-0000000022e6,5eed0002-0000-4000-8000-000000002236,5eed0002-0000-4000-8000-0000000020db,5eed0002-0000-4000-8000-0000000011ef,5eed0002-0000-4000-8000-0000000001ba,5eed0002-0000-4000-8000-000000000c24,5eed0002-0000-4000-8000-000000001771,5eed0002-0000-4000-8000-000000001901,5eed0002-0000-4000-8000-0000000015c8,5eed0002-0000-4000-8000-000000000df7,5eed0002-0000-4000-8000-000000000bce,5eed0002-0000-4000-8000-000000001463,5eed0002-0000-4000-8000-000000001b70,5eed0002-0000-4000-8000-0000000007dd,5eed0002-0000-4000-8000-000000000094,5eed0002-0000-4000-8000-000000000d64,5eed0002-0000-4000-8000-000000001ac4,5eed0002-0000-4000-8000-00000000152a,5eed0002-0000-4000-8000-000000001e1e,5eed0002-0000-4000-8000-000000001c28,5eed0002-0000-4000-8000-000000000445,5eed0002-0000-4000-8000-000000002248,5eed0002-0000-4000-8000-000000001b4a,5eed0002-0000-4000-8000-000000002446}'::uuid[]))
        Filter: (organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid)
        Index Searches: 25
        Buffers: shared hit=101
```

## conversations.searchClientsByLastInteraction (última página)

Resultado: 25/10000 filas.

### Consulta 1 de 4

```text
duration: 51.415 ms  plan:
Query Text: select "id" from "clients" where "clients"."organization_id" = $1 order by lower("clients"."display_name"), "clients"."id" asc
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021'
Sort  (cost=1062.41..1087.38 rows=9987 width=48) (actual time=38.930..42.644 rows=10000.00 loops=1)
  Sort Key: (lower(display_name)), id
  Sort Method: quicksort  Memory: 924kB
  Buffers: shared hit=198
  ->  Seq Scan on clients  (cost=0.00..398.98 rows=9987 width=48) (actual time=0.030..14.075 rows=10000.00 loops=1)
        Filter: (organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid)
        Rows Removed by Filter: 4100
        Buffers: shared hit=198
```

### Consulta 2 de 4

```text
duration: 18.785 ms  plan:
Query Text: select "client_id", max("last_message_at") from "conversations" where ("conversations"."organization_id" = $1 and "conversations"."client_id" is not null and "conversations"."last_message_at" is not null) group by "conversations"."client_id"
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021'
GroupAggregate  (cost=0.29..358.71 rows=6093 width=24) (actual time=0.072..8.792 rows=5552.00 loops=1)
  Group Key: client_id
  Buffers: shared hit=73
  ->  Index Only Scan using conversations_organization_client_last_message_idx on conversations  (cost=0.29..257.69 rows=8018 width=24) (actual time=0.061..4.108 rows=8009.00 loops=1)
        Index Cond: ((organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid) AND (client_id IS NOT NULL) AND (last_message_at IS NOT NULL))
        Heap Fetches: 54
        Index Searches: 1
        Buffers: shared hit=73
```

### Consulta 3 de 4

```text
duration: 0.272 ms  plan:
Query Text: select "id", "display_name", "phone_e164", "notes", "is_active", "created_at", "updated_at" from "clients" where ("clients"."organization_id" = $1 and "clients"."id" in ($2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26))
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '5eed0001-0000-4000-8000-000000001484', $3 = '5eed0001-0000-4000-8000-0000000014e7', $4 = '5eed0001-0000-4000-8000-000000001551', $5 = '5eed0001-0000-4000-8000-0000000015af', $6 = '5eed0001-0000-4000-8000-0000000015f1', $7 = '5eed0001-0000-4000-8000-000000001602', $8 = '5eed0001-0000-4000-8000-00000000023e', $9 = '5eed0001-0000-4000-8000-000000001752', $10 = '5eed0001-0000-4000-8000-00000000003e', $11 = '5eed0001-0000-4000-8000-000000001929', $12 = '5eed0001-0000-4000-8000-000000001a21', $13 = '5eed0001-0000-4000-8000-000000001ae4', $14 = '5eed0001-0000-4000-8000-000000001aeb', $15 = '5eed0001-0000-4000-8000-000000001ceb', $16 = '5eed0001-0000-4000-8000-000000001d6c', $17 = '5eed0001-0000-4000-8000-000000001ddd', $18 = '5eed0001-0000-4000-8000-000000001fd5', $19 = '5eed0001-0000-4000-8000-000000000357', $20 = '5eed0001-0000-4000-8000-000000002215', $21 = '5eed0001-0000-4000-8000-00000000221c', $22 = '5eed0001-0000-4000-8000-0000000022ff', $23 = '5eed0001-0000-4000-8000-000000002395', $24 = '5eed0001-0000-4000-8000-0000000023e1', $25 = '5eed0001-0000-4000-8000-000000002495', $26 = '5eed0001-0000-4000-8000-00000000251f'
Index Scan using clients_pkey on clients  (cost=0.29..25.68 rows=18 width=99) (actual time=0.090..0.235 rows=25.00 loops=1)
  Index Cond: (id = ANY ('{5eed0001-0000-4000-8000-000000001484,5eed0001-0000-4000-8000-0000000014e7,5eed0001-0000-4000-8000-000000001551,5eed0001-0000-4000-8000-0000000015af,5eed0001-0000-4000-8000-0000000015f1,5eed0001-0000-4000-8000-000000001602,5eed0001-0000-4000-8000-00000000023e,5eed0001-0000-4000-8000-000000001752,5eed0001-0000-4000-8000-00000000003e,5eed0001-0000-4000-8000-000000001929,5eed0001-0000-4000-8000-000000001a21,5eed0001-0000-4000-8000-000000001ae4,5eed0001-0000-4000-8000-000000001aeb,5eed0001-0000-4000-8000-000000001ceb,5eed0001-0000-4000-8000-000000001d6c,5eed0001-0000-4000-8000-000000001ddd,5eed0001-0000-4000-8000-000000001fd5,5eed0001-0000-4000-8000-000000000357,5eed0001-0000-4000-8000-000000002215,5eed0001-0000-4000-8000-00000000221c,5eed0001-0000-4000-8000-0000000022ff,5eed0001-0000-4000-8000-000000002395,5eed0001-0000-4000-8000-0000000023e1,5eed0001-0000-4000-8000-000000002495,5eed0001-0000-4000-8000-00000000251f}'::uuid[]))
  Filter: (organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid)
  Index Searches: 16
  Buffers: shared hit=54
```

### Consulta 4 de 4

```text
duration: 0.025 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.020..0.021 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.018..0.019 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0000-4000-8000-000000000021'::uuid)
        Buffers: shared hit=1
```

## organizations.listMembers (última página)

Resultado: 1/501 filas.

### Consulta 1 de 2

```text
duration: 1.428 ms  plan:
Query Text: select "id", "user_id", "role", "created_at" from "organization_members" where "organization_members"."organization_id" = $1
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021'
Index Scan using organization_members_organization_id_idx on organization_members  (cost=0.15..18.22 rows=501 width=44) (actual time=0.027..0.315 rows=501.00 loops=1)
  Index Cond: (organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid)
  Index Searches: 1
  Buffers: shared hit=8
```

### Consulta 2 de 2

```text
duration: 0.926 ms  plan:
Query Text: select "id", "name", "email", "is_active" from "users" where "users"."id" in ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51, $52, $53, $54, $55, $56, $57, $58, $59, $60, $61, $62, $63, $64, $65, $66, $67, $68, $69, $70, $71, $72, $73, $74, $75, $76, $77, $78, $79, $80, $81, $82, $83, $84, $85, $86, $87, $88, $89, $90, $91, $92, $93, $94, $95, $96, $97, $98, $99, $100, $101, $102, $103, $104, $105, $106, $107, $108, $109, $110, $111, $112, $113, $114, $115, $116, $117, $118, $119, $120, $121, $122, $123, $124, $125, $126, $127, $128, $129, $130, $131, $132, $133, $134, $135, $136, $137, $138, $139, $140, $141, $142, $143, $144, $145, $146, $147, $148, $149, $150, $151, $152, $153, $154, $155, $156, $157, $158, $159, $160, $161, $162, $163, $164, $165, $166, $167, $168, $169, $170, $171, $172, $173, $174, $175, $176, $177, $178, $179, $180, $181, $182, $183, $184, $185, $186, $187, $188, $189, $190, $191, $192, $193, $194, $195, $196, $197, $198, $199, $200, $201, $202, $203, $204, $205, $206, $207, $208, $209, $210, $211, $212, $213, $214, $215, $216, $217, $218, $219, $220, $221, $222, $223, $224, $225, $226, $227, $228, $229, $230, $231, $232, $233, $234, $235, $236, $237, $238, $239, $240, $241, $242, $243, $244, $245, $246, $247, $248, $249, $250, $251, $252, $253, $254, $255, $256, $257, $258, $259, $260, $261, $262, $263, $264, $265, $266, $267, $268, $269, $270, $271, $272, $273, $274, $275, $276, $277, $278, $279, $280, $281, $282, $283, $284, $285, $286, $287, $288, $289, $290, $291, $292, $293, $294, $295, $296, $297, $298, $299, $300, $301, $302, $303, $304, $305, $306, $307, $308, $309, $310, $311, $312, $313, $314, $315, $316, $317, $318, $319, $320, $321, $322, $323, $324, $325, $326, $327, $328, $329, $330, $331, $332, $333, $334, $335, $336, $337, $338, $339, $340, $341, $342, $343, $344, $345, $346, $347, $348, $349, $350, $351, $352, $353, $354, $355, $356, $357, $358, $359, $360, $361, $362, $363, $364, $365, $366, $367, $368, $369, $370, $371, $372, $373, $374, $375, $376, $377, $378, $379, $380, $381, $382, $383, $384, $385, $386, $387, $388, $389, $390, $391, $392, $393, $394, $395, $396, $397, $398, $399, $400, $401, $402, $403, $404, $405, $406, $407, $408, $409, $410, $411, $412, $413, $414, $415, $416, $417, $418, $419, $420, $421, $422, $423, $424, $425, $426, $427, $428, $429, $430, $431, $432, $433, $434, $435, $436, $437, $438, $439, $440, $441, $442, $443, $444, $445, $446, $447, $448, $449, $450, $451, $452, $453, $454, $455, $456, $457, $458, $459, $460, $461, $462, $463, $464, $465, $466, $467, $468, $469, $470, $471, $472, $473, $474, $475, $476, $477, $478, $479, $480, $481, $482, $483, $484, $485, $486, $487, $488, $489, $490, $491, $492, $493, $494, $495, $496, $497, $498, $499, $500, $501)
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000022', $2 = '5eed0007-0000-4000-8000-000000000000', $3 = '5eed0007-0000-4000-8000-000000000001', $4 = '5eed0007-0000-4000-8000-000000000002', $5 = '5eed0007-0000-4000-8000-000000000003', $6 = '5eed0007-0000-4000-8000-000000000004', $7 = '5eed0007-0000-4000-8000-000000000005', $8 = '5eed0007-0000-4000-8000-000000000006', $9 = '5eed0007-0000-4000-8000-000000000007', $10 = '5eed0007-0000-4000-8000-000000000008', $11 = '5eed0007-0000-4000-8000-000000000009', $12 = '5eed0007-0000-4000-8000-00000000000a', $13 = '5eed0007-0000-4000-8000-00000000 [… recortado: la línea tiene 23455 caracteres]
Index Scan using users_pkey on users  (cost=0.28..28.61 rows=501 width=62) (actual time=0.098..0.351 rows=501.00 loops=1)
  Index Cond: (id = ANY ('{5eed0000-0000-4000-8000-000000000022,5eed0007-0000-4000-8000-000000000000,5eed0007-0000-4000-8000-000000000001,5eed0007-0000-4000-8000-000000000002,5eed0007-0000-4000-8000-000000000003,5eed0007-0000-4000-8000-000000000004,5eed0007-0000-4000-8000-000000000005,5eed0007-0000-4000-8000-000000000006,5eed0007-0000-4000-8000-000000000007,5eed0007-0000-4000-8000-000000000008,5eed0007-0000-4000-8000-000000000009,5eed0007-0000-4000-8000-00000000000a,5eed0007-0000-4000-8000-00000000000b,5eed0007-0000-4000-8000-00000000000c,5eed0007-0000-4000-8000-00000000000d,5eed0007-0000-4000 [… recortado: la línea tiene 18575 caracteres]
  Index Searches: 1
  Buffers: shared hit=17
```

## inventory.listStockMovements (producto con 400, última página)

Resultado: 25/400 filas.

### Consulta 1 de 6

```text
duration: 0.047 ms  plan:
Query Text: select "id", "sku", "name", "description", "unit", "reorder_point", "brand", "category", "condition", "is_active", "created_at", "updated_at" from "products" where ("products"."organization_id" = $1 and "products"."id" = $2) limit $3
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '5eed0004-0000-4000-8000-000000000009', $3 = '1'
Limit  (cost=0.29..2.50 rows=1 width=172) (actual time=0.032..0.033 rows=1.00 loops=1)
  Buffers: shared hit=3
  ->  Index Scan using products_organization_id_id_unique on products  (cost=0.29..2.50 rows=1 width=172) (actual time=0.030..0.031 rows=1.00 loops=1)
        Index Cond: ((organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid) AND (id = '5eed0004-0000-4000-8000-000000000009'::uuid))
        Index Searches: 1
        Buffers: shared hit=3
```

### Consulta 2 de 6

```text
duration: 0.049 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.020..0.021 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.019..0.019 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0000-4000-8000-000000000021'::uuid)
        Buffers: shared hit=1
```

### Consulta 3 de 6

```text
duration: 0.155 ms  plan:
Query Text: select count(*) from "inventory_movements" where ("inventory_movements"."organization_id" = $1 and "inventory_movements"."product_id" = $2)
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '5eed0004-0000-4000-8000-000000000009'
Aggregate  (cost=10.46..10.47 rows=1 width=8) (actual time=0.150..0.151 rows=1.00 loops=1)
  Buffers: shared hit=9
  ->  Index Only Scan using inventory_movements_product_history_idx on inventory_movements  (cost=0.41..9.71 rows=300 width=0) (actual time=0.034..0.109 rows=400.00 loops=1)
        Index Cond: ((organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid) AND (product_id = '5eed0004-0000-4000-8000-000000000009'::uuid))
        Heap Fetches: 0
        Index Searches: 1
        Buffers: shared hit=9
```

### Consulta 4 de 6

```text
duration: 0.646 ms  plan:
Query Text: select "id", "type", "quantity", "balance_after", "reason", "created_by", "created_at" from "inventory_movements" where ("inventory_movements"."organization_id" = $1 and "inventory_movements"."product_id" = $2) order by "inventory_movements"."created_at" desc, "inventory_movements"."id" desc limit $3 offset $4
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '5eed0004-0000-4000-8000-000000000009', $3 = '25', $4 = '375'
Limit  (cost=149.92..149.92 rows=1 width=70) (actual time=0.586..0.594 rows=25.00 loops=1)
  Buffers: shared hit=16
  ->  Sort  (cost=149.17..149.92 rows=300 width=70) (actual time=0.378..0.564 rows=400.00 loops=1)
        Sort Key: created_at DESC, id DESC
        Sort Method: quicksort  Memory: 78kB
        Buffers: shared hit=16
        ->  Index Scan using inventory_movements_product_history_idx on inventory_movements  (cost=0.41..136.83 rows=300 width=70) (actual time=0.042..0.215 rows=400.00 loops=1)
              Index Cond: ((organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid) AND (product_id = '5eed0004-0000-4000-8000-000000000009'::uuid))
              Index Searches: 1
              Buffers: shared hit=16
```

### Consulta 5 de 6

```text
duration: 0.032 ms  plan:
Query Text: select "user_id" from "organization_members" where ("organization_members"."organization_id" = $1 and "organization_members"."user_id" in ($2))
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '5eed0000-0000-4000-8000-000000000022'
Index Scan using organization_members_user_id_unique on organization_members  (cost=0.28..2.50 rows=1 width=16) (actual time=0.027..0.028 rows=1.00 loops=1)
  Index Cond: (user_id = '5eed0000-0000-4000-8000-000000000022'::uuid)
  Filter: (organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid)
  Index Searches: 1
  Buffers: shared hit=3
```

### Consulta 6 de 6

```text
duration: 0.039 ms  plan:
Query Text: select "id", "name", "email", "is_active" from "users" where "users"."id" in ($1)
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000022'
Index Scan using users_pkey on users  (cost=0.28..2.49 rows=1 width=62) (actual time=0.031..0.033 rows=1.00 loops=1)
  Index Cond: (id = '5eed0000-0000-4000-8000-000000000022'::uuid)
  Index Searches: 1
  Buffers: shared hit=3
```

## inventory.listStockMovements (producto con 400)

Resultado: 25/400 filas.

### Consulta 1 de 6

```text
duration: 0.045 ms  plan:
Query Text: select "id", "sku", "name", "description", "unit", "reorder_point", "brand", "category", "condition", "is_active", "created_at", "updated_at" from "products" where ("products"."organization_id" = $1 and "products"."id" = $2) limit $3
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '5eed0004-0000-4000-8000-000000000009', $3 = '1'
Limit  (cost=0.29..2.50 rows=1 width=172) (actual time=0.030..0.031 rows=1.00 loops=1)
  Buffers: shared hit=3
  ->  Index Scan using products_organization_id_id_unique on products  (cost=0.29..2.50 rows=1 width=172) (actual time=0.028..0.029 rows=1.00 loops=1)
        Index Cond: ((organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid) AND (id = '5eed0004-0000-4000-8000-000000000009'::uuid))
        Index Searches: 1
        Buffers: shared hit=3
```

### Consulta 2 de 6

```text
duration: 0.023 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.018..0.019 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.017..0.017 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0000-4000-8000-000000000021'::uuid)
        Buffers: shared hit=1
```

### Consulta 3 de 6

```text
duration: 0.165 ms  plan:
Query Text: select count(*) from "inventory_movements" where ("inventory_movements"."organization_id" = $1 and "inventory_movements"."product_id" = $2)
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '5eed0004-0000-4000-8000-000000000009'
Aggregate  (cost=10.46..10.47 rows=1 width=8) (actual time=0.161..0.162 rows=1.00 loops=1)
  Buffers: shared hit=9
  ->  Index Only Scan using inventory_movements_product_history_idx on inventory_movements  (cost=0.41..9.71 rows=300 width=0) (actual time=0.035..0.117 rows=400.00 loops=1)
        Index Cond: ((organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid) AND (product_id = '5eed0004-0000-4000-8000-000000000009'::uuid))
        Heap Fetches: 0
        Index Searches: 1
        Buffers: shared hit=9
```

### Consulta 4 de 6

```text
duration: 1.970 ms  plan:
Query Text: select "id", "type", "quantity", "balance_after", "reason", "created_by", "created_at" from "inventory_movements" where ("inventory_movements"."organization_id" = $1 and "inventory_movements"."product_id" = $2) order by "inventory_movements"."created_at" desc, "inventory_movements"."id" desc limit $3
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '5eed0004-0000-4000-8000-000000000009', $3 = '25'
Limit  (cost=145.29..145.36 rows=25 width=70) (actual time=1.881..1.889 rows=25.00 loops=1)
  Buffers: shared hit=16
  ->  Sort  (cost=145.29..146.04 rows=300 width=70) (actual time=1.878..1.882 rows=25.00 loops=1)
        Sort Key: created_at DESC, id DESC
        Sort Method: top-N heapsort  Memory: 28kB
        Buffers: shared hit=16
        ->  Index Scan using inventory_movements_product_history_idx on inventory_movements  (cost=0.41..136.83 rows=300 width=70) (actual time=0.039..0.282 rows=400.00 loops=1)
              Index Cond: ((organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid) AND (product_id = '5eed0004-0000-4000-8000-000000000009'::uuid))
              Index Searches: 1
              Buffers: shared hit=16
```

### Consulta 5 de 6

```text
duration: 0.031 ms  plan:
Query Text: select "user_id" from "organization_members" where ("organization_members"."organization_id" = $1 and "organization_members"."user_id" in ($2))
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '5eed0000-0000-4000-8000-000000000022'
Index Scan using organization_members_user_id_unique on organization_members  (cost=0.28..2.50 rows=1 width=16) (actual time=0.027..0.028 rows=1.00 loops=1)
  Index Cond: (user_id = '5eed0000-0000-4000-8000-000000000022'::uuid)
  Filter: (organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid)
  Index Searches: 1
  Buffers: shared hit=3
```

### Consulta 6 de 6

```text
duration: 0.034 ms  plan:
Query Text: select "id", "name", "email", "is_active" from "users" where "users"."id" in ($1)
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000022'
Index Scan using users_pkey on users  (cost=0.28..2.49 rows=1 width=62) (actual time=0.027..0.029 rows=1.00 loops=1)
  Index Cond: (id = '5eed0000-0000-4000-8000-000000000022'::uuid)
  Index Searches: 1
  Buffers: shared hit=3
```

## API products: palabras («cafe molido»)

Resultado: 10 filas.

### Consulta 1 de 5

```text
duration: 0.008 ms  plan:
Query Text:  SELECT public.unaccent('public.unaccent'::regdictionary, $1) 
Query Parameters: $1 = 'cafe molido'
Result  (cost=0.00..0.01 rows=1 width=32) (actual time=0.005..0.005 rows=1.00 loops=1)
```

### Consulta 2 de 5

```text
duration: 0.006 ms  plan:
Query Text:  SELECT public.unaccent('public.unaccent'::regdictionary, $1) 
Query Parameters: $1 = 'cafe molido'
Result  (cost=0.00..0.01 rows=1 width=32) (actual time=0.003..0.003 rows=1.00 loops=1)
```

### Consulta 3 de 5

```text
duration: 1.660 ms  plan:
Query Text: select "id", "sku", "name", "description", "unit", "reorder_point", "brand", "category", "condition", "is_active", "created_at", "updated_at" from "products" where ("products"."organization_id" = $1 and "products"."is_active" = $2 and ("products"."search" @@ (select string_agg('''' || replace(replace(l.lexeme, '\', '\\'), '''', '''''') || ''':*', ' & ')::tsquery
    from unnest(to_tsvector('simple', immutable_unaccent(lower($3)))) l) or lower("products"."sku") = lower($4))) order by lower("products"."sku") = lower($5) desc, coalesce(ts_rank("products"."search", (select string_agg('''' || replace(replace(l.lexeme, '\', '\\'), '''', '''''') || ''':*', ' & ')::tsquery
    from unnest(to_tsvector('simple', immutable_unaccent(lower($6)))) l)), 0) desc, "products"."name", "products"."id" limit $7
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = 't', $3 = 'cafe molido', $4 = 'cafe molido', $5 = 'cafe molido', $6 = 'cafe molido', $7 = '10'
Limit  (cost=77.82..77.84 rows=10 width=177) (actual time=1.616..1.623 rows=10.00 loops=1)
  Buffers: shared hit=141
  InitPlan 1
    ->  Aggregate  (cost=0.23..0.25 rows=1 width=32) (actual time=0.027..0.028 rows=1.00 loops=1)
          ->  Function Scan on unnest l  (cost=0.00..0.10 rows=10 width=32) (actual time=0.015..0.016 rows=2.00 loops=1)
  InitPlan 2
    ->  Aggregate  (cost=0.23..0.25 rows=1 width=32) (actual time=0.389..0.390 rows=1.00 loops=1)
          ->  Function Scan on unnest l_1  (cost=0.00..0.10 rows=10 width=32) (actual time=0.367..0.368 rows=2.00 loops=1)
  ->  Sort  (cost=77.33..77.45 rows=48 width=177) (actual time=1.614..1.617 rows=10.00 loops=1)
        Sort Key: ((lower(products.sku) = 'cafe molido'::text)) DESC, (COALESCE(ts_rank(products.search, (InitPlan 1).col1), '0'::real)) DESC, products.name, products.id
        Sort Method: top-N heapsort  Memory: 27kB
        Buffers: shared hit=141
        ->  Bitmap Heap Scan on products  (cost=5.89..76.29 rows=48 width=177) (actual time=1.040..1.427 rows=114.00 loops=1)
              Recheck Cond: ((search @@ (InitPlan 2).col1) OR ((organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid) AND (lower(sku) = 'cafe molido'::text)))
              Filter: (is_active AND (organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid))
              Rows Removed by Filter: 45
              Heap Blocks: exact=125
              Buffers: shared hit=133
              ->  BitmapOr  (cost=5.89..5.89 rows=71 width=0) (actual time=0.936..0.937 rows=0.00 loops=1)
                    Buffers: shared hit=8
                    ->  Bitmap Index Scan on products_search_idx  (cost=0.00..4.48 rows=70 width=0) (actual time=0.914..0.914 rows=159.00 loops=1)
                          Index Cond: (search @@ (InitPlan 2).col1)
                          Index Searches: 1
                          Buffers: shared hit=6
                    ->  Bitmap Index Scan on products_organization_sku_lower_unique  (cost=0.00..1.40 rows=1 width=0) (actual time=0.021..0.021 rows=0.00 loops=1)
                          Index Cond: ((organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid) AND (lower(sku) = 'cafe molido'::text))
                          Index Searches: 1
                          Buffers: shared hit=2
```

### Consulta 4 de 5

```text
duration: 0.152 ms  plan:
Query Text: select distinct on ("product_prices"."product_id") "id", "product_id", "amount", "currency", "created_by", "created_at" from "product_prices" where ("product_prices"."organization_id" = $1 and "product_prices"."product_id" in ($2, $3, $4, $5, $6, $7, $8, $9, $10, $11)) order by "product_prices"."product_id", "product_prices"."created_at" desc, "product_prices"."id" desc
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '5eed0004-0000-4000-8000-000000000478', $3 = '5eed0004-0000-4000-8000-00000000052c', $4 = '5eed0004-0000-4000-8000-000000000576', $5 = '5eed0004-0000-4000-8000-00000000057d', $6 = '5eed0004-0000-4000-8000-00000000058c', $7 = '5eed0004-0000-4000-8000-0000000005cb', $8 = '5eed0004-0000-4000-8000-0000000005e8', $9 = '5eed0004-0000-4000-8000-000000000653', $10 = '5eed0004-0000-4000-8000-00000000068f', $11 = '5eed0004-0000-4000-8000-000000000739'
Unique  (cost=2.57..18.88 rows=8 width=66) (actual time=0.124..0.130 rows=10.00 loops=1)
  Buffers: shared hit=20
  ->  Incremental Sort  (cost=2.57..18.86 rows=8 width=66) (actual time=0.123..0.124 rows=13.00 loops=1)
        Sort Key: product_id, created_at DESC, id DESC
        Presorted Key: product_id
        Full-sort Groups: 1  Sort Method: quicksort  Average Memory: 26kB  Peak Memory: 26kB
        Buffers: shared hit=20
        ->  Index Scan using product_prices_product_history_idx on product_prices  (cost=0.29..18.50 rows=8 width=66) (actual time=0.034..0.103 rows=13.00 loops=1)
              Index Cond: ((organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid) AND (product_id = ANY ('{5eed0004-0000-4000-8000-000000000478,5eed0004-0000-4000-8000-00000000052c,5eed0004-0000-4000-8000-000000000576,5eed0004-0000-4000-8000-00000000057d,5eed0004-0000-4000-8000-00000000058c,5eed0004-0000-4000-8000-0000000005cb,5eed0004-0000-4000-8000-0000000005e8,5eed0004-0000-4000-8000-000000000653,5eed0004-0000-4000-8000-00000000068f,5eed0004-0000-4000-8000-000000000739}'::uuid[])))
              Index Searches: 6
              Buffers: shared hit=20
```

### Consulta 5 de 5

```text
duration: 0.076 ms  plan:
Query Text: select "product_id", "quantity_on_hand" from "inventories" where ("inventories"."organization_id" = $1 and "inventories"."product_id" in ($2, $3, $4, $5, $6, $7, $8, $9, $10, $11))
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '5eed0004-0000-4000-8000-000000000478', $3 = '5eed0004-0000-4000-8000-00000000052c', $4 = '5eed0004-0000-4000-8000-000000000576', $5 = '5eed0004-0000-4000-8000-00000000057d', $6 = '5eed0004-0000-4000-8000-00000000058c', $7 = '5eed0004-0000-4000-8000-0000000005cb', $8 = '5eed0004-0000-4000-8000-0000000005e8', $9 = '5eed0004-0000-4000-8000-000000000653', $10 = '5eed0004-0000-4000-8000-00000000068f', $11 = '5eed0004-0000-4000-8000-000000000739'
Index Scan using inventories_product_id_unique on inventories  (cost=0.29..15.15 rows=7 width=20) (actual time=0.034..0.067 rows=8.00 loops=1)
  Index Cond: (product_id = ANY ('{5eed0004-0000-4000-8000-000000000478,5eed0004-0000-4000-8000-00000000052c,5eed0004-0000-4000-8000-000000000576,5eed0004-0000-4000-8000-00000000057d,5eed0004-0000-4000-8000-00000000058c,5eed0004-0000-4000-8000-0000000005cb,5eed0004-0000-4000-8000-0000000005e8,5eed0004-0000-4000-8000-000000000653,5eed0004-0000-4000-8000-00000000068f,5eed0004-0000-4000-8000-000000000739}'::uuid[]))
  Filter: (organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid)
  Index Searches: 4
  Buffers: shared hit=13
```

## API products: SKU exacto

Resultado: 1 filas.

### Consulta 1 de 5

```text
duration: 0.008 ms  plan:
Query Text:  SELECT public.unaccent('public.unaccent'::regdictionary, $1) 
Query Parameters: $1 = 'sku-000001'
Result  (cost=0.00..0.01 rows=1 width=32) (actual time=0.004..0.004 rows=1.00 loops=1)
```

### Consulta 2 de 5

```text
duration: 0.009 ms  plan:
Query Text:  SELECT public.unaccent('public.unaccent'::regdictionary, $1) 
Query Parameters: $1 = 'sku-000001'
Result  (cost=0.00..0.01 rows=1 width=32) (actual time=0.005..0.005 rows=1.00 loops=1)
```

### Consulta 3 de 5

```text
duration: 0.174 ms  plan:
Query Text: select "id", "sku", "name", "description", "unit", "reorder_point", "brand", "category", "condition", "is_active", "created_at", "updated_at" from "products" where ("products"."organization_id" = $1 and "products"."is_active" = $2 and ("products"."search" @@ (select string_agg('''' || replace(replace(l.lexeme, '\', '\\'), '''', '''''') || ''':*', ' & ')::tsquery
    from unnest(to_tsvector('simple', immutable_unaccent(lower($3)))) l) or lower("products"."sku") = lower($4))) order by lower("products"."sku") = lower($5) desc, coalesce(ts_rank("products"."search", (select string_agg('''' || replace(replace(l.lexeme, '\', '\\'), '''', '''''') || ''':*', ' & ')::tsquery
    from unnest(to_tsvector('simple', immutable_unaccent(lower($6)))) l)), 0) desc, "products"."name", "products"."id" limit $7
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = 't', $3 = 'SKU-000001', $4 = 'SKU-000001', $5 = 'SKU-000001', $6 = 'SKU-000001', $7 = '10'
Limit  (cost=89.85..89.87 rows=10 width=177) (actual time=0.158..0.160 rows=1.00 loops=1)
  Buffers: shared hit=8
  InitPlan 1
    ->  Aggregate  (cost=0.23..0.25 rows=1 width=32) (actual time=0.013..0.013 rows=1.00 loops=1)
          ->  Function Scan on unnest l  (cost=0.00..0.10 rows=10 width=32) (actual time=0.007..0.007 rows=2.00 loops=1)
  InitPlan 2
    ->  Aggregate  (cost=0.23..0.25 rows=1 width=32) (actual time=0.032..0.033 rows=1.00 loops=1)
          ->  Function Scan on unnest l_1  (cost=0.00..0.10 rows=10 width=32) (actual time=0.015..0.016 rows=2.00 loops=1)
  ->  Sort  (cost=89.36..89.51 rows=62 width=177) (actual time=0.157..0.158 rows=1.00 loops=1)
        Sort Key: ((lower(products.sku) = 'sku-000001'::text)) DESC, (COALESCE(ts_rank(products.search, (InitPlan 1).col1), '0'::real)) DESC, products.name, products.id
        Sort Method: quicksort  Memory: 25kB
        Buffers: shared hit=8
        ->  Bitmap Heap Scan on products  (cost=5.90..88.02 rows=62 width=177) (actual time=0.145..0.146 rows=1.00 loops=1)
              Recheck Cond: ((search @@ (InitPlan 2).col1) OR ((organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid) AND (lower(sku) = 'sku-000001'::text)))
              Filter: (is_active AND (organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid))
              Heap Blocks: exact=1
              Buffers: shared hit=8
              ->  BitmapOr  (cost=5.90..5.90 rows=85 width=0) (actual time=0.106..0.107 rows=0.00 loops=1)
                    Buffers: shared hit=7
                    ->  Bitmap Index Scan on products_search_idx  (cost=0.00..4.48 rows=70 width=0) (actual time=0.079..0.079 rows=0.00 loops=1)
                          Index Cond: (search @@ (InitPlan 2).col1)
                          Index Searches: 1
                          Buffers: shared hit=5
                    ->  Bitmap Index Scan on products_organization_sku_lower_unique  (cost=0.00..1.40 rows=15 width=0) (actual time=0.027..0.027 rows=1.00 loops=1)
                          Index Cond: ((organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid) AND (lower(sku) = 'sku-000001'::text))
                          Index Searches: 1
                          Buffers: shared hit=2
```

### Consulta 4 de 5

```text
duration: 0.056 ms  plan:
Query Text: select distinct on ("product_prices"."product_id") "id", "product_id", "amount", "currency", "created_by", "created_at" from "product_prices" where ("product_prices"."organization_id" = $1 and "product_prices"."product_id" in ($2)) order by "product_prices"."product_id", "product_prices"."created_at" desc, "product_prices"."id" desc
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '5eed0004-0000-4000-8000-000000000000'
Limit  (cost=2.51..2.52 rows=1 width=66) (actual time=0.043..0.044 rows=1.00 loops=1)
  Buffers: shared hit=3
  ->  Sort  (cost=2.51..2.52 rows=1 width=66) (actual time=0.042..0.042 rows=1.00 loops=1)
        Sort Key: created_at DESC, id DESC
        Sort Method: quicksort  Memory: 25kB
        Buffers: shared hit=3
        ->  Index Scan using product_prices_product_history_idx on product_prices  (cost=0.29..2.50 rows=1 width=66) (actual time=0.029..0.031 rows=1.00 loops=1)
              Index Cond: ((organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid) AND (product_id = '5eed0004-0000-4000-8000-000000000000'::uuid))
              Index Searches: 1
              Buffers: shared hit=3
```

### Consulta 5 de 5

```text
duration: 0.034 ms  plan:
Query Text: select "product_id", "quantity_on_hand" from "inventories" where ("inventories"."organization_id" = $1 and "inventories"."product_id" in ($2))
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '5eed0004-0000-4000-8000-000000000000'
Index Scan using inventories_product_id_unique on inventories  (cost=0.29..2.51 rows=1 width=20) (actual time=0.027..0.028 rows=1.00 loops=1)
  Index Cond: (product_id = '5eed0004-0000-4000-8000-000000000000'::uuid)
  Filter: (organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid)
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
duration: 0.003 ms  plan:
Query Text:  SELECT public.unaccent('public.unaccent'::regdictionary, $1) 
Query Parameters: $1 = 'inexistente'
Result  (cost=0.00..0.01 rows=1 width=32) (actual time=0.001..0.001 rows=1.00 loops=1)
```

### Consulta 3 de 3

```text
duration: 0.096 ms  plan:
Query Text: select "id", "sku", "name", "description", "unit", "reorder_point", "brand", "category", "condition", "is_active", "created_at", "updated_at" from "products" where ("products"."organization_id" = $1 and "products"."is_active" = $2 and ("products"."search" @@ (select string_agg('''' || replace(replace(l.lexeme, '\', '\\'), '''', '''''') || ''':*', ' & ')::tsquery
    from unnest(to_tsvector('simple', immutable_unaccent(lower($3)))) l) or lower("products"."sku") = lower($4))) order by lower("products"."sku") = lower($5) desc, coalesce(ts_rank("products"."search", (select string_agg('''' || replace(replace(l.lexeme, '\', '\\'), '''', '''''') || ''':*', ' & ')::tsquery
    from unnest(to_tsvector('simple', immutable_unaccent(lower($6)))) l)), 0) desc, "products"."name", "products"."id" limit $7
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = 't', $3 = 'inexistente', $4 = 'inexistente', $5 = 'inexistente', $6 = 'inexistente', $7 = '10'
Limit  (cost=77.82..77.84 rows=10 width=177) (actual time=0.093..0.095 rows=0.00 loops=1)
  Buffers: shared hit=5
  InitPlan 1
    ->  Aggregate  (cost=0.23..0.25 rows=1 width=32) (never executed)
          ->  Function Scan on unnest l  (cost=0.00..0.10 rows=10 width=32) (never executed)
  InitPlan 2
    ->  Aggregate  (cost=0.23..0.25 rows=1 width=32) (actual time=0.029..0.029 rows=1.00 loops=1)
          ->  Function Scan on unnest l_1  (cost=0.00..0.10 rows=10 width=32) (actual time=0.013..0.013 rows=1.00 loops=1)
  ->  Sort  (cost=77.33..77.45 rows=48 width=177) (actual time=0.092..0.093 rows=0.00 loops=1)
        Sort Key: ((lower(products.sku) = 'inexistente'::text)) DESC, (COALESCE(ts_rank(products.search, (InitPlan 1).col1), '0'::real)) DESC, products.name, products.id
        Sort Method: quicksort  Memory: 25kB
        Buffers: shared hit=5
        ->  Bitmap Heap Scan on products  (cost=5.89..76.29 rows=48 width=177) (actual time=0.081..0.082 rows=0.00 loops=1)
              Recheck Cond: ((search @@ (InitPlan 2).col1) OR ((organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid) AND (lower(sku) = 'inexistente'::text)))
              Filter: (is_active AND (organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid))
              Buffers: shared hit=5
              ->  BitmapOr  (cost=5.89..5.89 rows=71 width=0) (actual time=0.070..0.070 rows=0.00 loops=1)
                    Buffers: shared hit=5
                    ->  Bitmap Index Scan on products_search_idx  (cost=0.00..4.48 rows=70 width=0) (actual time=0.048..0.048 rows=0.00 loops=1)
                          Index Cond: (search @@ (InitPlan 2).col1)
                          Index Searches: 1
                          Buffers: shared hit=3
                    ->  Bitmap Index Scan on products_organization_sku_lower_unique  (cost=0.00..1.40 rows=1 width=0) (actual time=0.021..0.021 rows=0.00 loops=1)
                          Index Cond: ((organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid) AND (lower(sku) = 'inexistente'::text))
                          Index Searches: 1
                          Buffers: shared hit=2
```

## API products/{product_id}

Resultado: 1 filas.

### Consulta 1 de 3

```text
duration: 0.046 ms  plan:
Query Text: select "id", "sku", "name", "description", "unit", "reorder_point", "brand", "category", "condition", "is_active", "created_at", "updated_at" from "products" where ("products"."organization_id" = $1 and "products"."id" = $2) limit $3
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '5eed0004-0000-4000-8000-000000000000', $3 = '1'
Limit  (cost=0.29..2.50 rows=1 width=172) (actual time=0.031..0.031 rows=1.00 loops=1)
  Buffers: shared hit=3
  ->  Index Scan using products_organization_id_id_unique on products  (cost=0.29..2.50 rows=1 width=172) (actual time=0.029..0.029 rows=1.00 loops=1)
        Index Cond: ((organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid) AND (id = '5eed0004-0000-4000-8000-000000000000'::uuid))
        Index Searches: 1
        Buffers: shared hit=3
```

### Consulta 2 de 3

```text
duration: 0.053 ms  plan:
Query Text: select distinct on ("product_prices"."product_id") "id", "product_id", "amount", "currency", "created_by", "created_at" from "product_prices" where ("product_prices"."organization_id" = $1 and "product_prices"."product_id" in ($2)) order by "product_prices"."product_id", "product_prices"."created_at" desc, "product_prices"."id" desc
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '5eed0004-0000-4000-8000-000000000000'
Limit  (cost=2.51..2.52 rows=1 width=66) (actual time=0.040..0.041 rows=1.00 loops=1)
  Buffers: shared hit=3
  ->  Sort  (cost=2.51..2.52 rows=1 width=66) (actual time=0.039..0.040 rows=1.00 loops=1)
        Sort Key: created_at DESC, id DESC
        Sort Method: quicksort  Memory: 25kB
        Buffers: shared hit=3
        ->  Index Scan using product_prices_product_history_idx on product_prices  (cost=0.29..2.50 rows=1 width=66) (actual time=0.028..0.030 rows=1.00 loops=1)
              Index Cond: ((organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid) AND (product_id = '5eed0004-0000-4000-8000-000000000000'::uuid))
              Index Searches: 1
              Buffers: shared hit=3
```

### Consulta 3 de 3

```text
duration: 0.037 ms  plan:
Query Text: select "product_id", "quantity_on_hand" from "inventories" where ("inventories"."organization_id" = $1 and "inventories"."product_id" in ($2))
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '5eed0004-0000-4000-8000-000000000000'
Index Scan using inventories_product_id_unique on inventories  (cost=0.29..2.51 rows=1 width=20) (actual time=0.030..0.032 rows=1.00 loops=1)
  Index Cond: (product_id = '5eed0004-0000-4000-8000-000000000000'::uuid)
  Filter: (organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid)
  Index Searches: 1
  Buffers: shared hit=3
```

## API knowledge: vigentes sin texto

Resultado: 20 filas.

### Consulta 1 de 2

```text
duration: 0.025 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.021..0.022 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.019..0.020 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0000-4000-8000-000000000021'::uuid)
        Buffers: shared hit=1
```

### Consulta 2 de 2

```text
duration: 1.256 ms  plan:
Query Text: select "id", "title", "category", "content", "is_active", "valid_from", "valid_until", case
    when not "is_active" then 'inactive'
    when "valid_from" > (now() at time zone $1)::date then 'scheduled'
    when "valid_until" < (now() at time zone $2)::date then 'expired'
    else 'current' end, "created_at", "updated_at" from "knowledge_entries" where ("knowledge_entries"."organization_id" = $3 and case
    when not "knowledge_entries"."is_active" then 'inactive'
    when "knowledge_entries"."valid_from" > (now() at time zone $4)::date then 'scheduled'
    when "knowledge_entries"."valid_until" < (now() at time zone $5)::date then 'expired'
    else 'current' end = $6) order by "knowledge_entries"."category" asc, "knowledge_entries"."title" asc, "knowledge_entries"."id" asc limit $7
Query Parameters: $1 = 'America/Argentina/Buenos_Aires', $2 = 'America/Argentina/Buenos_Aires', $3 = '5eed0000-0000-4000-8000-000000000021', $4 = 'America/Argentina/Buenos_Aires', $5 = 'America/Argentina/Buenos_Aires', $6 = 'current', $7 = '20'
Limit  (cost=47.79..47.79 rows=1 width=164) (actual time=1.208..1.214 rows=20.00 loops=1)
  Buffers: shared hit=100
  ->  Sort  (cost=47.79..47.79 rows=1 width=164) (actual time=1.205..1.208 rows=20.00 loops=1)
        Sort Key: category, title, id
        Sort Method: top-N heapsort  Memory: 32kB
        Buffers: shared hit=100
        ->  Index Scan using knowledge_entries_organization_title_lower_unique on knowledge_entries  (cost=0.28..47.78 rows=1 width=164) (actual time=0.303..0.886 rows=119.00 loops=1)
              Index Cond: (organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid)
              Filter: (CASE WHEN (NOT is_active) THEN 'inactive'::text WHEN (valid_from > ((now() AT TIME ZONE 'America/Argentina/Buenos_Aires'::text))::date) THEN 'scheduled'::text WHEN (valid_until < ((now() AT TIME ZONE 'America/Argentina/Buenos_Aires'::text))::date) THEN 'expired'::text ELSE 'current'::text END = 'current'::text)
              Rows Removed by Filter: 81
              Index Searches: 1
              Buffers: shared hit=100
```

## API knowledge: vigentes con texto

Resultado: 17 filas.

### Consulta 1 de 4

```text
duration: 0.025 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.021..0.021 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.019..0.019 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0000-4000-8000-000000000021'::uuid)
        Buffers: shared hit=1
```

### Consulta 2 de 4

```text
duration: 0.008 ms  plan:
Query Text:  SELECT public.unaccent('public.unaccent'::regdictionary, $1) 
Query Parameters: $1 = 'horario'
Result  (cost=0.00..0.01 rows=1 width=32) (actual time=0.005..0.005 rows=1.00 loops=1)
```

### Consulta 3 de 4

```text
duration: 0.005 ms  plan:
Query Text:  SELECT public.unaccent('public.unaccent'::regdictionary, $1) 
Query Parameters: $1 = 'horario'
Result  (cost=0.00..0.01 rows=1 width=32) (actual time=0.003..0.003 rows=1.00 loops=1)
```

### Consulta 4 de 4

```text
duration: 0.354 ms  plan:
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
Query Parameters: $1 = 'America/Argentina/Buenos_Aires', $2 = 'America/Argentina/Buenos_Aires', $3 = '5eed0000-0000-4000-8000-000000000021', $4 = 'America/Argentina/Buenos_Aires', $5 = 'America/Argentina/Buenos_Aires', $6 = 'current', $7 = 'horario', $8 = 'horario', $9 = '20'
Limit  (cost=9.76..9.77 rows=1 width=168) (actual time=0.318..0.326 rows=17.00 loops=1)
  Buffers: shared hit=17
  InitPlan 1
    ->  Aggregate  (cost=0.23..0.25 rows=1 width=32) (actual time=0.014..0.014 rows=1.00 loops=1)
          ->  Function Scan on unnest l  (cost=0.00..0.10 rows=10 width=32) (actual time=0.008..0.008 rows=1.00 loops=1)
  InitPlan 2
    ->  Aggregate  (cost=0.23..0.25 rows=1 width=32) (actual time=0.029..0.030 rows=1.00 loops=1)
          ->  Function Scan on unnest l_1  (cost=0.00..0.10 rows=10 width=32) (actual time=0.015..0.016 rows=1.00 loops=1)
  ->  Sort  (cost=9.27..9.28 rows=1 width=168) (actual time=0.316..0.319 rows=17.00 loops=1)
        Sort Key: (ts_rank(knowledge_entries.search, (InitPlan 1).col1)) DESC, knowledge_entries.title, knowledge_entries.id
        Sort Method: quicksort  Memory: 29kB
        Buffers: shared hit=17
        ->  Bitmap Heap Scan on knowledge_entries  (cost=8.10..9.26 rows=1 width=168) (actual time=0.204..0.276 rows=17.00 loops=1)
              Recheck Cond: ((search @@ (InitPlan 2).col1) AND (organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid))
              Filter: (CASE WHEN (NOT is_active) THEN 'inactive'::text WHEN (valid_from > ((now() AT TIME ZONE 'America/Argentina/Buenos_Aires'::text))::date) THEN 'scheduled'::text WHEN (valid_until < ((now() AT TIME ZONE 'America/Argentina/Buenos_Aires'::text))::date) THEN 'expired'::text ELSE 'current'::text END = 'current'::text)
              Rows Removed by Filter: 5
              Heap Blocks: exact=10
              Buffers: shared hit=17
              ->  BitmapAnd  (cost=8.10..8.10 rows=1 width=0) (actual time=0.154..0.155 rows=0.00 loops=1)
                    Buffers: shared hit=7
                    ->  Bitmap Index Scan on knowledge_entries_search_idx  (cost=0.00..2.78 rows=7 width=0) (actual time=0.091..0.091 rows=174.00 loops=1)
                          Index Cond: (search @@ (InitPlan 2).col1)
                          Index Searches: 1
                          Buffers: shared hit=3
                    ->  Bitmap Index Scan on knowledge_entries_organization_title_lower_unique  (cost=0.00..5.08 rows=200 width=0) (actual time=0.058..0.058 rows=200.00 loops=1)
                          Index Cond: (organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid)
                          Index Searches: 1
                          Buffers: shared hit=4
```

## conversations.resolveIngestedConversation (con vigente)

Resultado: conversación vigente.

### Consulta 1 de 4

```text
duration: 0.231 ms  plan:
Query Text: select "id" from "clients" where ("clients"."organization_id" = $1 and "clients"."phone_e164" = $2) for update
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '+5491160002912'
LockRows  (cost=0.29..2.51 rows=1 width=22) (actual time=0.222..0.225 rows=1.00 loops=1)
  Buffers: shared hit=5
  ->  Index Scan using clients_organization_phone_unique on clients  (cost=0.29..2.50 rows=1 width=22) (actual time=0.159..0.161 rows=1.00 loops=1)
        Index Cond: ((organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid) AND (phone_e164 = '+5491160002912'::text))
        Index Searches: 1
        Buffers: shared hit=3
```

### Consulta 2 de 4

```text
duration: 0.059 ms  plan:
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
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '5eed0001-0000-4000-8000-000000000b60', $3 = 'whatsapp', $4 = '2026-09-28 03:12:04.599+00', $5 = '2026-09-30 03:12:04.599+00', $6 = '2026-09-29 03:12:04.599+00', $7 = '2026-09-29 03:12:04.599+00'
Limit  (cost=2.53..2.55 rows=1 width=65) (actual time=0.051..0.052 rows=1.00 loops=1)
  Buffers: shared hit=6
  ->  LockRows  (cost=2.53..2.55 rows=1 width=65) (actual time=0.050..0.050 rows=1.00 loops=1)
        Buffers: shared hit=6
        ->  Sort  (cost=2.53..2.54 rows=1 width=65) (actual time=0.039..0.039 rows=1.00 loops=1)
              Sort Key: (GREATEST((started_at - '2026-09-29 03:12:04.599+00'::timestamp with time zone), ('2026-09-29 03:12:04.599+00'::timestamp with time zone - last_message_at), '00:00:00'::interval)), last_message_at DESC, id DESC
              Sort Method: quicksort  Memory: 25kB
              Buffers: shared hit=5
              ->  Index Scan using conversations_organization_client_last_message_idx on conversations  (cost=0.29..2.52 rows=1 width=65) (actual time=0.022..0.023 rows=1.00 loops=1)
                    Index Cond: ((organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid) AND (client_id = '5eed0001-0000-4000-8000-000000000b60'::uuid) AND (last_message_at >= '2026-09-28 03:12:04.599+00'::timestamp with time zone))
                    Filter: ((external_ref IS NOT NULL) AND (status = ANY ('{open,pending}'::conversation_status[])) AND (started_at <= '2026-09-30 03:12:04.599+00'::timestamp with time zone) AND (channel = 'whatsapp'::conversation_channel))
                    Index Searches: 1
                    Buffers: shared hit=3
```

### Consulta 3 de 4

```text
duration: 1.179 ms  plan:
Query Text: 
    insert into messages
      (organization_id, conversation_id, direction, external_ref, sent_at, body_text, kind, sent_by)
    values ($1, $2, $3,
      $4, $5, $6, $7, $8)
    on conflict (organization_id, conversation_id, external_ref) where external_ref is not null
    do nothing
    returning id
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '5eed0002-0000-4000-8000-00000000213a', $3 = 'inbound', $4 = 'medicion-13-2-mensaje', $5 = '2026-09-29 03:12:04.599+00', $6 = 'Mensaje de la medición', $7 = NULL, $8 = NULL
Insert on messages  (cost=0.00..0.01 rows=1 width=140) (actual time=0.272..0.273 rows=1.00 loops=1)
  Conflict Resolution: NOTHING
  Conflict Arbiter Indexes: messages_organization_conversation_external_ref_unique
  Tuples Inserted: 1
  Conflicting Tuples: 0
  Buffers: shared hit=23
  ->  Result  (cost=0.00..0.01 rows=1 width=140) (actual time=0.033..0.033 rows=1.00 loops=1)
```

### Consulta 4 de 4

```text
duration: 0.221 ms  plan:
Query Text: update "conversations" set "started_at" = least("conversations"."started_at", $1), "last_message_at" = greatest("conversations"."last_message_at", $2), "updated_at" = $3 where ("conversations"."organization_id" = $4 and "conversations"."id" = $5) returning "id"
Query Parameters: $1 = '2026-09-29 03:12:04.599+00', $2 = '2026-09-29 03:12:04.599+00', $3 = '2026-09-30 14:33:14.21+00', $4 = '5eed0000-0000-4000-8000-000000000021', $5 = '5eed0002-0000-4000-8000-00000000213a'
Update on conversations  (cost=0.29..2.51 rows=1 width=30) (actual time=0.215..0.217 rows=1.00 loops=1)
  Buffers: shared hit=32
  ->  Index Scan using conversations_organization_id_id_unique on conversations  (cost=0.29..2.51 rows=1 width=30) (actual time=0.018..0.019 rows=1.00 loops=1)
        Index Cond: ((organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid) AND (id = '5eed0002-0000-4000-8000-00000000213a'::uuid))
        Index Searches: 1
        Buffers: shared hit=3
```

## conversations.resolveIngestedConversation (sin vigente)

Resultado: conversación nueva.

### Consulta 1 de 4

```text
duration: 0.084 ms  plan:
Query Text: select "id" from "clients" where ("clients"."organization_id" = $1 and "clients"."phone_e164" = $2) for update
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '+5491160002912'
LockRows  (cost=0.29..2.51 rows=1 width=22) (actual time=0.076..0.079 rows=1.00 loops=1)
  Buffers: shared hit=5
  ->  Index Scan using clients_organization_phone_unique on clients  (cost=0.29..2.50 rows=1 width=22) (actual time=0.038..0.040 rows=1.00 loops=1)
        Index Cond: ((organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid) AND (phone_e164 = '+5491160002912'::text))
        Index Searches: 1
        Buffers: shared hit=3
```

### Consulta 2 de 4

```text
duration: 0.036 ms  plan:
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
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '5eed0001-0000-4000-8000-000000000b60', $3 = 'whatsapp', $4 = '2026-10-28 03:11:04.599+00', $5 = '2026-10-30 03:11:04.599+00', $6 = '2026-10-29 03:11:04.599+00', $7 = '2026-10-29 03:11:04.599+00'
Limit  (cost=2.53..2.55 rows=1 width=65) (actual time=0.034..0.035 rows=0.00 loops=1)
  Buffers: shared hit=2
  ->  LockRows  (cost=2.53..2.55 rows=1 width=65) (actual time=0.033..0.033 rows=0.00 loops=1)
        Buffers: shared hit=2
        ->  Sort  (cost=2.53..2.54 rows=1 width=65) (actual time=0.032..0.033 rows=0.00 loops=1)
              Sort Key: (GREATEST((started_at - '2026-10-29 03:11:04.599+00'::timestamp with time zone), ('2026-10-29 03:11:04.599+00'::timestamp with time zone - last_message_at), '00:00:00'::interval)), last_message_at DESC, id DESC
              Sort Method: quicksort  Memory: 25kB
              Buffers: shared hit=2
              ->  Index Scan using conversations_organization_client_last_message_idx on conversations  (cost=0.29..2.52 rows=1 width=65) (actual time=0.025..0.025 rows=0.00 loops=1)
                    Index Cond: ((organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid) AND (client_id = '5eed0001-0000-4000-8000-000000000b60'::uuid) AND (last_message_at >= '2026-10-28 03:11:04.599+00'::timestamp with time zone))
                    Filter: ((external_ref IS NOT NULL) AND (status = ANY ('{open,pending}'::conversation_status[])) AND (started_at <= '2026-10-30 03:11:04.599+00'::timestamp with time zone) AND (channel = 'whatsapp'::conversation_channel))
                    Index Searches: 1
                    Buffers: shared hit=2
```

### Consulta 3 de 4

```text
duration: 0.825 ms  plan:
Query Text: 
    insert into conversations
      (organization_id, client_id, channel, external_ref, status, started_at, last_message_at)
    values ($1, $2, $3,
      $4, 'open', $5, $6)
    on conflict (organization_id, channel, external_ref) where external_ref is not null
    do nothing
    returning id
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '5eed0001-0000-4000-8000-000000000b60', $3 = 'whatsapp', $4 = 'medicion-13-2-propuesta', $5 = '2026-10-29 03:11:04.599+00', $6 = '2026-10-29 03:11:04.599+00'
Insert on conversations  (cost=0.00..0.02 rows=1 width=120) (actual time=0.187..0.188 rows=1.00 loops=1)
  Conflict Resolution: NOTHING
  Conflict Arbiter Indexes: conversations_organization_channel_external_ref_unique
  Tuples Inserted: 1
  Conflicting Tuples: 0
  Buffers: shared hit=19
  ->  Result  (cost=0.00..0.02 rows=1 width=120) (actual time=0.031..0.031 rows=1.00 loops=1)
```

### Consulta 4 de 4

```text
duration: 0.421 ms  plan:
Query Text: 
    insert into messages
      (organization_id, conversation_id, direction, external_ref, sent_at, body_text, kind, sent_by)
    values ($1, $2, $3,
      $4, $5, $6, $7, $8)
    on conflict (organization_id, conversation_id, external_ref) where external_ref is not null
    do nothing
    returning id
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '82242d95-3b0d-4ae7-a3da-d8c82b499da7', $3 = 'inbound', $4 = 'medicion-13-2-mensaje', $5 = '2026-10-29 03:11:04.599+00', $6 = 'Mensaje de la medición', $7 = NULL, $8 = NULL
Insert on messages  (cost=0.00..0.01 rows=1 width=140) (actual time=0.174..0.176 rows=1.00 loops=1)
  Conflict Resolution: NOTHING
  Conflict Arbiter Indexes: messages_organization_conversation_external_ref_unique
  Tuples Inserted: 1
  Conflicting Tuples: 0
  Buffers: shared hit=13
  ->  Result  (cost=0.00..0.01 rows=1 width=140) (actual time=0.030..0.031 rows=1.00 loops=1)
```

## conversations.listRecentMessagesForService (20 de 12, de 65260 de la organización)

Resultado: 12 filas.

### Consulta 1 de 2

```text
duration: 0.050 ms  plan:
Query Text: select "id" from "conversations" where ("conversations"."organization_id" = $1 and "conversations"."channel" = $2 and "conversations"."external_ref" = $3) limit $4
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = 'whatsapp', $3 = 'vol-conv-0-16', $4 = '1'
Limit  (cost=0.41..2.63 rows=1 width=16) (actual time=0.046..0.046 rows=1.00 loops=1)
  Buffers: shared hit=4
  ->  Index Scan using conversations_organization_channel_external_ref_unique on conversations  (cost=0.41..2.63 rows=1 width=16) (actual time=0.044..0.044 rows=1.00 loops=1)
        Index Cond: ((organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid) AND (channel = 'whatsapp'::conversation_channel) AND (external_ref = 'vol-conv-0-16'::text))
        Index Searches: 1
        Buffers: shared hit=4
```

### Consulta 2 de 2

```text
duration: 0.076 ms  plan:
Query Text: select "external_ref", "direction", "sent_at", "body_text", "kind", "sent_by" from "messages" where ("messages"."organization_id" = $1 and "messages"."conversation_id" = $2) order by "messages"."sent_at" desc, "messages"."id" desc limit $3
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '5eed0002-0000-4000-8000-00000000000f', $3 = '20'
Limit  (cost=1.47..5.88 rows=5 width=100) (actual time=0.041..0.045 rows=12.00 loops=1)
  Buffers: shared hit=4
  ->  Incremental Sort  (cost=1.47..5.88 rows=5 width=100) (actual time=0.040..0.042 rows=12.00 loops=1)
        Sort Key: sent_at DESC, id DESC
        Presorted Key: sent_at
        Full-sort Groups: 1  Sort Method: quicksort  Average Memory: 26kB  Peak Memory: 26kB
        Buffers: shared hit=4
        ->  Index Scan Backward using messages_conversation_sent_idx on messages  (cost=0.42..5.65 rows=5 width=100) (actual time=0.019..0.025 rows=12.00 loops=1)
              Index Cond: (conversation_id = '5eed0002-0000-4000-8000-00000000000f'::uuid)
              Filter: (organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid)
              Index Searches: 1
              Buffers: shared hit=4
```

## conversations.listRecentMessagesForService (50, el máximo del contrato)

Resultado: 12 filas.

### Consulta 1 de 2

```text
duration: 0.049 ms  plan:
Query Text: select "id" from "conversations" where ("conversations"."organization_id" = $1 and "conversations"."channel" = $2 and "conversations"."external_ref" = $3) limit $4
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = 'whatsapp', $3 = 'vol-conv-0-16', $4 = '1'
Limit  (cost=0.41..2.63 rows=1 width=16) (actual time=0.045..0.046 rows=1.00 loops=1)
  Buffers: shared hit=4
  ->  Index Scan using conversations_organization_channel_external_ref_unique on conversations  (cost=0.41..2.63 rows=1 width=16) (actual time=0.043..0.043 rows=1.00 loops=1)
        Index Cond: ((organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid) AND (channel = 'whatsapp'::conversation_channel) AND (external_ref = 'vol-conv-0-16'::text))
        Index Searches: 1
        Buffers: shared hit=4
```

### Consulta 2 de 2

```text
duration: 0.079 ms  plan:
Query Text: select "external_ref", "direction", "sent_at", "body_text", "kind", "sent_by" from "messages" where ("messages"."organization_id" = $1 and "messages"."conversation_id" = $2) order by "messages"."sent_at" desc, "messages"."id" desc limit $3
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '5eed0002-0000-4000-8000-00000000000f', $3 = '50'
Limit  (cost=1.47..5.88 rows=5 width=100) (actual time=0.057..0.060 rows=12.00 loops=1)
  Buffers: shared hit=4
  ->  Incremental Sort  (cost=1.47..5.88 rows=5 width=100) (actual time=0.055..0.057 rows=12.00 loops=1)
        Sort Key: sent_at DESC, id DESC
        Presorted Key: sent_at
        Full-sort Groups: 1  Sort Method: quicksort  Average Memory: 26kB  Peak Memory: 26kB
        Buffers: shared hit=4
        ->  Index Scan Backward using messages_conversation_sent_idx on messages  (cost=0.42..5.65 rows=5 width=100) (actual time=0.033..0.039 rows=12.00 loops=1)
              Index Cond: (conversation_id = '5eed0002-0000-4000-8000-00000000000f'::uuid)
              Filter: (organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid)
              Index Searches: 1
              Buffers: shared hit=4
```

## analytics 1 conversaciones iniciadas

Resultado: valor 1590.

### Consulta 1 de 3

```text
duration: 0.054 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.051..0.051 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.049..0.049 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0000-4000-8000-000000000021'::uuid)
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
duration: 0.519 ms  plan:
Query Text: select count(*) from "conversations" where ("conversations"."organization_id" = $1 and "conversations"."started_at" >= ($2::date::timestamp at time zone $3) and "conversations"."started_at" < (($4::date + 1)::timestamp at time zone $5))
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '2026-08-31', $3 = 'America/Argentina/Buenos_Aires', $4 = '2026-09-29', $5 = 'America/Argentina/Buenos_Aires'
Aggregate  (cost=51.73..51.74 rows=1 width=8) (actual time=0.513..0.514 rows=1.00 loops=1)
  Buffers: shared hit=16
  ->  Index Only Scan using conversations_organization_started_idx on conversations  (cost=0.29..47.80 rows=1574 width=0) (actual time=0.023..0.362 rows=1590.00 loops=1)
        Index Cond: ((organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid) AND (started_at >= '2026-08-31 03:00:00+00'::timestamp with time zone) AND (started_at < '2026-09-30 03:00:00+00'::timestamp with time zone))
        Heap Fetches: 8
        Index Searches: 1
        Buffers: shared hit=16
```

## analytics 2 conversaciones activas

Resultado: valor 1622.

### Consulta 1 de 3

```text
duration: 0.025 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.021..0.022 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.020..0.020 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0000-4000-8000-000000000021'::uuid)
        Buffers: shared hit=1
```

### Consulta 2 de 3

```text
duration: 0.022 ms  plan:
Query Text: select to_char((now() at time zone $1)::date, 'YYYY-MM-DD') as today
Query Parameters: $1 = 'America/Argentina/Buenos_Aires'
Result  (cost=0.00..0.02 rows=1 width=32) (actual time=0.019..0.019 rows=1.00 loops=1)
```

### Consulta 3 de 3

```text
duration: 30.055 ms  plan:
Query Text: select count(distinct "conversation_id") from "messages" where ("messages"."organization_id" = $1 and "messages"."sent_at" >= ($2::date::timestamp at time zone $3) and "messages"."sent_at" < (($4::date + 1)::timestamp at time zone $5))
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '2026-08-31', $3 = 'America/Argentina/Buenos_Aires', $4 = '2026-09-29', $5 = 'America/Argentina/Buenos_Aires'
Aggregate  (cost=2270.88..2270.89 rows=1 width=8) (actual time=30.037..30.040 rows=1.00 loops=1)
  Buffers: shared hit=10598
  ->  Sort  (cost=2206.82..2238.85 rows=12812 width=16) (actual time=26.764..27.921 rows=10658.00 loops=1)
        Sort Key: conversation_id
        Sort Method: quicksort  Memory: 385kB
        Buffers: shared hit=10598
        ->  Index Scan using messages_organization_sent_idx on messages  (cost=0.42..1332.71 rows=12812 width=16) (actual time=0.043..18.312 rows=10658.00 loops=1)
              Index Cond: ((organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid) AND (sent_at >= '2026-08-31 03:00:00+00'::timestamp with time zone) AND (sent_at < '2026-09-30 03:00:00+00'::timestamp with time zone))
              Index Searches: 1
              Buffers: shared hit=10598
```

## analytics 3 clientes únicos

Resultado: valor {"clients":1197,"withoutClient":35.

### Consulta 1 de 3

```text
duration: 0.025 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.020..0.021 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.018..0.018 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0000-4000-8000-000000000021'::uuid)
        Buffers: shared hit=1
```

### Consulta 2 de 3

```text
duration: 0.031 ms  plan:
Query Text: select to_char((now() at time zone $1)::date, 'YYYY-MM-DD') as today
Query Parameters: $1 = 'America/Argentina/Buenos_Aires'
Result  (cost=0.00..0.02 rows=1 width=32) (actual time=0.027..0.027 rows=1.00 loops=1)
```

### Consulta 3 de 3

```text
duration: 22.176 ms  plan:
Query Text: select count(distinct "client_id"), count(*) filter (where "client_id" is null) from "conversations" where ("conversations"."organization_id" = $1 and "conversations"."id" in (select distinct "conversation_id" from "messages" where ("messages"."organization_id" = $2 and "messages"."sent_at" >= ($3::date::timestamp at time zone $4) and "messages"."sent_at" < (($5::date + 1)::timestamp at time zone $6))))
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '5eed0000-0000-4000-8000-000000000021', $3 = '2026-08-31', $4 = 'America/Argentina/Buenos_Aires', $5 = '2026-09-29', $6 = 'America/Argentina/Buenos_Aires'
Aggregate  (cost=2398.85..2398.86 rows=1 width=16) (actual time=22.157..22.163 rows=1.00 loops=1)
  Buffers: shared hit=10824
  ->  Sort  (cost=2354.42..2369.23 rows=5924 width=16) (actual time=21.725..21.888 rows=1622.00 loops=1)
        Sort Key: conversations.client_id
        Sort Method: quicksort  Memory: 49kB
        Buffers: shared hit=10824
        ->  Hash Join  (cost=1552.68..1983.21 rows=5924 width=16) (actual time=15.643..21.033 rows=1622.00 loops=1)
              Hash Cond: (conversations.id = messages.conversation_id)
              Buffers: shared hit=10824
              ->  Seq Scan on conversations  (cost=0.00..404.26 rows=10000 width=32) (actual time=0.020..3.012 rows=10000.00 loops=1)
                    Filter: (organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid)
                    Rows Removed by Filter: 4101
                    Buffers: shared hit=228
              ->  Hash  (cost=1448.27..1448.27 rows=8353 width=16) (actual time=15.585..15.587 rows=1622.00 loops=1)
                    Buckets: 16384  Batches: 1  Memory Usage: 205kB
                    Buffers: shared hit=10596
                    ->  HashAggregate  (cost=1364.74..1448.27 rows=8353 width=16) (actual time=14.619..15.050 rows=1622.00 loops=1)
                          Group Key: messages.conversation_id
                          Batches: 1  Memory Usage: 345kB
                          Buffers: shared hit=10596
                          ->  Index Scan using messages_organization_sent_idx on messages  (cost=0.42..1332.71 rows=12812 width=16) (actual time=0.041..10.422 rows=10658.00 loops=1)
                                Index Cond: ((organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid) AND (sent_at >= '2026-08-31 03:00:00+00'::timestamp with time zone) AND (sent_at < '2026-09-30 03:00:00+00'::timestamp with time zone))
                                Index Searches: 1
                                Buffers: shared hit=10596
```

## analytics 4-5 mensajes

Resultado: valor {"inbound":5747,"outbound":4911}.

### Consulta 1 de 3

```text
duration: 0.026 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.021..0.022 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.019..0.019 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0000-4000-8000-000000000021'::uuid)
        Buffers: shared hit=1
```

### Consulta 2 de 3

```text
duration: 0.024 ms  plan:
Query Text: select to_char((now() at time zone $1)::date, 'YYYY-MM-DD') as today
Query Parameters: $1 = 'America/Argentina/Buenos_Aires'
Result  (cost=0.00..0.02 rows=1 width=32) (actual time=0.020..0.021 rows=1.00 loops=1)
```

### Consulta 3 de 3

```text
duration: 11.809 ms  plan:
Query Text: select count(*) filter (where "direction" = 'inbound'), count(*) filter (where "direction" = 'outbound') from "messages" where ("messages"."organization_id" = $1 and "messages"."sent_at" >= ($2::date::timestamp at time zone $3) and "messages"."sent_at" < (($4::date + 1)::timestamp at time zone $5))
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '2026-08-31', $3 = 'America/Argentina/Buenos_Aires', $4 = '2026-09-29', $5 = 'America/Argentina/Buenos_Aires'
Aggregate  (cost=1460.83..1460.84 rows=1 width=16) (actual time=11.791..11.793 rows=1.00 loops=1)
  Buffers: shared hit=10596
  ->  Index Scan using messages_organization_sent_idx on messages  (cost=0.42..1332.71 rows=12812 width=4) (actual time=0.031..9.295 rows=10658.00 loops=1)
        Index Cond: ((organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid) AND (sent_at >= '2026-08-31 03:00:00+00'::timestamp with time zone) AND (sent_at < '2026-09-30 03:00:00+00'::timestamp with time zone))
        Index Searches: 1
        Buffers: shared hit=10596
```

## analytics 6 mensajes por conversación

Resultado: valor {"status":"value","conversations":.

### Consulta 1 de 3

```text
duration: 0.023 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.019..0.020 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.017..0.017 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0000-4000-8000-000000000021'::uuid)
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
duration: 13.760 ms  plan:
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
  
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '2026-08-31', $3 = 'America/Argentina/Buenos_Aires', $4 = '2026-09-29', $5 = 'America/Argentina/Buenos_Aires'
Aggregate  (cost=1647.37..1647.38 rows=1 width=48) (actual time=13.742..13.745 rows=1.00 loops=1)
  Buffers: shared hit=10604
  ->  HashAggregate  (cost=1396.77..1480.30 rows=8353 width=24) (actual time=12.759..13.219 rows=1622.00 loops=1)
        Group Key: messages.conversation_id
        Batches: 1  Memory Usage: 409kB
        Buffers: shared hit=10596
        ->  Index Scan using messages_organization_sent_idx on messages  (cost=0.42..1332.71 rows=12812 width=16) (actual time=0.031..8.690 rows=10658.00 loops=1)
              Index Cond: ((organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid) AND (sent_at >= '2026-08-31 03:00:00+00'::timestamp with time zone) AND (sent_at < '2026-09-30 03:00:00+00'::timestamp with time zone))
              Index Searches: 1
              Buffers: shared hit=10596
```

## analytics 10 actividad diaria

Resultado: valor [{"day":"2026-08-31","started":59,.

### Consulta 1 de 3

```text
duration: 0.023 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.019..0.020 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.018..0.018 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0000-4000-8000-000000000021'::uuid)
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
duration: 36.645 ms  plan:
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
  
Query Parameters: $1 = '2026-08-31', $2 = '2026-09-29', $3 = 'America/Argentina/Buenos_Aires', $4 = '5eed0000-0000-4000-8000-000000000021', $5 = '2026-08-31', $6 = 'America/Argentina/Buenos_Aires', $7 = '2026-09-29', $8 = 'America/Argentina/Buenos_Aires', $9 = 'America/Argentina/Buenos_Aires', $10 = '5eed0000-0000-4000-8000-000000000021', $11 = '2026-08-31', $12 = 'America/Argentina/Buenos_Aires', $13 = '2026-09-29', $14 = 'America/Argentina/Buenos_Aires'
Merge Left Join  (cost=2383.36..2992.76 rows=30 width=68) (actual time=32.681..36.595 rows=30.00 loops=1)
  Merge Cond: (((d.d)::date) = (((messages.sent_at AT TIME ZONE 'America/Argentina/Buenos_Aires'::text))::date))
  Buffers: shared hit=10611
  ->  Sort  (cost=112.48..112.55 rows=30 width=16) (actual time=1.975..1.991 rows=30.00 loops=1)
        Sort Key: ((d.d)::date)
        Sort Method: quicksort  Memory: 26kB
        Buffers: shared hit=15
        ->  Hash Right Join  (cost=64.22..111.74 rows=30 width=16) (actual time=1.911..1.960 rows=30.00 loops=1)
              Hash Cond: ((((conversations.started_at AT TIME ZONE 'America/Argentina/Buenos_Aires'::text))::date) = (d.d)::date)
              Buffers: shared hit=15
              ->  HashAggregate  (cost=63.54..87.15 rows=1574 width=12) (actual time=1.838..1.858 rows=28.00 loops=1)
                    Group Key: ((conversations.started_at AT TIME ZONE 'America/Argentina/Buenos_Aires'::text))::date
                    Batches: 1  Memory Usage: 65kB
                    Buffers: shared hit=15
                    ->  Index Only Scan using conversations_organization_started_idx on conversations  (cost=0.29..55.67 rows=1574 width=4) (actual time=0.031..1.368 rows=1590.00 loops=1)
                          Index Cond: ((organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid) AND (started_at >= '2026-08-31 03:00:00+00'::timestamp with time zone) AND (started_at < '2026-09-30 03:00:00+00'::timestamp with time zone))
                          Heap Fetches: 7
                          Index Searches: 1
                          Buffers: shared hit=15
              ->  Hash  (cost=0.31..0.31 rows=30 width=8) (actual time=0.062..0.064 rows=30.00 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 10kB
                    ->  Function Scan on generate_series d  (cost=0.01..0.31 rows=30 width=8) (actual time=0.046..0.050 rows=30.00 loops=1)
  ->  GroupAggregate  (cost=2270.88..2687.27 rows=12812 width=28) (actual time=30.683..34.489 rows=30.00 loops=1)
        Group Key: (((messages.sent_at AT TIME ZONE 'America/Argentina/Buenos_Aires'::text))::date)
        Buffers: shared hit=10596
        ->  Sort  (cost=2270.88..2302.91 rows=12812 width=24) (actual time=30.498..31.747 rows=10658.00 loops=1)
              Sort Key: (((messages.sent_at AT TIME ZONE 'America/Argentina/Buenos_Aires'::text))::date), messages.conversation_id
              Sort Method: quicksort  Memory: 801kB
              Buffers: shared hit=10596
              ->  Index Scan using messages_organization_sent_idx on messages  (cost=0.42..1396.77 rows=12812 width=24) (actual time=0.061..23.699 rows=10658.00 loops=1)
                    Index Cond: ((organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid) AND (sent_at >= '2026-08-31 03:00:00+00'::timestamp with time zone) AND (sent_at < '2026-09-30 03:00:00+00'::timestamp with time zone))
                    Index Searches: 1
                    Buffers: shared hit=10596
```

## analytics 7 respondidas

Resultado: valor 1389.

### Consulta 1 de 3

```text
duration: 0.024 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.020..0.021 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.018..0.018 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0000-4000-8000-000000000021'::uuid)
        Buffers: shared hit=1
```

### Consulta 2 de 3

```text
duration: 0.022 ms  plan:
Query Text: select to_char((now() at time zone $1)::date, 'YYYY-MM-DD') as today
Query Parameters: $1 = 'America/Argentina/Buenos_Aires'
Result  (cost=0.00..0.02 rows=1 width=32) (actual time=0.019..0.020 rows=1.00 loops=1)
```

### Consulta 3 de 3

```text
duration: 18.951 ms  plan:
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
  
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '2026-08-31', $3 = 'America/Argentina/Buenos_Aires', $4 = '2026-09-29', $5 = 'America/Argentina/Buenos_Aires'
Aggregate  (cost=1631.74..1631.75 rows=1 width=8) (actual time=18.935..18.937 rows=1.00 loops=1)
  Buffers: shared hit=10596
  ->  HashAggregate  (cost=1492.86..1597.27 rows=2757 width=32) (actual time=18.158..18.788 rows=1389.00 loops=1)
        Group Key: messages.conversation_id
        Filter: ((min(messages.sent_at) FILTER (WHERE (messages.direction = 'inbound'::message_direction)) IS NOT NULL) AND (max(messages.sent_at) FILTER (WHERE (messages.direction = 'outbound'::message_direction)) IS NOT NULL) AND (max(messages.sent_at) FILTER (WHERE (messages.direction = 'outbound'::message_direction)) > min(messages.sent_at) FILTER (WHERE (messages.direction = 'inbound'::message_direction))))
        Batches: 1  Memory Usage: 409kB
        Rows Removed by Filter: 233
        Buffers: shared hit=10596
        ->  Index Scan using messages_organization_sent_idx on messages  (cost=0.42..1332.71 rows=12812 width=28) (actual time=0.031..12.875 rows=10658.00 loops=1)
              Index Cond: ((organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid) AND (sent_at >= '2026-08-31 03:00:00+00'::timestamp with time zone) AND (sent_at < '2026-09-30 03:00:00+00'::timestamp with time zone))
              Index Searches: 1
              Buffers: shared hit=10596
```

## analytics 8 cobertura de respuesta

Resultado: valor {"status":"value","responded":1389.

### Consulta 1 de 3

```text
duration: 0.027 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.021..0.022 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.019..0.019 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0000-4000-8000-000000000021'::uuid)
        Buffers: shared hit=1
```

### Consulta 2 de 3

```text
duration: 0.024 ms  plan:
Query Text: select to_char((now() at time zone $1)::date, 'YYYY-MM-DD') as today
Query Parameters: $1 = 'America/Argentina/Buenos_Aires'
Result  (cost=0.00..0.02 rows=1 width=32) (actual time=0.021..0.022 rows=1.00 loops=1)
```

### Consulta 3 de 3

```text
duration: 19.122 ms  plan:
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
  
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '2026-08-31', $3 = 'America/Argentina/Buenos_Aires', $4 = '2026-09-29', $5 = 'America/Argentina/Buenos_Aires'
Aggregate  (cost=1721.83..1721.84 rows=1 width=16) (actual time=19.106..19.108 rows=1.00 loops=1)
  Buffers: shared hit=10596
  ->  HashAggregate  (cost=1492.86..1576.39 rows=8311 width=32) (actual time=18.087..18.862 rows=1601.00 loops=1)
        Group Key: messages.conversation_id
        Filter: (min(messages.sent_at) FILTER (WHERE (messages.direction = 'inbound'::message_direction)) IS NOT NULL)
        Batches: 1  Memory Usage: 409kB
        Rows Removed by Filter: 21
        Buffers: shared hit=10596
        ->  Index Scan using messages_organization_sent_idx on messages  (cost=0.42..1332.71 rows=12812 width=28) (actual time=0.045..10.493 rows=10658.00 loops=1)
              Index Cond: ((organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid) AND (sent_at >= '2026-08-31 03:00:00+00'::timestamp with time zone) AND (sent_at < '2026-09-30 03:00:00+00'::timestamp with time zone))
              Index Searches: 1
              Buffers: shared hit=10596
```

## analytics 9 tiempo de primera respuesta

Resultado: valor {"population":1571,"withoutRespons.

### Consulta 1 de 3

```text
duration: 0.025 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.021..0.022 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.019..0.019 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0000-4000-8000-000000000021'::uuid)
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
duration: 75.087 ms  plan:
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
  
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '2026-08-31', $3 = 'America/Argentina/Buenos_Aires', $4 = '2026-09-29', $5 = 'America/Argentina/Buenos_Aires', $6 = '5eed0000-0000-4000-8000-000000000021', $7 = '2026-08-31', $8 = 'America/Argentina/Buenos_Aires', $9 = '2026-09-29', $10 = 'America/Argentina/Buenos_Aires', $11 = '5eed0000-0000-4000-8000-000000000021'
Aggregate  (cost=21717.58..21717.59 rows=1 width=24) (actual time=75.025..75.072 rows=1.00 loops=1)
  Buffers: shared hit=34857
  CTE first_inbound
    ->  Subquery Scan on candidates  (cost=1364.74..21045.75 rows=8353 width=24) (actual time=13.263..31.599 rows=1622.00 loops=1)
          Buffers: shared hit=17086
          ->  HashAggregate  (cost=1364.74..1448.27 rows=8353 width=16) (actual time=13.224..14.019 rows=1622.00 loops=1)
                Group Key: messages.conversation_id
                Batches: 1  Memory Usage: 345kB
                Buffers: shared hit=10596
                ->  Index Scan using messages_organization_sent_idx on messages  (cost=0.42..1332.71 rows=12812 width=16) (actual time=0.068..9.050 rows=10658.00 loops=1)
                      Index Cond: ((organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid) AND (sent_at >= '2026-08-31 03:00:00+00'::timestamp with time zone) AND (sent_at < '2026-09-30 03:00:00+00'::timestamp with time zone))
                      Index Searches: 1
                      Buffers: shared hit=10596
          SubPlan 2
            ->  Result  (cost=2.34..2.35 rows=1 width=8) (actual time=0.009..0.009 rows=1.00 loops=1622)
                  Buffers: shared hit=6490
                  InitPlan 1
                    ->  Limit  (cost=0.42..2.34 rows=1 width=8) (actual time=0.009..0.009 rows=0.99 loops=1622)
                          Buffers: shared hit=6490
                          ->  Index Scan using messages_conversation_sent_idx on messages m  (cost=0.42..6.17 rows=3 width=8) (actual time=0.008..0.008 rows=0.99 loops=1622)
                                Index Cond: (conversation_id = candidates.conversation_id)
                                Filter: ((organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid) AND (direction = 'inbound'::message_direction))
                                Rows Removed by Filter: 0
                                Index Searches: 1622
                                Buffers: shared hit=6490
  ->  CTE Scan on first_inbound  (cost=0.00..208.83 rows=42 width=24) (actual time=13.269..32.918 rows=1571.00 loops=1)
        Filter: ((sent_at >= '2026-08-31 03:00:00+00'::timestamp with time zone) AND (sent_at < '2026-09-30 03:00:00+00'::timestamp with time zone))
        Rows Removed by Filter: 51
        Storage: Memory  Maximum Storage: 92kB
        Buffers: shared hit=17086
  SubPlan 5
    ->  Result  (cost=3.66..3.67 rows=1 width=8) (actual time=0.006..0.007 rows=1.00 loops=1571)
          Buffers: shared hit=6143
          InitPlan 4
            ->  Limit  (cost=0.42..3.66 rows=1 width=8) (actual time=0.006..0.006 rows=0.87 loops=1571)
                  Buffers: shared hit=6143
                  ->  Index Scan using messages_conversation_sent_idx on messages m_1  (cost=0.42..3.66 rows=1 width=8) (actual time=0.005..0.005 rows=0.87 loops=1571)
                        Index Cond: ((conversation_id = first_inbound.conversation_id) AND (sent_at > first_inbound.sent_at))
                        Filter: ((organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid) AND (direction = 'outbound'::message_direction))
                        Rows Removed by Filter: 0
                        Index Searches: 1571
                        Buffers: shared hit=6143
  SubPlan 9
    ->  Result  (cost=3.66..3.67 rows=1 width=8) (actual time=0.007..0.007 rows=1.00 loops=1571)
          Buffers: shared hit=6143
          InitPlan 8
            ->  Limit  (cost=0.42..3.66 rows=1 width=8) (actual time=0.006..0.006 rows=0.87 loops=1571)
                  Buffers: shared hit=6143
                  ->  Index Scan using messages_conversation_sent_idx on messages m_3  (cost=0.42..3.66 rows=1 width=8) (actual time=0.005..0.005 rows=0.87 loops=1571)
                        Index Cond: ((conversation_id = first_inbound.conversation_id) AND (sent_at > first_inbound.sent_at))
                        Filter: ((organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid) AND (direction = 'outbound'::message_direction))
                        Rows Removed by Filter: 0
                        Index Searches: 1571
                        Buffers: shared hit=6143
  SubPlan 7
    ->  Result  (cost=3.66..3.67 rows=1 width=8) (actual time=0.007..0.008 rows=1.00 loops=1369)
          Buffers: shared hit=5485
          InitPlan 6
            ->  Limit  (cost=0.42..3.66 rows=1 width=8) (actual time=0.007..0.007 rows=1.00 loops=1369)
                  Buffers: shared hit=5485
                  ->  Index Scan using messages_conversation_sent_idx on messages m_2  (cost=0.42..3.66 rows=1 width=8) (actual time=0.006..0.006 rows=1.00 loops=1369)
                        Index Cond: ((conversation_id = first_inbound.conversation_id) AND (sent_at > first_inbound.sent_at))
                        Filter: ((organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid) AND (direction = 'outbound'::message_direction))
                        Rows Removed by Filter: 0
                        Index Searches: 1369
                        Buffers: shared hit=5485
```

## analytics 11 distribución de estado

Resultado: valor {"open":523,"pending":559,"closed".

### Consulta 1 de 3

```text
duration: 0.020 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.017..0.017 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.015..0.015 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0000-4000-8000-000000000021'::uuid)
        Buffers: shared hit=1
```

### Consulta 2 de 3

```text
duration: 0.018 ms  plan:
Query Text: select to_char((now() at time zone $1)::date, 'YYYY-MM-DD') as today
Query Parameters: $1 = 'America/Argentina/Buenos_Aires'
Result  (cost=0.00..0.02 rows=1 width=32) (actual time=0.016..0.016 rows=1.00 loops=1)
```

### Consulta 3 de 3

```text
duration: 22.941 ms  plan:
Query Text: select count(*) filter (where "status" = 'open'), count(*) filter (where "status" = 'pending'), count(*) filter (where "status" = 'closed') from "conversations" where ("conversations"."organization_id" = $1 and "conversations"."id" in (select distinct "conversation_id" from "messages" where ("messages"."organization_id" = $2 and "messages"."sent_at" >= ($3::date::timestamp at time zone $4) and "messages"."sent_at" < (($5::date + 1)::timestamp at time zone $6))))
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '5eed0000-0000-4000-8000-000000000021', $3 = '2026-08-31', $4 = 'America/Argentina/Buenos_Aires', $5 = '2026-09-29', $6 = 'America/Argentina/Buenos_Aires'
Aggregate  (cost=2072.07..2072.08 rows=1 width=24) (actual time=22.922..22.926 rows=1.00 loops=1)
  Buffers: shared hit=10824
  ->  Hash Join  (cost=1552.68..1983.21 rows=5924 width=4) (actual time=15.416..22.434 rows=1622.00 loops=1)
        Hash Cond: (conversations.id = messages.conversation_id)
        Buffers: shared hit=10824
        ->  Seq Scan on conversations  (cost=0.00..404.26 rows=10000 width=20) (actual time=0.020..3.983 rows=10000.00 loops=1)
              Filter: (organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid)
              Rows Removed by Filter: 4101
              Buffers: shared hit=228
        ->  Hash  (cost=1448.27..1448.27 rows=8353 width=16) (actual time=15.363..15.365 rows=1622.00 loops=1)
              Buckets: 16384  Batches: 1  Memory Usage: 205kB
              Buffers: shared hit=10596
              ->  HashAggregate  (cost=1364.74..1448.27 rows=8353 width=16) (actual time=14.230..14.706 rows=1622.00 loops=1)
                    Group Key: messages.conversation_id
                    Batches: 1  Memory Usage: 345kB
                    Buffers: shared hit=10596
                    ->  Index Scan using messages_organization_sent_idx on messages  (cost=0.42..1332.71 rows=12812 width=16) (actual time=0.038..9.036 rows=10658.00 loops=1)
                          Index Cond: ((organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid) AND (sent_at >= '2026-08-31 03:00:00+00'::timestamp with time zone) AND (sent_at < '2026-09-30 03:00:00+00'::timestamp with time zone))
                          Index Searches: 1
                          Buffers: shared hit=10596
```

## analytics 12 errores de ingestión

Resultado: valor {"status":"value","total":3340,"fa.

### Consulta 1 de 3

```text
duration: 0.024 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.020..0.020 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.018..0.018 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0000-4000-8000-000000000021'::uuid)
        Buffers: shared hit=1
```

### Consulta 2 de 3

```text
duration: 0.018 ms  plan:
Query Text: select to_char((now() at time zone $1)::date, 'YYYY-MM-DD') as today
Query Parameters: $1 = 'America/Argentina/Buenos_Aires'
Result  (cost=0.00..0.02 rows=1 width=32) (actual time=0.015..0.016 rows=1.00 loops=1)
```

### Consulta 3 de 3

```text
duration: 10.897 ms  plan:
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
  
Query Parameters: $1 = '5eed0000-0000-4000-8000-000000000021', $2 = '2026-08-31', $3 = 'America/Argentina/Buenos_Aires', $4 = '2026-09-29', $5 = 'America/Argentina/Buenos_Aires'
Result  (cost=708.05..708.06 rows=1 width=40) (actual time=10.885..10.891 rows=1.00 loops=1)
  Buffers: shared hit=3361
  CTE events
    ->  Index Scan using ingestion_events_organization_received_idx on ingestion_events  (cost=0.29..480.14 rows=3341 width=26) (actual time=0.079..5.939 rows=3340.00 loops=1)
          Index Cond: ((organization_id = '5eed0000-0000-4000-8000-000000000021'::uuid) AND (received_at >= '2026-08-31 03:00:00+00'::timestamp with time zone) AND (received_at < '2026-09-30 03:00:00+00'::timestamp with time zone))
          Filter: (event_type <> ALL ('{client.resolved,conversation.escalated}'::text[]))
          Index Searches: 1
          Buffers: shared hit=3361
  InitPlan 2
    ->  Aggregate  (cost=75.17..75.19 rows=1 width=4) (actual time=8.754..8.756 rows=1.00 loops=1)
          Buffers: shared hit=3361
          ->  CTE Scan on events  (cost=0.00..66.82 rows=3341 width=0) (actual time=0.083..8.080 rows=3340.00 loops=1)
                Storage: Memory  Maximum Storage: 166kB
                Buffers: shared hit=3361
  InitPlan 3
    ->  Aggregate  (cost=75.74..75.75 rows=1 width=4) (actual time=0.926..0.927 rows=1.00 loops=1)
          ->  CTE Scan on events events_1  (cost=0.00..75.17 rows=227 width=0) (actual time=0.008..0.882 rows=234.00 loops=1)
                Filter: (status = 'failed'::ingestion_event_status)
                Rows Removed by Filter: 3106
                Storage: Memory  Maximum Storage: 166kB
  InitPlan 4
    ->  Aggregate  (cost=76.96..76.97 rows=1 width=32) (actual time=1.196..1.197 rows=1.00 loops=1)
          ->  Sort  (cost=76.94..76.94 rows=3 width=68) (actual time=1.164..1.165 rows=3.00 loops=1)
                Sort Key: ((count(*))::integer) DESC, events_2.source, events_2.error_code
                Sort Method: quicksort  Memory: 25kB
                ->  HashAggregate  (cost=76.88..76.91 rows=3 width=68) (actual time=1.142..1.144 rows=3.00 loops=1)
                      Group Key: events_2.source, events_2.error_code
                      Batches: 1  Memory Usage: 32kB
                      ->  CTE Scan on events events_2  (cost=0.00..75.17 rows=227 width=64) (actual time=0.005..0.937 rows=234.00 loops=1)
                            Filter: (status = 'failed'::ingestion_event_status)
                            Rows Removed by Filter: 3106
                            Storage: Memory  Maximum Storage: 166kB
```
