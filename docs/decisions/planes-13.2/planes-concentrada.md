# Planes — producción, concentrada

Parámetros: effective_cache_size = 131072 8kB; plan_cache_mode = auto; random_page_cost = 1.1; seq_page_cost = 1; server_version = 18.6 (Ubuntu 18.6-1.pgdg24.04+2); shared_buffers = 16384 8kB; work_mem = 4096 kB.

## catalog.searchProducts (sin texto)

Resultado: 295 filas.

### Consulta 1 de 1

```text
duration: 1.948 ms  plan:
Query Text: select "id", "sku", "name", "description", "unit", "reorder_point", "brand", "category", "condition", "is_active", "created_at", "updated_at" from "products" where ("products"."organization_id" = $1 and "products"."is_active" = $2)
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = 't'
Index Scan using products_organization_sku_lower_unique on products  (cost=0.29..111.91 rows=285 width=172) (actual time=0.024..0.253 rows=295.00 loops=1)
  Index Cond: (organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid)
  Filter: is_active
  Rows Removed by Filter: 5
  Index Searches: 1
  Buffers: shared hit=11
```

## inventory.listProductStock (sin filtro)

Resultado: 25/295 filas.

### Consulta 1 de 2

```text
duration: 0.816 ms  plan:
Query Text: select "id", "sku", "name", "description", "unit", "reorder_point", "brand", "category", "condition", "is_active", "created_at", "updated_at" from "products" where ("products"."organization_id" = $1 and "products"."is_active" = $2)
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = 't'
Index Scan using products_organization_sku_lower_unique on products  (cost=0.29..111.91 rows=285 width=172) (actual time=0.044..0.257 rows=295.00 loops=1)
  Index Cond: (organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid)
  Filter: is_active
  Rows Removed by Filter: 5
  Index Searches: 1
  Buffers: shared hit=11
```

### Consulta 2 de 2

```text
duration: 3.171 ms  plan:
Query Text: select "product_id", "quantity_on_hand" from "inventories" where ("inventories"."organization_id" = $1 and "inventories"."product_id" in ($2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51, $52, $53, $54, $55, $56, $57, $58, $59, $60, $61, $62, $63, $64, $65, $66, $67, $68, $69, $70, $71, $72, $73, $74, $75, $76, $77, $78, $79, $80, $81, $82, $83, $84, $85, $86, $87, $88, $89, $90, $91, $92, $93, $94, $95, $96, $97, $98, $99, $100, $101, $102, $103, $104, $105, $106, $107, $108, $109, $110, $111, $112, $113, $114, $115, $116, $117, $118, $119, $120, $121, $122, $123, $124, $125, $126, $127, $128, $129, $130, $131, $132, $133, $134, $135, $136, $137, $138, $139, $140, $141, $142, $143, $144, $145, $146, $147, $148, $149, $150, $151, $152, $153, $154, $155, $156, $157, $158, $159, $160, $161, $162, $163, $164, $165, $166, $167, $168, $169, $170, $171, $172, $173, $174, $175, $176, $177, $178, $179, $180, $181, $182, $183, $184, $185, $186, $187, $188, $189, $190, $191, $192, $193, $194, $195, $196, $197, $198, $199, $200, $201, $202, $203, $204, $205, $206, $207, $208, $209, $210, $211, $212, $213, $214, $215, $216, $217, $218, $219, $220, $221, $222, $223, $224, $225, $226, $227, $228, $229, $230, $231, $232, $233, $234, $235, $236, $237, $238, $239, $240, $241, $242, $243, $244, $245, $246, $247, $248, $249, $250, $251, $252, $253, $254, $255, $256, $257, $258, $259, $260, $261, $262, $263, $264, $265, $266, $267, $268, $269, $270, $271, $272, $273, $274, $275, $276, $277, $278, $279, $280, $281, $282, $283, $284, $285, $286, $287, $288, $289, $290, $291, $292, $293, $294, $295, $296))
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '5eed0004-0014-4000-8000-000000000000', $3 = '5eed0004-0014-4000-8000-000000000001', $4 = '5eed0004-0014-4000-8000-000000000002', $5 = '5eed0004-0014-4000-8000-000000000003', $6 = '5eed0004-0014-4000-8000-000000000004', $7 = '5eed0004-0014-4000-8000-000000000005', $8 = '5eed0004-0014-4000-8000-000000000006', $9 = '5eed0004-0014-4000-8000-000000000007', $10 = '5eed0004-0014-4000-8000-000000000008', $11 = '5eed0004-0014-4000-8000-000000000009', $12 = '5eed0004-0014-4000-8000-00000000000a', $13 = '5eed0004-0014-4000-8000-00000000 [… recortado: la línea tiene 13820 caracteres]
Index Scan using inventories_product_id_unique on inventories  (cost=0.29..31.30 rows=6 width=20) (actual time=1.706..1.864 rows=246.00 loops=1)
  Index Cond: (product_id = ANY ('{5eed0004-0014-4000-8000-000000000000,5eed0004-0014-4000-8000-000000000001,5eed0004-0014-4000-8000-000000000002,5eed0004-0014-4000-8000-000000000003,5eed0004-0014-4000-8000-000000000004,5eed0004-0014-4000-8000-000000000005,5eed0004-0014-4000-8000-000000000006,5eed0004-0014-4000-8000-000000000007,5eed0004-0014-4000-8000-000000000008,5eed0004-0014-4000-8000-000000000009,5eed0004-0014-4000-8000-00000000000a,5eed0004-0014-4000-8000-00000000000b,5eed0004-0014-4000-8000-00000000000c,5eed0004-0014-4000-8000-00000000000d,5eed0004-0014-4000-8000-00000000000e,5eed0004-0 [… recortado: la línea tiene 10961 caracteres]
  Filter: (organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid)
  Index Searches: 1
  Buffers: shared hit=7
```

## inventory.listProductStock (página profunda)

Resultado: 20/295 filas.

### Consulta 1 de 2

```text
duration: 0.879 ms  plan:
Query Text: select "id", "sku", "name", "description", "unit", "reorder_point", "brand", "category", "condition", "is_active", "created_at", "updated_at" from "products" where ("products"."organization_id" = $1 and "products"."is_active" = $2)
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = 't'
Index Scan using products_organization_sku_lower_unique on products  (cost=0.29..111.91 rows=285 width=172) (actual time=0.039..0.251 rows=295.00 loops=1)
  Index Cond: (organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid)
  Filter: is_active
  Rows Removed by Filter: 5
  Index Searches: 1
  Buffers: shared hit=11
```

### Consulta 2 de 2

```text
duration: 1.572 ms  plan:
Query Text: select "product_id", "quantity_on_hand" from "inventories" where ("inventories"."organization_id" = $1 and "inventories"."product_id" in ($2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51, $52, $53, $54, $55, $56, $57, $58, $59, $60, $61, $62, $63, $64, $65, $66, $67, $68, $69, $70, $71, $72, $73, $74, $75, $76, $77, $78, $79, $80, $81, $82, $83, $84, $85, $86, $87, $88, $89, $90, $91, $92, $93, $94, $95, $96, $97, $98, $99, $100, $101, $102, $103, $104, $105, $106, $107, $108, $109, $110, $111, $112, $113, $114, $115, $116, $117, $118, $119, $120, $121, $122, $123, $124, $125, $126, $127, $128, $129, $130, $131, $132, $133, $134, $135, $136, $137, $138, $139, $140, $141, $142, $143, $144, $145, $146, $147, $148, $149, $150, $151, $152, $153, $154, $155, $156, $157, $158, $159, $160, $161, $162, $163, $164, $165, $166, $167, $168, $169, $170, $171, $172, $173, $174, $175, $176, $177, $178, $179, $180, $181, $182, $183, $184, $185, $186, $187, $188, $189, $190, $191, $192, $193, $194, $195, $196, $197, $198, $199, $200, $201, $202, $203, $204, $205, $206, $207, $208, $209, $210, $211, $212, $213, $214, $215, $216, $217, $218, $219, $220, $221, $222, $223, $224, $225, $226, $227, $228, $229, $230, $231, $232, $233, $234, $235, $236, $237, $238, $239, $240, $241, $242, $243, $244, $245, $246, $247, $248, $249, $250, $251, $252, $253, $254, $255, $256, $257, $258, $259, $260, $261, $262, $263, $264, $265, $266, $267, $268, $269, $270, $271, $272, $273, $274, $275, $276, $277, $278, $279, $280, $281, $282, $283, $284, $285, $286, $287, $288, $289, $290, $291, $292, $293, $294, $295, $296))
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '5eed0004-0014-4000-8000-000000000000', $3 = '5eed0004-0014-4000-8000-000000000001', $4 = '5eed0004-0014-4000-8000-000000000002', $5 = '5eed0004-0014-4000-8000-000000000003', $6 = '5eed0004-0014-4000-8000-000000000004', $7 = '5eed0004-0014-4000-8000-000000000005', $8 = '5eed0004-0014-4000-8000-000000000006', $9 = '5eed0004-0014-4000-8000-000000000007', $10 = '5eed0004-0014-4000-8000-000000000008', $11 = '5eed0004-0014-4000-8000-000000000009', $12 = '5eed0004-0014-4000-8000-00000000000a', $13 = '5eed0004-0014-4000-8000-00000000 [… recortado: la línea tiene 13820 caracteres]
Index Scan using inventories_product_id_unique on inventories  (cost=0.29..31.30 rows=6 width=20) (actual time=0.089..0.254 rows=246.00 loops=1)
  Index Cond: (product_id = ANY ('{5eed0004-0014-4000-8000-000000000000,5eed0004-0014-4000-8000-000000000001,5eed0004-0014-4000-8000-000000000002,5eed0004-0014-4000-8000-000000000003,5eed0004-0014-4000-8000-000000000004,5eed0004-0014-4000-8000-000000000005,5eed0004-0014-4000-8000-000000000006,5eed0004-0014-4000-8000-000000000007,5eed0004-0014-4000-8000-000000000008,5eed0004-0014-4000-8000-000000000009,5eed0004-0014-4000-8000-00000000000a,5eed0004-0014-4000-8000-00000000000b,5eed0004-0014-4000-8000-00000000000c,5eed0004-0014-4000-8000-00000000000d,5eed0004-0014-4000-8000-00000000000e,5eed0004-0 [… recortado: la línea tiene 10961 caracteres]
  Filter: (organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid)
  Index Searches: 1
  Buffers: shared hit=7
```

## crm.searchClients (sin texto)

Resultado: 25/300 filas.

### Consulta 1 de 2

```text
duration: 0.177 ms  plan:
Query Text: select count(*) from "clients" where "clients"."organization_id" = $1
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021'
Aggregate  (cost=8.48..8.49 rows=1 width=8) (actual time=0.170..0.171 rows=1.00 loops=1)
  Buffers: shared hit=4
  ->  Index Only Scan using clients_organization_id_id_unique on clients  (cost=0.29..7.74 rows=300 width=0) (actual time=0.038..0.097 rows=300.00 loops=1)
        Index Cond: (organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid)
        Heap Fetches: 0
        Index Searches: 1
        Buffers: shared hit=4
```

### Consulta 2 de 2

```text
duration: 0.897 ms  plan:
Query Text: select "id", "display_name", "phone_e164", "notes", "is_active", "created_at", "updated_at" from "clients" where "clients"."organization_id" = $1 order by lower("clients"."display_name"), "clients"."id" asc limit $2
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '25'
Limit  (cost=102.11..102.18 rows=25 width=131) (actual time=0.829..0.838 rows=25.00 loops=1)
  Buffers: shared hit=9
  ->  Sort  (cost=102.11..102.86 rows=300 width=131) (actual time=0.826..0.830 rows=25.00 loops=1)
        Sort Key: (lower(display_name)), id
        Sort Method: top-N heapsort  Memory: 30kB
        Buffers: shared hit=9
        ->  Index Scan using clients_organization_id_id_unique on clients  (cost=0.29..93.65 rows=300 width=131) (actual time=0.064..0.526 rows=300.00 loops=1)
              Index Cond: (organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid)
              Index Searches: 1
              Buffers: shared hit=9
```

## crm.searchClients (página profunda)

Resultado: 25/300 filas.

### Consulta 1 de 2

```text
duration: 0.116 ms  plan:
Query Text: select count(*) from "clients" where "clients"."organization_id" = $1
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021'
Aggregate  (cost=8.48..8.49 rows=1 width=8) (actual time=0.110..0.111 rows=1.00 loops=1)
  Buffers: shared hit=4
  ->  Index Only Scan using clients_organization_id_id_unique on clients  (cost=0.29..7.74 rows=300 width=0) (actual time=0.039..0.081 rows=300.00 loops=1)
        Index Cond: (organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid)
        Heap Fetches: 0
        Index Searches: 1
        Buffers: shared hit=4
```

### Consulta 2 de 2

```text
duration: 1.237 ms  plan:
Query Text: select "id", "display_name", "phone_e164", "notes", "is_active", "created_at", "updated_at" from "clients" where "clients"."organization_id" = $1 order by lower("clients"."display_name"), "clients"."id" asc limit $2 offset $3
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '25', $3 = '275'
Limit  (cost=106.68..106.74 rows=25 width=131) (actual time=1.167..1.176 rows=25.00 loops=1)
  Buffers: shared hit=9
  ->  Sort  (cost=105.99..106.74 rows=300 width=131) (actual time=1.126..1.152 rows=300.00 loops=1)
        Sort Key: (lower(display_name)), id
        Sort Method: quicksort  Memory: 64kB
        Buffers: shared hit=9
        ->  Index Scan using clients_organization_id_id_unique on clients  (cost=0.29..93.65 rows=300 width=131) (actual time=0.048..0.617 rows=300.00 loops=1)
              Index Cond: (organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid)
              Index Searches: 1
              Buffers: shared hit=9
```

## crm.searchClients (prefijo de nombre)

Resultado: 25/26 filas.

### Consulta 1 de 4

```text
duration: 1.504 ms  plan:
Query Text:  SELECT public.unaccent('public.unaccent'::regdictionary, $1) 
Query Parameters: $1 = 'ana%'
Result  (cost=0.00..0.01 rows=1 width=32) (actual time=1.497..1.498 rows=1.00 loops=1)
  Buffers: shared hit=12
```

### Consulta 2 de 4

```text
duration: 0.250 ms  plan:
Query Text: select count(*) from "clients" where ("clients"."organization_id" = $1 and immutable_unaccent(lower("clients"."display_name")) like immutable_unaccent(lower($2)))
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = 'ana%'
Aggregate  (cost=24.63..24.64 rows=1 width=8) (actual time=0.246..0.247 rows=1.00 loops=1)
  Buffers: shared hit=22
  ->  Index Scan using clients_organization_display_name_unaccent_idx on clients  (cost=0.29..24.56 rows=28 width=0) (actual time=0.072..0.238 rows=26.00 loops=1)
        Index Cond: ((organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid) AND (immutable_unaccent(lower(display_name)) ~>=~ 'ana'::text) AND (immutable_unaccent(lower(display_name)) ~<~ 'anb'::text))
        Filter: (immutable_unaccent(lower(display_name)) ~~ 'ana%'::text)
        Index Searches: 1
        Buffers: shared hit=22
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
duration: 0.672 ms  plan:
Query Text: select "id", "display_name", "phone_e164", "notes", "is_active", "created_at", "updated_at" from "clients" where ("clients"."organization_id" = $1 and immutable_unaccent(lower("clients"."display_name")) like immutable_unaccent(lower($2))) order by lower("clients"."display_name"), "clients"."id" asc limit $3
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = 'ana%', $3 = '25'
Limit  (cost=25.31..25.37 rows=25 width=131) (actual time=0.600..0.611 rows=25.00 loops=1)
  Buffers: shared hit=22
  ->  Sort  (cost=25.31..25.38 rows=28 width=131) (actual time=0.598..0.602 rows=25.00 loops=1)
        Sort Key: (lower(display_name)), id
        Sort Method: quicksort  Memory: 28kB
        Buffers: shared hit=22
        ->  Index Scan using clients_organization_display_name_unaccent_idx on clients  (cost=0.29..24.63 rows=28 width=131) (actual time=0.406..0.559 rows=26.00 loops=1)
              Index Cond: ((organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid) AND (immutable_unaccent(lower(display_name)) ~>=~ 'ana'::text) AND (immutable_unaccent(lower(display_name)) ~<~ 'anb'::text))
              Filter: (immutable_unaccent(lower(display_name)) ~~ 'ana%'::text)
              Index Searches: 1
              Buffers: shared hit=22
```

## conversations.listConversations

Resultado: 25/301 filas.

### Consulta 1 de 5

```text
duration: 0.046 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.042..0.042 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.040..0.040 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0014-4000-8000-000000000021'::uuid)
        Rows Removed by Filter: 20
        Buffers: shared hit=1
```

### Consulta 2 de 5

```text
duration: 0.150 ms  plan:
Query Text: select count(*) from "conversations" where "conversations"."organization_id" = $1
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021'
Aggregate  (cost=8.50..8.51 rows=1 width=8) (actual time=0.147..0.148 rows=1.00 loops=1)
  Buffers: shared hit=5
  ->  Index Only Scan using conversations_organization_id_id_unique on conversations  (cost=0.29..7.75 rows=301 width=0) (actual time=0.032..0.099 rows=301.00 loops=1)
        Index Cond: (organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid)
        Heap Fetches: 20
        Index Searches: 1
        Buffers: shared hit=5
```

### Consulta 3 de 5

```text
duration: 0.188 ms  plan:
Query Text: select "id", "client_id", "channel", "status", "started_at", "last_message_at" from "conversations" where "conversations"."organization_id" = $1 order by "conversations"."last_message_at" desc nulls last, "conversations"."id" desc limit $2
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '25'
Limit  (cost=0.62..9.95 rows=25 width=56) (actual time=0.118..0.124 rows=25.00 loops=1)
  Buffers: shared hit=27
  ->  Incremental Sort  (cost=0.62..112.85 rows=301 width=56) (actual time=0.117..0.119 rows=25.00 loops=1)
        Sort Key: last_message_at DESC NULLS LAST, id DESC
        Presorted Key: last_message_at
        Full-sort Groups: 1  Sort Method: quicksort  Average Memory: 27kB  Peak Memory: 27kB
        Buffers: shared hit=27
        ->  Index Scan using conversations_organization_last_message_idx on conversations  (cost=0.29..99.31 rows=301 width=56) (actual time=0.023..0.047 rows=26.00 loops=1)
              Index Cond: (organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid)
              Index Searches: 1
              Buffers: shared hit=24
```

### Consulta 4 de 5

```text
duration: 0.135 ms  plan:
Query Text: select "id", "display_name", "phone_e164", "notes", "is_active", "created_at", "updated_at" from "clients" where ("clients"."organization_id" = $1 and "clients"."id" in ($2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19))
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '5eed0001-0014-4000-8000-000000000000', $3 = '5eed0001-0014-4000-8000-00000000002f', $4 = '5eed0001-0014-4000-8000-0000000000dc', $5 = '5eed0001-0014-4000-8000-000000000023', $6 = '5eed0001-0014-4000-8000-000000000016', $7 = '5eed0001-0014-4000-8000-000000000001', $8 = '5eed0001-0014-4000-8000-0000000000ef', $9 = '5eed0001-0014-4000-8000-000000000024', $10 = '5eed0001-0014-4000-8000-0000000000e9', $11 = '5eed0001-0014-4000-8000-0000000000a8', $12 = '5eed0001-0014-4000-8000-000000000076', $13 = '5eed0001-0014-4000-8000-0000000000e7', $14 = '5eed0001-0014-4000-8000-000000000020', $15 = '5eed0001-0014-4000-8000-000000000116', $16 = '5eed0001-0014-4000-8000-0000000000f8', $17 = '5eed0001-0014-4000-8000-00000000012b', $18 = '5eed0001-0014-4000-8000-00000000006f', $19 = '5eed0001-0014-4000-8000-0000000000c4'
Index Scan using clients_pkey on clients  (cost=0.29..24.20 rows=1 width=99) (actual time=0.068..0.107 rows=18.00 loops=1)
  Index Cond: (id = ANY ('{5eed0001-0014-4000-8000-000000000000,5eed0001-0014-4000-8000-00000000002f,5eed0001-0014-4000-8000-0000000000dc,5eed0001-0014-4000-8000-000000000023,5eed0001-0014-4000-8000-000000000016,5eed0001-0014-4000-8000-000000000001,5eed0001-0014-4000-8000-0000000000ef,5eed0001-0014-4000-8000-000000000024,5eed0001-0014-4000-8000-0000000000e9,5eed0001-0014-4000-8000-0000000000a8,5eed0001-0014-4000-8000-000000000076,5eed0001-0014-4000-8000-0000000000e7,5eed0001-0014-4000-8000-000000000020,5eed0001-0014-4000-8000-000000000116,5eed0001-0014-4000-8000-0000000000f8,5eed0001-0014-4000-8000-00000000012b,5eed0001-0014-4000-8000-00000000006f,5eed0001-0014-4000-8000-0000000000c4}'::uuid[]))
  Filter: (organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid)
  Index Searches: 2
  Buffers: shared hit=10
```

### Consulta 5 de 5

```text
duration: 3.062 ms  plan:
Query Text: select "conversation_id", count(*) from "messages" where ("messages"."organization_id" = $1 and "messages"."conversation_id" in ($2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)) group by "messages"."conversation_id"
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '5eed000b-0014-4000-8000-000000000000', $3 = '5eed0002-0014-4000-8000-0000000000e0', $4 = '5eed0002-0014-4000-8000-000000000097', $5 = '5eed0002-0014-4000-8000-000000000087', $6 = '5eed0002-0014-4000-8000-0000000000ad', $7 = '5eed0002-0014-4000-8000-000000000069', $8 = '5eed0002-0014-4000-8000-000000000056', $9 = '5eed0002-0014-4000-8000-000000000015', $10 = '5eed0002-0014-4000-8000-00000000009c', $11 = '5eed0002-0014-4000-8000-0000000000fb', $12 = '5eed0002-0014-4000-8000-00000000006a', $13 = '5eed0002-0014-4000-8000-00000000004a', $14 = '5eed0002-0014-4000-8000-000000000064', $15 = '5eed0002-0014-4000-8000-00000000009e', $16 = '5eed0002-0014-4000-8000-000000000060', $17 = '5eed0002-0014-4000-8000-000000000078', $18 = '5eed0002-0014-4000-8000-00000000007b', $19 = '5eed0002-0014-4000-8000-000000000107', $20 = '5eed0002-0014-4000-8000-0000000000ba', $21 = '5eed0002-0014-4000-8000-0000000000e5', $22 = '5eed0002-0014-4000-8000-000000000120', $23 = '5eed0002-0014-4000-8000-0000000000a4', $24 = '5eed0002-0014-4000-8000-000000000051', $25 = '5eed0002-0014-4000-8000-00000000010b', $26 = '5eed0002-0014-4000-8000-0000000000b6'
HashAggregate  (cost=415.57..418.10 rows=253 width=24) (actual time=3.012..3.022 rows=25.00 loops=1)
  Group Key: conversation_id
  Batches: 1  Memory Usage: 48kB
  Buffers: shared hit=189
  ->  Bitmap Heap Scan on messages  (cost=156.91..414.29 rows=255 width=16) (actual time=1.082..1.921 rows=4151.00 loops=1)
        Recheck Cond: ((conversation_id = ANY ('{5eed000b-0014-4000-8000-000000000000,5eed0002-0014-4000-8000-0000000000e0,5eed0002-0014-4000-8000-000000000097,5eed0002-0014-4000-8000-000000000087,5eed0002-0014-4000-8000-0000000000ad,5eed0002-0014-4000-8000-000000000069,5eed0002-0014-4000-8000-000000000056,5eed0002-0014-4000-8000-000000000015,5eed0002-0014-4000-8000-00000000009c,5eed0002-0014-4000-8000-0000000000fb,5eed0002-0014-4000-8000-00000000006a,5eed0002-0014-4000-8000-00000000004a,5eed0002-0014-4000-8000-000000000064,5eed0002-0014-4000-8000-00000000009e,5eed0002-0014-4000-8000-000000000060,5eed0002-0014-4000-8000-000000000078,5eed0002-0014-4000-8000-00000000007b,5eed0002-0014-4000-8000-000000000107,5eed0002-0014-4000-8000-0000000000ba,5eed0002-0014-4000-8000-0000000000e5,5eed0002-0014-4000-8000-000000000120,5eed0002-0014-4000-8000-0000000000a4,5eed0002-0014-4000-8000-000000000051,5eed0002-0014-4000-8000-00000000010b,5eed0002-0014-4000-8000-0000000000b6}'::uuid[])) AND (organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid))
        Heap Blocks: exact=96
        Buffers: shared hit=189
        ->  BitmapAnd  (cost=156.85..156.85 rows=255 width=0) (actual time=1.023..1.025 rows=0.00 loops=1)
              Buffers: shared hit=93
              ->  Bitmap Index Scan on messages_conversation_sent_idx  (cost=0.00..69.25 rows=4181 width=0) (actual time=0.550..0.550 rows=4151.00 loops=1)
                    Index Cond: (conversation_id = ANY ('{5eed000b-0014-4000-8000-000000000000,5eed0002-0014-4000-8000-0000000000e0,5eed0002-0014-4000-8000-000000000097,5eed0002-0014-4000-8000-000000000087,5eed0002-0014-4000-8000-0000000000ad,5eed0002-0014-4000-8000-000000000069,5eed0002-0014-4000-8000-000000000056,5eed0002-0014-4000-8000-000000000015,5eed0002-0014-4000-8000-00000000009c,5eed0002-0014-4000-8000-0000000000fb,5eed0002-0014-4000-8000-00000000006a,5eed0002-0014-4000-8000-00000000004a,5eed0002-0014-4000-8000-000000000064,5eed0002-0014-4000-8000-00000000009e,5eed0002-0014-4000-8000-000000000060,5eed0002-0014-4000-8000-000000000078,5eed0002-0014-4000-8000-00000000007b,5eed0002-0014-4000-8000-000000000107,5eed0002-0014-4000-8000-0000000000ba,5eed0002-0014-4000-8000-0000000000e5,5eed0002-0014-4000-8000-000000000120,5eed0002-0014-4000-8000-0000000000a4,5eed0002-0014-4000-8000-000000000051,5eed0002-0014-4000-8000-00000000010b,5eed0002-0014-4000-8000-0000000000b6}'::uuid[]))
                    Index Searches: 9
                    Buffers: shared hit=47
              ->  Bitmap Index Scan on messages_organization_sent_idx  (cost=0.00..87.22 rows=5854 width=0) (actual time=0.463..0.463 rows=5916.00 loops=1)
                    Index Cond: (organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid)
                    Index Searches: 1
                    Buffers: shared hit=46
```

## conversations.searchClientsByLastInteraction

Resultado: 25/300 filas.

### Consulta 1 de 4

```text
duration: 2.084 ms  plan:
Query Text: select "id" from "clients" where "clients"."organization_id" = $1 order by lower("clients"."display_name"), "clients"."id" asc
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021'
Sort  (cost=105.99..106.74 rows=300 width=48) (actual time=1.201..1.234 rows=300.00 loops=1)
  Sort Key: (lower(display_name)), id
  Sort Method: quicksort  Memory: 40kB
  Buffers: shared hit=15
  ->  Index Scan using clients_organization_id_id_unique on clients  (cost=0.29..93.65 rows=300 width=48) (actual time=0.091..0.594 rows=300.00 loops=1)
        Index Cond: (organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid)
        Index Searches: 1
        Buffers: shared hit=9
```

### Consulta 2 de 4

```text
duration: 1.011 ms  plan:
Query Text: select "client_id", max("last_message_at") from "conversations" where ("conversations"."organization_id" = $1 and "conversations"."client_id" is not null and "conversations"."last_message_at" is not null) group by "conversations"."client_id"
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021'
GroupAggregate  (cost=0.29..12.60 rows=239 width=24) (actual time=0.142..0.317 rows=165.00 loops=1)
  Group Key: client_id
  Buffers: shared hit=8
  ->  Index Only Scan using conversations_organization_client_last_message_idx on conversations  (cost=0.29..9.01 rows=241 width=24) (actual time=0.130..0.194 rows=237.00 loops=1)
        Index Cond: ((organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid) AND (client_id IS NOT NULL) AND (last_message_at IS NOT NULL))
        Heap Fetches: 15
        Index Searches: 1
        Buffers: shared hit=8
```

### Consulta 3 de 4

```text
duration: 0.134 ms  plan:
Query Text: select "id", "display_name", "phone_e164", "notes", "is_active", "created_at", "updated_at" from "clients" where ("clients"."organization_id" = $1 and "clients"."id" in ($2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26))
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '5eed0001-0014-4000-8000-000000000000', $3 = '5eed0001-0014-4000-8000-00000000002f', $4 = '5eed0001-0014-4000-8000-0000000000dc', $5 = '5eed0001-0014-4000-8000-000000000023', $6 = '5eed0001-0014-4000-8000-000000000016', $7 = '5eed0001-0014-4000-8000-000000000001', $8 = '5eed0001-0014-4000-8000-0000000000ef', $9 = '5eed0001-0014-4000-8000-000000000024', $10 = '5eed0001-0014-4000-8000-0000000000e9', $11 = '5eed0001-0014-4000-8000-0000000000a8', $12 = '5eed0001-0014-4000-8000-000000000076', $13 = '5eed0001-0014-4000-8000-0000000000e7', $14 = '5eed0001-0014-4000-8000-000000000020', $15 = '5eed0001-0014-4000-8000-000000000116', $16 = '5eed0001-0014-4000-8000-0000000000f8', $17 = '5eed0001-0014-4000-8000-00000000012b', $18 = '5eed0001-0014-4000-8000-00000000006f', $19 = '5eed0001-0014-4000-8000-0000000000c4', $20 = '5eed0001-0014-4000-8000-000000000120', $21 = '5eed0001-0014-4000-8000-0000000000be', $22 = '5eed0001-0014-4000-8000-0000000000ae', $23 = '5eed0001-0014-4000-8000-000000000005', $24 = '5eed0001-0014-4000-8000-00000000000c', $25 = '5eed0001-0014-4000-8000-0000000000f4', $26 = '5eed0001-0014-4000-8000-0000000000ed'
Index Scan using clients_pkey on clients  (cost=0.29..25.68 rows=1 width=99) (actual time=0.042..0.101 rows=25.00 loops=1)
  Index Cond: (id = ANY ('{5eed0001-0014-4000-8000-000000000000,5eed0001-0014-4000-8000-00000000002f,5eed0001-0014-4000-8000-0000000000dc,5eed0001-0014-4000-8000-000000000023,5eed0001-0014-4000-8000-000000000016,5eed0001-0014-4000-8000-000000000001,5eed0001-0014-4000-8000-0000000000ef,5eed0001-0014-4000-8000-000000000024,5eed0001-0014-4000-8000-0000000000e9,5eed0001-0014-4000-8000-0000000000a8,5eed0001-0014-4000-8000-000000000076,5eed0001-0014-4000-8000-0000000000e7,5eed0001-0014-4000-8000-000000000020,5eed0001-0014-4000-8000-000000000116,5eed0001-0014-4000-8000-0000000000f8,5eed0001-0014-4000-8000-00000000012b,5eed0001-0014-4000-8000-00000000006f,5eed0001-0014-4000-8000-0000000000c4,5eed0001-0014-4000-8000-000000000120,5eed0001-0014-4000-8000-0000000000be,5eed0001-0014-4000-8000-0000000000ae,5eed0001-0014-4000-8000-000000000005,5eed0001-0014-4000-8000-00000000000c,5eed0001-0014-4000-8000-0000000000f4,5eed0001-0014-4000-8000-0000000000ed}'::uuid[]))
  Filter: (organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid)
  Index Searches: 2
  Buffers: shared hit=10
```

### Consulta 4 de 4

```text
duration: 0.024 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.020..0.021 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.018..0.019 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0014-4000-8000-000000000021'::uuid)
        Rows Removed by Filter: 20
        Buffers: shared hit=1
```

## organizations.listMembers

Resultado: 6/6 filas.

### Consulta 1 de 2

```text
duration: 0.082 ms  plan:
Query Text: select "id", "user_id", "role", "created_at" from "organization_members" where "organization_members"."organization_id" = $1
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021'
Index Scan using organization_members_organization_id_idx on organization_members  (cost=0.15..2.45 rows=6 width=44) (actual time=0.020..0.024 rows=6.00 loops=1)
  Index Cond: (organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid)
  Index Searches: 1
  Buffers: shared hit=2
```

### Consulta 2 de 2

```text
duration: 0.075 ms  plan:
Query Text: select "id", "name", "email", "is_active" from "users" where "users"."id" in ($1, $2, $3, $4, $5, $6)
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000022', $2 = '5eed0007-0014-4000-8000-000000000000', $3 = '5eed0007-0014-4000-8000-000000000001', $4 = '5eed0007-0014-4000-8000-000000000002', $5 = '5eed0007-0014-4000-8000-000000000003', $6 = '5eed0007-0014-4000-8000-000000000004'
Index Scan using users_pkey on users  (cost=0.28..5.28 rows=6 width=62) (actual time=0.042..0.065 rows=6.00 loops=1)
  Index Cond: (id = ANY ('{5eed0000-0014-4000-8000-000000000022,5eed0007-0014-4000-8000-000000000000,5eed0007-0014-4000-8000-000000000001,5eed0007-0014-4000-8000-000000000002,5eed0007-0014-4000-8000-000000000003,5eed0007-0014-4000-8000-000000000004}'::uuid[]))
  Index Searches: 2
  Buffers: shared hit=5
```

## inventory.listProductStock (última página)

Resultado: 20/295 filas.

### Consulta 1 de 2

```text
duration: 1.913 ms  plan:
Query Text: select "id", "sku", "name", "description", "unit", "reorder_point", "brand", "category", "condition", "is_active", "created_at", "updated_at" from "products" where ("products"."organization_id" = $1 and "products"."is_active" = $2)
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = 't'
Index Scan using products_organization_sku_lower_unique on products  (cost=0.29..111.91 rows=285 width=172) (actual time=0.039..1.308 rows=295.00 loops=1)
  Index Cond: (organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid)
  Filter: is_active
  Rows Removed by Filter: 5
  Index Searches: 1
  Buffers: shared hit=11
```

### Consulta 2 de 2

```text
duration: 0.962 ms  plan:
Query Text: select "product_id", "quantity_on_hand" from "inventories" where ("inventories"."organization_id" = $1 and "inventories"."product_id" in ($2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51, $52, $53, $54, $55, $56, $57, $58, $59, $60, $61, $62, $63, $64, $65, $66, $67, $68, $69, $70, $71, $72, $73, $74, $75, $76, $77, $78, $79, $80, $81, $82, $83, $84, $85, $86, $87, $88, $89, $90, $91, $92, $93, $94, $95, $96, $97, $98, $99, $100, $101, $102, $103, $104, $105, $106, $107, $108, $109, $110, $111, $112, $113, $114, $115, $116, $117, $118, $119, $120, $121, $122, $123, $124, $125, $126, $127, $128, $129, $130, $131, $132, $133, $134, $135, $136, $137, $138, $139, $140, $141, $142, $143, $144, $145, $146, $147, $148, $149, $150, $151, $152, $153, $154, $155, $156, $157, $158, $159, $160, $161, $162, $163, $164, $165, $166, $167, $168, $169, $170, $171, $172, $173, $174, $175, $176, $177, $178, $179, $180, $181, $182, $183, $184, $185, $186, $187, $188, $189, $190, $191, $192, $193, $194, $195, $196, $197, $198, $199, $200, $201, $202, $203, $204, $205, $206, $207, $208, $209, $210, $211, $212, $213, $214, $215, $216, $217, $218, $219, $220, $221, $222, $223, $224, $225, $226, $227, $228, $229, $230, $231, $232, $233, $234, $235, $236, $237, $238, $239, $240, $241, $242, $243, $244, $245, $246, $247, $248, $249, $250, $251, $252, $253, $254, $255, $256, $257, $258, $259, $260, $261, $262, $263, $264, $265, $266, $267, $268, $269, $270, $271, $272, $273, $274, $275, $276, $277, $278, $279, $280, $281, $282, $283, $284, $285, $286, $287, $288, $289, $290, $291, $292, $293, $294, $295, $296))
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '5eed0004-0014-4000-8000-000000000000', $3 = '5eed0004-0014-4000-8000-000000000001', $4 = '5eed0004-0014-4000-8000-000000000002', $5 = '5eed0004-0014-4000-8000-000000000003', $6 = '5eed0004-0014-4000-8000-000000000004', $7 = '5eed0004-0014-4000-8000-000000000005', $8 = '5eed0004-0014-4000-8000-000000000006', $9 = '5eed0004-0014-4000-8000-000000000007', $10 = '5eed0004-0014-4000-8000-000000000008', $11 = '5eed0004-0014-4000-8000-000000000009', $12 = '5eed0004-0014-4000-8000-00000000000a', $13 = '5eed0004-0014-4000-8000-00000000 [… recortado: la línea tiene 13820 caracteres]
Index Scan using inventories_product_id_unique on inventories  (cost=0.29..31.30 rows=6 width=20) (actual time=0.076..0.210 rows=246.00 loops=1)
  Index Cond: (product_id = ANY ('{5eed0004-0014-4000-8000-000000000000,5eed0004-0014-4000-8000-000000000001,5eed0004-0014-4000-8000-000000000002,5eed0004-0014-4000-8000-000000000003,5eed0004-0014-4000-8000-000000000004,5eed0004-0014-4000-8000-000000000005,5eed0004-0014-4000-8000-000000000006,5eed0004-0014-4000-8000-000000000007,5eed0004-0014-4000-8000-000000000008,5eed0004-0014-4000-8000-000000000009,5eed0004-0014-4000-8000-00000000000a,5eed0004-0014-4000-8000-00000000000b,5eed0004-0014-4000-8000-00000000000c,5eed0004-0014-4000-8000-00000000000d,5eed0004-0014-4000-8000-00000000000e,5eed0004-0 [… recortado: la línea tiene 10961 caracteres]
  Filter: (organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid)
  Index Searches: 1
  Buffers: shared hit=7
```

## crm.searchClients (última página)

Resultado: 25/300 filas.

### Consulta 1 de 2

```text
duration: 0.160 ms  plan:
Query Text: select count(*) from "clients" where "clients"."organization_id" = $1
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021'
Aggregate  (cost=8.48..8.49 rows=1 width=8) (actual time=0.155..0.155 rows=1.00 loops=1)
  Buffers: shared hit=4
  ->  Index Only Scan using clients_organization_id_id_unique on clients  (cost=0.29..7.74 rows=300 width=0) (actual time=0.037..0.118 rows=300.00 loops=1)
        Index Cond: (organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid)
        Heap Fetches: 0
        Index Searches: 1
        Buffers: shared hit=4
```

### Consulta 2 de 2

```text
duration: 1.413 ms  plan:
Query Text: select "id", "display_name", "phone_e164", "notes", "is_active", "created_at", "updated_at" from "clients" where "clients"."organization_id" = $1 order by lower("clients"."display_name"), "clients"."id" asc limit $2 offset $3
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '25', $3 = '275'
Limit  (cost=106.68..106.74 rows=25 width=131) (actual time=1.349..1.357 rows=25.00 loops=1)
  Buffers: shared hit=9
  ->  Sort  (cost=105.99..106.74 rows=300 width=131) (actual time=1.308..1.334 rows=300.00 loops=1)
        Sort Key: (lower(display_name)), id
        Sort Method: quicksort  Memory: 64kB
        Buffers: shared hit=9
        ->  Index Scan using clients_organization_id_id_unique on clients  (cost=0.29..93.65 rows=300 width=131) (actual time=0.050..0.708 rows=300.00 loops=1)
              Index Cond: (organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid)
              Index Searches: 1
              Buffers: shared hit=9
```

## conversations.listConversations (última página)

Resultado: 1/301 filas.

### Consulta 1 de 5

```text
duration: 0.027 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.023..0.024 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.021..0.022 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0014-4000-8000-000000000021'::uuid)
        Rows Removed by Filter: 20
        Buffers: shared hit=1
```

### Consulta 2 de 5

```text
duration: 0.134 ms  plan:
Query Text: select count(*) from "conversations" where "conversations"."organization_id" = $1
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021'
Aggregate  (cost=8.50..8.51 rows=1 width=8) (actual time=0.130..0.131 rows=1.00 loops=1)
  Buffers: shared hit=5
  ->  Index Only Scan using conversations_organization_id_id_unique on conversations  (cost=0.29..7.75 rows=301 width=0) (actual time=0.039..0.096 rows=301.00 loops=1)
        Index Cond: (organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid)
        Heap Fetches: 20
        Index Searches: 1
        Buffers: shared hit=5
```

### Consulta 3 de 5

```text
duration: 0.374 ms  plan:
Query Text: select "id", "client_id", "channel", "status", "started_at", "last_message_at" from "conversations" where "conversations"."organization_id" = $1 order by "conversations"."last_message_at" desc nulls last, "conversations"."id" desc limit $2 offset $3
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '25', $3 = '300'
Limit  (cost=111.35..111.35 rows=1 width=56) (actual time=0.356..0.357 rows=1.00 loops=1)
  Buffers: shared hit=9
  ->  Sort  (cost=110.60..111.35 rows=301 width=56) (actual time=0.300..0.331 rows=301.00 loops=1)
        Sort Key: last_message_at DESC NULLS LAST, id DESC
        Sort Method: quicksort  Memory: 60kB
        Buffers: shared hit=9
        ->  Index Scan using conversations_organization_id_id_unique on conversations  (cost=0.29..98.21 rows=301 width=56) (actual time=0.036..0.178 rows=301.00 loops=1)
              Index Cond: (organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid)
              Index Searches: 1
              Buffers: shared hit=9
```

### Consulta 4 de 5

```text
duration: 0.048 ms  plan:
Query Text: select "id", "display_name", "phone_e164", "notes", "is_active", "created_at", "updated_at" from "clients" where ("clients"."organization_id" = $1 and "clients"."id" in ($2))
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '5eed0001-0014-4000-8000-000000000015'
Index Scan using clients_organization_id_id_unique on clients  (cost=0.29..2.50 rows=1 width=99) (actual time=0.034..0.035 rows=1.00 loops=1)
  Index Cond: ((organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid) AND (id = '5eed0001-0014-4000-8000-000000000015'::uuid))
  Index Searches: 1
  Buffers: shared hit=3
```

### Consulta 5 de 5

```text
duration: 0.043 ms  plan:
Query Text: select "conversation_id", count(*) from "messages" where ("messages"."organization_id" = $1 and "messages"."conversation_id" in ($2)) group by "messages"."conversation_id"
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '5eed0002-0014-4000-8000-000000000050'
GroupAggregate  (cost=0.42..5.66 rows=1 width=24) (actual time=0.038..0.039 rows=1.00 loops=1)
  Buffers: shared hit=4
  ->  Index Scan using messages_conversation_sent_idx on messages  (cost=0.42..5.65 rows=1 width=16) (actual time=0.032..0.033 rows=1.00 loops=1)
        Index Cond: (conversation_id = '5eed0002-0014-4000-8000-000000000050'::uuid)
        Filter: (organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid)
        Index Searches: 1
        Buffers: shared hit=4
```

## conversations.searchClientsByLastInteraction (última página)

Resultado: 25/300 filas.

### Consulta 1 de 4

```text
duration: 2.058 ms  plan:
Query Text: select "id" from "clients" where "clients"."organization_id" = $1 order by lower("clients"."display_name"), "clients"."id" asc
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021'
Sort  (cost=105.99..106.74 rows=300 width=48) (actual time=1.136..1.173 rows=300.00 loops=1)
  Sort Key: (lower(display_name)), id
  Sort Method: quicksort  Memory: 40kB
  Buffers: shared hit=9
  ->  Index Scan using clients_organization_id_id_unique on clients  (cost=0.29..93.65 rows=300 width=48) (actual time=0.050..0.528 rows=300.00 loops=1)
        Index Cond: (organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid)
        Index Searches: 1
        Buffers: shared hit=9
```

### Consulta 2 de 4

```text
duration: 1.314 ms  plan:
Query Text: select "client_id", max("last_message_at") from "conversations" where ("conversations"."organization_id" = $1 and "conversations"."client_id" is not null and "conversations"."last_message_at" is not null) group by "conversations"."client_id"
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021'
GroupAggregate  (cost=0.29..12.60 rows=239 width=24) (actual time=0.073..1.097 rows=165.00 loops=1)
  Group Key: client_id
  Buffers: shared hit=5
  ->  Index Only Scan using conversations_organization_client_last_message_idx on conversations  (cost=0.29..9.01 rows=241 width=24) (actual time=0.064..0.142 rows=237.00 loops=1)
        Index Cond: ((organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid) AND (client_id IS NOT NULL) AND (last_message_at IS NOT NULL))
        Heap Fetches: 15
        Index Searches: 1
        Buffers: shared hit=5
```

### Consulta 3 de 4

```text
duration: 0.116 ms  plan:
Query Text: select "id", "display_name", "phone_e164", "notes", "is_active", "created_at", "updated_at" from "clients" where ("clients"."organization_id" = $1 and "clients"."id" in ($2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26))
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '5eed0001-0014-4000-8000-0000000000b7', $3 = '5eed0001-0014-4000-8000-000000000123', $4 = '5eed0001-0014-4000-8000-0000000000fa', $5 = '5eed0001-0014-4000-8000-000000000029', $6 = '5eed0001-0014-4000-8000-0000000000bf', $7 = '5eed0001-0014-4000-8000-00000000010c', $8 = '5eed0001-0014-4000-8000-00000000003a', $9 = '5eed0001-0014-4000-8000-0000000000fb', $10 = '5eed0001-0014-4000-8000-000000000100', $11 = '5eed0001-0014-4000-8000-00000000006e', $12 = '5eed0001-0014-4000-8000-0000000000d0', $13 = '5eed0001-0014-4000-8000-000000000039', $14 = '5eed0001-0014-4000-8000-0000000000c3', $15 = '5eed0001-0014-4000-8000-000000000060', $16 = '5eed0001-0014-4000-8000-00000000011c', $17 = '5eed0001-0014-4000-8000-000000000127', $18 = '5eed0001-0014-4000-8000-000000000075', $19 = '5eed0001-0014-4000-8000-000000000036', $20 = '5eed0001-0014-4000-8000-00000000000f', $21 = '5eed0001-0014-4000-8000-0000000000af', $22 = '5eed0001-0014-4000-8000-0000000000b4', $23 = '5eed0001-0014-4000-8000-00000000005d', $24 = '5eed0001-0014-4000-8000-00000000005f', $25 = '5eed0001-0014-4000-8000-000000000073', $26 = '5eed0001-0014-4000-8000-0000000000b2'
Index Scan using clients_pkey on clients  (cost=0.29..25.68 rows=1 width=99) (actual time=0.037..0.079 rows=25.00 loops=1)
  Index Cond: (id = ANY ('{5eed0001-0014-4000-8000-0000000000b7,5eed0001-0014-4000-8000-000000000123,5eed0001-0014-4000-8000-0000000000fa,5eed0001-0014-4000-8000-000000000029,5eed0001-0014-4000-8000-0000000000bf,5eed0001-0014-4000-8000-00000000010c,5eed0001-0014-4000-8000-00000000003a,5eed0001-0014-4000-8000-0000000000fb,5eed0001-0014-4000-8000-000000000100,5eed0001-0014-4000-8000-00000000006e,5eed0001-0014-4000-8000-0000000000d0,5eed0001-0014-4000-8000-000000000039,5eed0001-0014-4000-8000-0000000000c3,5eed0001-0014-4000-8000-000000000060,5eed0001-0014-4000-8000-00000000011c,5eed0001-0014-4000-8000-000000000127,5eed0001-0014-4000-8000-000000000075,5eed0001-0014-4000-8000-000000000036,5eed0001-0014-4000-8000-00000000000f,5eed0001-0014-4000-8000-0000000000af,5eed0001-0014-4000-8000-0000000000b4,5eed0001-0014-4000-8000-00000000005d,5eed0001-0014-4000-8000-00000000005f,5eed0001-0014-4000-8000-000000000073,5eed0001-0014-4000-8000-0000000000b2}'::uuid[]))
  Filter: (organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid)
  Index Searches: 2
  Buffers: shared hit=9
```

### Consulta 4 de 4

```text
duration: 0.026 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.022..0.022 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.020..0.020 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0014-4000-8000-000000000021'::uuid)
        Rows Removed by Filter: 20
        Buffers: shared hit=1
```

## organizations.listMembers (última página)

Resultado: 6/6 filas.

### Consulta 1 de 2

```text
duration: 0.043 ms  plan:
Query Text: select "id", "user_id", "role", "created_at" from "organization_members" where "organization_members"."organization_id" = $1
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021'
Index Scan using organization_members_organization_id_idx on organization_members  (cost=0.15..2.45 rows=6 width=44) (actual time=0.025..0.029 rows=6.00 loops=1)
  Index Cond: (organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid)
  Index Searches: 1
  Buffers: shared hit=2
```

### Consulta 2 de 2

```text
duration: 0.048 ms  plan:
Query Text: select "id", "name", "email", "is_active" from "users" where "users"."id" in ($1, $2, $3, $4, $5, $6)
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000022', $2 = '5eed0007-0014-4000-8000-000000000000', $3 = '5eed0007-0014-4000-8000-000000000001', $4 = '5eed0007-0014-4000-8000-000000000002', $5 = '5eed0007-0014-4000-8000-000000000003', $6 = '5eed0007-0014-4000-8000-000000000004'
Index Scan using users_pkey on users  (cost=0.28..5.28 rows=6 width=62) (actual time=0.032..0.040 rows=6.00 loops=1)
  Index Cond: (id = ANY ('{5eed0000-0014-4000-8000-000000000022,5eed0007-0014-4000-8000-000000000000,5eed0007-0014-4000-8000-000000000001,5eed0007-0014-4000-8000-000000000002,5eed0007-0014-4000-8000-000000000003,5eed0007-0014-4000-8000-000000000004}'::uuid[]))
  Index Searches: 2
  Buffers: shared hit=5
```

## inventory.listStockMovements (producto con 6, última página)

Resultado: 6/6 filas.

### Consulta 1 de 6

```text
duration: 0.053 ms  plan:
Query Text: select "id", "sku", "name", "description", "unit", "reorder_point", "brand", "category", "condition", "is_active", "created_at", "updated_at" from "products" where ("products"."organization_id" = $1 and "products"."id" = $2) limit $3
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '5eed0004-0014-4000-8000-000000000005', $3 = '1'
Limit  (cost=0.29..2.50 rows=1 width=172) (actual time=0.036..0.037 rows=1.00 loops=1)
  Buffers: shared hit=3
  ->  Index Scan using products_organization_id_id_unique on products  (cost=0.29..2.50 rows=1 width=172) (actual time=0.034..0.035 rows=1.00 loops=1)
        Index Cond: ((organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid) AND (id = '5eed0004-0014-4000-8000-000000000005'::uuid))
        Index Searches: 1
        Buffers: shared hit=3
```

### Consulta 2 de 6

```text
duration: 0.027 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.023..0.024 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.021..0.022 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0014-4000-8000-000000000021'::uuid)
        Rows Removed by Filter: 20
        Buffers: shared hit=1
```

### Consulta 3 de 6

```text
duration: 0.044 ms  plan:
Query Text: select count(*) from "inventory_movements" where ("inventory_movements"."organization_id" = $1 and "inventory_movements"."product_id" = $2)
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '5eed0004-0014-4000-8000-000000000005'
Aggregate  (cost=1.54..1.55 rows=1 width=8) (actual time=0.039..0.040 rows=1.00 loops=1)
  Buffers: shared hit=4
  ->  Index Only Scan using inventory_movements_product_history_idx on inventory_movements  (cost=0.41..1.54 rows=1 width=0) (actual time=0.030..0.032 rows=6.00 loops=1)
        Index Cond: ((organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid) AND (product_id = '5eed0004-0014-4000-8000-000000000005'::uuid))
        Heap Fetches: 0
        Index Searches: 1
        Buffers: shared hit=4
```

### Consulta 4 de 6

```text
duration: 0.075 ms  plan:
Query Text: select "id", "type", "quantity", "balance_after", "reason", "created_by", "created_at" from "inventory_movements" where ("inventory_movements"."organization_id" = $1 and "inventory_movements"."product_id" = $2) order by "inventory_movements"."created_at" desc, "inventory_movements"."id" desc limit $3
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '5eed0004-0014-4000-8000-000000000005', $3 = '25'
Limit  (cost=2.64..2.65 rows=1 width=70) (actual time=0.053..0.055 rows=6.00 loops=1)
  Buffers: shared hit=4
  ->  Sort  (cost=2.64..2.65 rows=1 width=70) (actual time=0.052..0.053 rows=6.00 loops=1)
        Sort Key: created_at DESC, id DESC
        Sort Method: quicksort  Memory: 25kB
        Buffers: shared hit=4
        ->  Index Scan using inventory_movements_product_history_idx on inventory_movements  (cost=0.41..2.63 rows=1 width=70) (actual time=0.035..0.039 rows=6.00 loops=1)
              Index Cond: ((organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid) AND (product_id = '5eed0004-0014-4000-8000-000000000005'::uuid))
              Index Searches: 1
              Buffers: shared hit=4
```

### Consulta 5 de 6

```text
duration: 0.032 ms  plan:
Query Text: select "user_id" from "organization_members" where ("organization_members"."organization_id" = $1 and "organization_members"."user_id" in ($2))
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '5eed0000-0014-4000-8000-000000000022'
Index Scan using organization_members_organization_id_idx on organization_members  (cost=0.15..2.47 rows=1 width=16) (actual time=0.025..0.028 rows=1.00 loops=1)
  Index Cond: (organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid)
  Filter: (user_id = '5eed0000-0014-4000-8000-000000000022'::uuid)
  Rows Removed by Filter: 5
  Index Searches: 1
  Buffers: shared hit=2
```

### Consulta 6 de 6

```text
duration: 0.037 ms  plan:
Query Text: select "id", "name", "email", "is_active" from "users" where "users"."id" in ($1)
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000022'
Index Scan using users_pkey on users  (cost=0.28..2.49 rows=1 width=62) (actual time=0.030..0.031 rows=1.00 loops=1)
  Index Cond: (id = '5eed0000-0014-4000-8000-000000000022'::uuid)
  Index Searches: 1
  Buffers: shared hit=3
```

## inventory.listStockMovements (producto con 6)

Resultado: 6/6 filas.

### Consulta 1 de 6

```text
duration: 0.047 ms  plan:
Query Text: select "id", "sku", "name", "description", "unit", "reorder_point", "brand", "category", "condition", "is_active", "created_at", "updated_at" from "products" where ("products"."organization_id" = $1 and "products"."id" = $2) limit $3
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '5eed0004-0014-4000-8000-000000000005', $3 = '1'
Limit  (cost=0.29..2.50 rows=1 width=172) (actual time=0.032..0.033 rows=1.00 loops=1)
  Buffers: shared hit=3
  ->  Index Scan using products_organization_id_id_unique on products  (cost=0.29..2.50 rows=1 width=172) (actual time=0.031..0.031 rows=1.00 loops=1)
        Index Cond: ((organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid) AND (id = '5eed0004-0014-4000-8000-000000000005'::uuid))
        Index Searches: 1
        Buffers: shared hit=3
```

### Consulta 2 de 6

```text
duration: 0.026 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.022..0.023 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.020..0.020 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0014-4000-8000-000000000021'::uuid)
        Rows Removed by Filter: 20
        Buffers: shared hit=1
```

### Consulta 3 de 6

```text
duration: 0.043 ms  plan:
Query Text: select count(*) from "inventory_movements" where ("inventory_movements"."organization_id" = $1 and "inventory_movements"."product_id" = $2)
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '5eed0004-0014-4000-8000-000000000005'
Aggregate  (cost=1.54..1.55 rows=1 width=8) (actual time=0.039..0.040 rows=1.00 loops=1)
  Buffers: shared hit=4
  ->  Index Only Scan using inventory_movements_product_history_idx on inventory_movements  (cost=0.41..1.54 rows=1 width=0) (actual time=0.030..0.032 rows=6.00 loops=1)
        Index Cond: ((organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid) AND (product_id = '5eed0004-0014-4000-8000-000000000005'::uuid))
        Heap Fetches: 0
        Index Searches: 1
        Buffers: shared hit=4
```

### Consulta 4 de 6

```text
duration: 0.072 ms  plan:
Query Text: select "id", "type", "quantity", "balance_after", "reason", "created_by", "created_at" from "inventory_movements" where ("inventory_movements"."organization_id" = $1 and "inventory_movements"."product_id" = $2) order by "inventory_movements"."created_at" desc, "inventory_movements"."id" desc limit $3
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '5eed0004-0014-4000-8000-000000000005', $3 = '25'
Limit  (cost=2.64..2.65 rows=1 width=70) (actual time=0.049..0.051 rows=6.00 loops=1)
  Buffers: shared hit=4
  ->  Sort  (cost=2.64..2.65 rows=1 width=70) (actual time=0.048..0.049 rows=6.00 loops=1)
        Sort Key: created_at DESC, id DESC
        Sort Method: quicksort  Memory: 25kB
        Buffers: shared hit=4
        ->  Index Scan using inventory_movements_product_history_idx on inventory_movements  (cost=0.41..2.63 rows=1 width=70) (actual time=0.031..0.035 rows=6.00 loops=1)
              Index Cond: ((organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid) AND (product_id = '5eed0004-0014-4000-8000-000000000005'::uuid))
              Index Searches: 1
              Buffers: shared hit=4
```

### Consulta 5 de 6

```text
duration: 0.034 ms  plan:
Query Text: select "user_id" from "organization_members" where ("organization_members"."organization_id" = $1 and "organization_members"."user_id" in ($2))
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '5eed0000-0014-4000-8000-000000000022'
Index Scan using organization_members_organization_id_idx on organization_members  (cost=0.15..2.47 rows=1 width=16) (actual time=0.026..0.030 rows=1.00 loops=1)
  Index Cond: (organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid)
  Filter: (user_id = '5eed0000-0014-4000-8000-000000000022'::uuid)
  Rows Removed by Filter: 5
  Index Searches: 1
  Buffers: shared hit=2
```

### Consulta 6 de 6

```text
duration: 0.037 ms  plan:
Query Text: select "id", "name", "email", "is_active" from "users" where "users"."id" in ($1)
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000022'
Index Scan using users_pkey on users  (cost=0.28..2.49 rows=1 width=62) (actual time=0.030..0.031 rows=1.00 loops=1)
  Index Cond: (id = '5eed0000-0014-4000-8000-000000000022'::uuid)
  Index Searches: 1
  Buffers: shared hit=3
```

## API products: palabras («cafe molido»)

Resultado: 4 filas.

### Consulta 1 de 5

```text
duration: 0.009 ms  plan:
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
duration: 1.827 ms  plan:
Query Text: select "id", "sku", "name", "description", "unit", "reorder_point", "brand", "category", "condition", "is_active", "created_at", "updated_at" from "products" where ("products"."organization_id" = $1 and "products"."is_active" = $2 and ("products"."search" @@ (select string_agg('''' || replace(replace(l.lexeme, '\', '\\'), '''', '''''') || ''':*', ' & ')::tsquery
    from unnest(to_tsvector('simple', immutable_unaccent(lower($3)))) l) or lower("products"."sku") = lower($4))) order by lower("products"."sku") = lower($5) desc, coalesce(ts_rank("products"."search", (select string_agg('''' || replace(replace(l.lexeme, '\', '\\'), '''', '''''') || ''':*', ' & ')::tsquery
    from unnest(to_tsvector('simple', immutable_unaccent(lower($6)))) l)), 0) desc, "products"."name", "products"."id" limit $7
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = 't', $3 = 'cafe molido', $4 = 'cafe molido', $5 = 'cafe molido', $6 = 'cafe molido', $7 = '10'
Limit  (cost=76.41..76.42 rows=1 width=177) (actual time=1.797..1.802 rows=4.00 loops=1)
  Buffers: shared hit=141
  InitPlan 1
    ->  Aggregate  (cost=0.23..0.25 rows=1 width=32) (actual time=0.042..0.042 rows=1.00 loops=1)
          ->  Function Scan on unnest l  (cost=0.00..0.10 rows=10 width=32) (actual time=0.023..0.024 rows=2.00 loops=1)
  InitPlan 2
    ->  Aggregate  (cost=0.23..0.25 rows=1 width=32) (actual time=0.038..0.039 rows=1.00 loops=1)
          ->  Function Scan on unnest l_1  (cost=0.00..0.10 rows=10 width=32) (actual time=0.016..0.017 rows=2.00 loops=1)
  ->  Sort  (cost=75.92..75.93 rows=1 width=177) (actual time=1.795..1.797 rows=4.00 loops=1)
        Sort Key: ((lower(products.sku) = 'cafe molido'::text)) DESC, (COALESCE(ts_rank(products.search, (InitPlan 1).col1), '0'::real)) DESC, products.name, products.id
        Sort Method: quicksort  Memory: 25kB
        Buffers: shared hit=141
        ->  Bitmap Heap Scan on products  (cost=5.87..75.91 rows=1 width=177) (actual time=1.729..1.741 rows=4.00 loops=1)
              Recheck Cond: ((search @@ (InitPlan 2).col1) OR ((organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid) AND (lower(sku) = 'cafe molido'::text)))
              Filter: (is_active AND (organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid))
              Rows Removed by Filter: 155
              Heap Blocks: exact=125
              Buffers: shared hit=133
              ->  BitmapOr  (cost=5.87..5.87 rows=71 width=0) (actual time=1.010..1.011 rows=0.00 loops=1)
                    Buffers: shared hit=8
                    ->  Bitmap Index Scan on products_search_idx  (cost=0.00..4.48 rows=70 width=0) (actual time=0.989..0.989 rows=159.00 loops=1)
                          Index Cond: (search @@ (InitPlan 2).col1)
                          Index Searches: 1
                          Buffers: shared hit=6
                    ->  Bitmap Index Scan on products_organization_sku_lower_unique  (cost=0.00..1.40 rows=1 width=0) (actual time=0.020..0.020 rows=0.00 loops=1)
                          Index Cond: ((organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid) AND (lower(sku) = 'cafe molido'::text))
                          Index Searches: 1
                          Buffers: shared hit=2
```

### Consulta 4 de 5

```text
duration: 0.099 ms  plan:
Query Text: select distinct on ("product_prices"."product_id") "id", "product_id", "amount", "currency", "created_by", "created_at" from "product_prices" where ("product_prices"."organization_id" = $1 and "product_prices"."product_id" in ($2, $3, $4, $5)) order by "product_prices"."product_id", "product_prices"."created_at" desc, "product_prices"."id" desc
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '5eed0004-0014-4000-8000-000000000078', $3 = '5eed0004-0014-4000-8000-00000000007b', $4 = '5eed0004-0014-4000-8000-0000000000b6', $5 = '5eed0004-0014-4000-8000-000000000017'
Unique  (cost=6.70..6.75 rows=1 width=66) (actual time=0.076..0.081 rows=4.00 loops=1)
  Buffers: shared hit=7
  ->  Incremental Sort  (cost=6.70..6.74 rows=2 width=66) (actual time=0.075..0.076 rows=5.00 loops=1)
        Sort Key: product_id, created_at DESC, id DESC
        Presorted Key: product_id
        Full-sort Groups: 1  Sort Method: quicksort  Average Memory: 25kB  Peak Memory: 25kB
        Buffers: shared hit=7
        ->  Index Scan using product_prices_product_history_idx on product_prices  (cost=0.29..6.69 rows=1 width=66) (actual time=0.041..0.058 rows=5.00 loops=1)
              Index Cond: ((organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid) AND (product_id = ANY ('{5eed0004-0014-4000-8000-000000000078,5eed0004-0014-4000-8000-00000000007b,5eed0004-0014-4000-8000-0000000000b6,5eed0004-0014-4000-8000-000000000017}'::uuid[])))
              Index Searches: 2
              Buffers: shared hit=7
```

### Consulta 5 de 5

```text
duration: 0.047 ms  plan:
Query Text: select "product_id", "quantity_on_hand" from "inventories" where ("inventories"."organization_id" = $1 and "inventories"."product_id" in ($2, $3, $4, $5))
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '5eed0004-0014-4000-8000-000000000078', $3 = '5eed0004-0014-4000-8000-00000000007b', $4 = '5eed0004-0014-4000-8000-0000000000b6', $5 = '5eed0004-0014-4000-8000-000000000017'
Index Scan using inventories_product_id_unique on inventories  (cost=0.29..6.72 rows=1 width=20) (actual time=0.040..0.041 rows=1.00 loops=1)
  Index Cond: (product_id = ANY ('{5eed0004-0014-4000-8000-000000000078,5eed0004-0014-4000-8000-00000000007b,5eed0004-0014-4000-8000-0000000000b6,5eed0004-0014-4000-8000-000000000017}'::uuid[]))
  Filter: (organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid)
  Index Searches: 1
  Buffers: shared hit=3
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
duration: 0.003 ms  plan:
Query Text:  SELECT public.unaccent('public.unaccent'::regdictionary, $1) 
Query Parameters: $1 = 'sku-000001'
Result  (cost=0.00..0.01 rows=1 width=32) (actual time=0.002..0.002 rows=1.00 loops=1)
```

### Consulta 3 de 5

```text
duration: 0.803 ms  plan:
Query Text: select "id", "sku", "name", "description", "unit", "reorder_point", "brand", "category", "condition", "is_active", "created_at", "updated_at" from "products" where ("products"."organization_id" = $1 and "products"."is_active" = $2 and ("products"."search" @@ (select string_agg('''' || replace(replace(l.lexeme, '\', '\\'), '''', '''''') || ''':*', ' & ')::tsquery
    from unnest(to_tsvector('simple', immutable_unaccent(lower($3)))) l) or lower("products"."sku") = lower($4))) order by lower("products"."sku") = lower($5) desc, coalesce(ts_rank("products"."search", (select string_agg('''' || replace(replace(l.lexeme, '\', '\\'), '''', '''''') || ''':*', ' & ')::tsquery
    from unnest(to_tsvector('simple', immutable_unaccent(lower($6)))) l)), 0) desc, "products"."name", "products"."id" limit $7
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = 't', $3 = 'SKU-000001', $4 = 'SKU-000001', $5 = 'SKU-000001', $6 = 'SKU-000001', $7 = '10'
Limit  (cost=76.42..76.43 rows=2 width=177) (actual time=0.778..0.782 rows=1.00 loops=1)
  Buffers: shared hit=8
  InitPlan 1
    ->  Aggregate  (cost=0.23..0.25 rows=1 width=32) (actual time=0.027..0.028 rows=1.00 loops=1)
          ->  Function Scan on unnest l  (cost=0.00..0.10 rows=10 width=32) (actual time=0.016..0.016 rows=2.00 loops=1)
  InitPlan 2
    ->  Aggregate  (cost=0.23..0.25 rows=1 width=32) (actual time=0.611..0.612 rows=1.00 loops=1)
          ->  Function Scan on unnest l_1  (cost=0.00..0.10 rows=10 width=32) (actual time=0.588..0.589 rows=2.00 loops=1)
  ->  Sort  (cost=75.93..75.94 rows=2 width=177) (actual time=0.776..0.778 rows=1.00 loops=1)
        Sort Key: ((lower(products.sku) = 'sku-000001'::text)) DESC, (COALESCE(ts_rank(products.search, (InitPlan 1).col1), '0'::real)) DESC, products.name, products.id
        Sort Method: quicksort  Memory: 25kB
        Buffers: shared hit=8
        ->  Bitmap Heap Scan on products  (cost=5.87..75.92 rows=2 width=177) (actual time=0.760..0.762 rows=1.00 loops=1)
              Recheck Cond: ((search @@ (InitPlan 2).col1) OR ((organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid) AND (lower(sku) = 'sku-000001'::text)))
              Filter: (is_active AND (organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid))
              Heap Blocks: exact=1
              Buffers: shared hit=8
              ->  BitmapOr  (cost=5.87..5.87 rows=71 width=0) (actual time=0.696..0.697 rows=0.00 loops=1)
                    Buffers: shared hit=7
                    ->  Bitmap Index Scan on products_search_idx  (cost=0.00..4.48 rows=70 width=0) (actual time=0.669..0.669 rows=0.00 loops=1)
                          Index Cond: (search @@ (InitPlan 2).col1)
                          Index Searches: 1
                          Buffers: shared hit=5
                    ->  Bitmap Index Scan on products_organization_sku_lower_unique  (cost=0.00..1.40 rows=1 width=0) (actual time=0.026..0.026 rows=1.00 loops=1)
                          Index Cond: ((organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid) AND (lower(sku) = 'sku-000001'::text))
                          Index Searches: 1
                          Buffers: shared hit=2
```

### Consulta 4 de 5

```text
duration: 0.056 ms  plan:
Query Text: select distinct on ("product_prices"."product_id") "id", "product_id", "amount", "currency", "created_by", "created_at" from "product_prices" where ("product_prices"."organization_id" = $1 and "product_prices"."product_id" in ($2)) order by "product_prices"."product_id", "product_prices"."created_at" desc, "product_prices"."id" desc
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '5eed0004-0014-4000-8000-000000000000'
Limit  (cost=2.51..2.52 rows=1 width=66) (actual time=0.045..0.046 rows=1.00 loops=1)
  Buffers: shared hit=3
  ->  Sort  (cost=2.51..2.52 rows=1 width=66) (actual time=0.044..0.045 rows=1.00 loops=1)
        Sort Key: created_at DESC, id DESC
        Sort Method: quicksort  Memory: 25kB
        Buffers: shared hit=3
        ->  Index Scan using product_prices_product_history_idx on product_prices  (cost=0.29..2.50 rows=1 width=66) (actual time=0.035..0.036 rows=1.00 loops=1)
              Index Cond: ((organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid) AND (product_id = '5eed0004-0014-4000-8000-000000000000'::uuid))
              Index Searches: 1
              Buffers: shared hit=3
```

### Consulta 5 de 5

```text
duration: 0.036 ms  plan:
Query Text: select "product_id", "quantity_on_hand" from "inventories" where ("inventories"."organization_id" = $1 and "inventories"."product_id" in ($2))
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '5eed0004-0014-4000-8000-000000000000'
Index Scan using inventories_product_id_unique on inventories  (cost=0.29..2.51 rows=1 width=20) (actual time=0.028..0.030 rows=1.00 loops=1)
  Index Cond: (product_id = '5eed0004-0014-4000-8000-000000000000'::uuid)
  Filter: (organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid)
  Index Searches: 1
  Buffers: shared hit=3
```

## API products: sin coincidencias

Resultado: 0 filas.

### Consulta 1 de 3

```text
duration: 0.009 ms  plan:
Query Text:  SELECT public.unaccent('public.unaccent'::regdictionary, $1) 
Query Parameters: $1 = 'inexistente'
Result  (cost=0.00..0.01 rows=1 width=32) (actual time=0.005..0.006 rows=1.00 loops=1)
```

### Consulta 2 de 3

```text
duration: 0.443 ms  plan:
Query Text:  SELECT public.unaccent('public.unaccent'::regdictionary, $1) 
Query Parameters: $1 = 'inexistente'
Result  (cost=0.00..0.01 rows=1 width=32) (actual time=0.438..0.438 rows=1.00 loops=1)
```

### Consulta 3 de 3

```text
duration: 0.114 ms  plan:
Query Text: select "id", "sku", "name", "description", "unit", "reorder_point", "brand", "category", "condition", "is_active", "created_at", "updated_at" from "products" where ("products"."organization_id" = $1 and "products"."is_active" = $2 and ("products"."search" @@ (select string_agg('''' || replace(replace(l.lexeme, '\', '\\'), '''', '''''') || ''':*', ' & ')::tsquery
    from unnest(to_tsvector('simple', immutable_unaccent(lower($3)))) l) or lower("products"."sku") = lower($4))) order by lower("products"."sku") = lower($5) desc, coalesce(ts_rank("products"."search", (select string_agg('''' || replace(replace(l.lexeme, '\', '\\'), '''', '''''') || ''':*', ' & ')::tsquery
    from unnest(to_tsvector('simple', immutable_unaccent(lower($6)))) l)), 0) desc, "products"."name", "products"."id" limit $7
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = 't', $3 = 'inexistente', $4 = 'inexistente', $5 = 'inexistente', $6 = 'inexistente', $7 = '10'
Limit  (cost=76.41..76.42 rows=1 width=177) (actual time=0.109..0.112 rows=0.00 loops=1)
  Buffers: shared hit=5
  InitPlan 1
    ->  Aggregate  (cost=0.23..0.25 rows=1 width=32) (never executed)
          ->  Function Scan on unnest l  (cost=0.00..0.10 rows=10 width=32) (never executed)
  InitPlan 2
    ->  Aggregate  (cost=0.23..0.25 rows=1 width=32) (actual time=0.037..0.038 rows=1.00 loops=1)
          ->  Function Scan on unnest l_1  (cost=0.00..0.10 rows=10 width=32) (actual time=0.018..0.019 rows=1.00 loops=1)
  ->  Sort  (cost=75.92..75.93 rows=1 width=177) (actual time=0.108..0.109 rows=0.00 loops=1)
        Sort Key: ((lower(products.sku) = 'inexistente'::text)) DESC, (COALESCE(ts_rank(products.search, (InitPlan 1).col1), '0'::real)) DESC, products.name, products.id
        Sort Method: quicksort  Memory: 25kB
        Buffers: shared hit=5
        ->  Bitmap Heap Scan on products  (cost=5.87..75.91 rows=1 width=177) (actual time=0.095..0.096 rows=0.00 loops=1)
              Recheck Cond: ((search @@ (InitPlan 2).col1) OR ((organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid) AND (lower(sku) = 'inexistente'::text)))
              Filter: (is_active AND (organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid))
              Buffers: shared hit=5
              ->  BitmapOr  (cost=5.87..5.87 rows=71 width=0) (actual time=0.083..0.084 rows=0.00 loops=1)
                    Buffers: shared hit=5
                    ->  Bitmap Index Scan on products_search_idx  (cost=0.00..4.48 rows=70 width=0) (actual time=0.058..0.058 rows=0.00 loops=1)
                          Index Cond: (search @@ (InitPlan 2).col1)
                          Index Searches: 1
                          Buffers: shared hit=3
                    ->  Bitmap Index Scan on products_organization_sku_lower_unique  (cost=0.00..1.40 rows=1 width=0) (actual time=0.024..0.024 rows=0.00 loops=1)
                          Index Cond: ((organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid) AND (lower(sku) = 'inexistente'::text))
                          Index Searches: 1
                          Buffers: shared hit=2
```

## API products/{product_id}

Resultado: 1 filas.

### Consulta 1 de 3

```text
duration: 0.052 ms  plan:
Query Text: select "id", "sku", "name", "description", "unit", "reorder_point", "brand", "category", "condition", "is_active", "created_at", "updated_at" from "products" where ("products"."organization_id" = $1 and "products"."id" = $2) limit $3
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '5eed0004-0014-4000-8000-000000000000', $3 = '1'
Limit  (cost=0.29..2.50 rows=1 width=172) (actual time=0.035..0.036 rows=1.00 loops=1)
  Buffers: shared hit=3
  ->  Index Scan using products_organization_id_id_unique on products  (cost=0.29..2.50 rows=1 width=172) (actual time=0.033..0.034 rows=1.00 loops=1)
        Index Cond: ((organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid) AND (id = '5eed0004-0014-4000-8000-000000000000'::uuid))
        Index Searches: 1
        Buffers: shared hit=3
```

### Consulta 2 de 3

```text
duration: 0.058 ms  plan:
Query Text: select distinct on ("product_prices"."product_id") "id", "product_id", "amount", "currency", "created_by", "created_at" from "product_prices" where ("product_prices"."organization_id" = $1 and "product_prices"."product_id" in ($2)) order by "product_prices"."product_id", "product_prices"."created_at" desc, "product_prices"."id" desc
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '5eed0004-0014-4000-8000-000000000000'
Limit  (cost=2.51..2.52 rows=1 width=66) (actual time=0.046..0.047 rows=1.00 loops=1)
  Buffers: shared hit=3
  ->  Sort  (cost=2.51..2.52 rows=1 width=66) (actual time=0.044..0.045 rows=1.00 loops=1)
        Sort Key: created_at DESC, id DESC
        Sort Method: quicksort  Memory: 25kB
        Buffers: shared hit=3
        ->  Index Scan using product_prices_product_history_idx on product_prices  (cost=0.29..2.50 rows=1 width=66) (actual time=0.032..0.034 rows=1.00 loops=1)
              Index Cond: ((organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid) AND (product_id = '5eed0004-0014-4000-8000-000000000000'::uuid))
              Index Searches: 1
              Buffers: shared hit=3
```

### Consulta 3 de 3

```text
duration: 0.038 ms  plan:
Query Text: select "product_id", "quantity_on_hand" from "inventories" where ("inventories"."organization_id" = $1 and "inventories"."product_id" in ($2))
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '5eed0004-0014-4000-8000-000000000000'
Index Scan using inventories_product_id_unique on inventories  (cost=0.29..2.51 rows=1 width=20) (actual time=0.030..0.031 rows=1.00 loops=1)
  Index Cond: (product_id = '5eed0004-0014-4000-8000-000000000000'::uuid)
  Filter: (organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid)
  Index Searches: 1
  Buffers: shared hit=3
```

## API knowledge: vigentes sin texto

Resultado: 20 filas.

### Consulta 1 de 2

```text
duration: 0.029 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.025..0.026 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.023..0.023 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0014-4000-8000-000000000021'::uuid)
        Rows Removed by Filter: 20
        Buffers: shared hit=1
```

### Consulta 2 de 2

```text
duration: 0.575 ms  plan:
Query Text: select "id", "title", "category", "content", "is_active", "valid_from", "valid_until", case
    when not "is_active" then 'inactive'
    when "valid_from" > (now() at time zone $1)::date then 'scheduled'
    when "valid_until" < (now() at time zone $2)::date then 'expired'
    else 'current' end, "created_at", "updated_at" from "knowledge_entries" where ("knowledge_entries"."organization_id" = $3 and case
    when not "knowledge_entries"."is_active" then 'inactive'
    when "knowledge_entries"."valid_from" > (now() at time zone $4)::date then 'scheduled'
    when "knowledge_entries"."valid_until" < (now() at time zone $5)::date then 'expired'
    else 'current' end = $6) order by "knowledge_entries"."category" asc, "knowledge_entries"."title" asc, "knowledge_entries"."id" asc limit $7
Query Parameters: $1 = 'America/Argentina/Buenos_Aires', $2 = 'America/Argentina/Buenos_Aires', $3 = '5eed0000-0014-4000-8000-000000000021', $4 = 'America/Argentina/Buenos_Aires', $5 = 'America/Argentina/Buenos_Aires', $6 = 'current', $7 = '20'
Limit  (cost=15.90..15.90 rows=1 width=164) (actual time=0.533..0.539 rows=20.00 loops=1)
  Buffers: shared hit=16
  ->  Sort  (cost=15.90..15.90 rows=1 width=164) (actual time=0.531..0.534 rows=20.00 loops=1)
        Sort Key: category, title, id
        Sort Method: quicksort  Memory: 30kB
        Buffers: shared hit=16
        ->  Index Scan using knowledge_entries_organization_title_lower_unique on knowledge_entries  (cost=0.28..15.89 rows=1 width=164) (actual time=0.361..0.480 rows=21.00 loops=1)
              Index Cond: (organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid)
              Filter: (CASE WHEN (NOT is_active) THEN 'inactive'::text WHEN (valid_from > ((now() AT TIME ZONE 'America/Argentina/Buenos_Aires'::text))::date) THEN 'scheduled'::text WHEN (valid_until < ((now() AT TIME ZONE 'America/Argentina/Buenos_Aires'::text))::date) THEN 'expired'::text ELSE 'current'::text END = 'current'::text)
              Rows Removed by Filter: 9
              Index Searches: 1
              Buffers: shared hit=16
```

## API knowledge: vigentes con texto

Resultado: 2 filas.

### Consulta 1 de 4

```text
duration: 0.026 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.022..0.023 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.020..0.020 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0014-4000-8000-000000000021'::uuid)
        Rows Removed by Filter: 20
        Buffers: shared hit=1
```

### Consulta 2 de 4

```text
duration: 0.009 ms  plan:
Query Text:  SELECT public.unaccent('public.unaccent'::regdictionary, $1) 
Query Parameters: $1 = 'horario'
Result  (cost=0.00..0.01 rows=1 width=32) (actual time=0.005..0.005 rows=1.00 loops=1)
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
duration: 0.294 ms  plan:
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
Query Parameters: $1 = 'America/Argentina/Buenos_Aires', $2 = 'America/Argentina/Buenos_Aires', $3 = '5eed0000-0014-4000-8000-000000000021', $4 = 'America/Argentina/Buenos_Aires', $5 = 'America/Argentina/Buenos_Aires', $6 = 'current', $7 = 'horario', $8 = 'horario', $9 = '20'
Limit  (cost=6.29..6.29 rows=1 width=168) (actual time=0.277..0.281 rows=2.00 loops=1)
  Buffers: shared hit=6
  InitPlan 1
    ->  Aggregate  (cost=0.23..0.25 rows=1 width=32) (actual time=0.015..0.015 rows=1.00 loops=1)
          ->  Function Scan on unnest l  (cost=0.00..0.10 rows=10 width=32) (actual time=0.007..0.007 rows=1.00 loops=1)
  InitPlan 2
    ->  Aggregate  (cost=0.23..0.25 rows=1 width=32) (actual time=0.045..0.045 rows=1.00 loops=1)
          ->  Function Scan on unnest l_1  (cost=0.00..0.10 rows=10 width=32) (actual time=0.023..0.023 rows=1.00 loops=1)
  ->  Sort  (cost=5.80..5.80 rows=1 width=168) (actual time=0.275..0.277 rows=2.00 loops=1)
        Sort Key: (ts_rank(knowledge_entries.search, (InitPlan 1).col1)) DESC, knowledge_entries.title, knowledge_entries.id
        Sort Method: quicksort  Memory: 25kB
        Buffers: shared hit=6
        ->  Bitmap Heap Scan on knowledge_entries  (cost=4.63..5.79 rows=1 width=168) (actual time=0.242..0.251 rows=2.00 loops=1)
              Recheck Cond: ((organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid) AND (search @@ (InitPlan 2).col1))
              Filter: (CASE WHEN (NOT is_active) THEN 'inactive'::text WHEN (valid_from > ((now() AT TIME ZONE 'America/Argentina/Buenos_Aires'::text))::date) THEN 'scheduled'::text WHEN (valid_until < ((now() AT TIME ZONE 'America/Argentina/Buenos_Aires'::text))::date) THEN 'expired'::text ELSE 'current'::text END = 'current'::text)
              Rows Removed by Filter: 2
              Heap Blocks: exact=1
              Buffers: shared hit=6
              ->  BitmapAnd  (cost=4.63..4.63 rows=1 width=0) (actual time=0.184..0.184 rows=0.00 loops=1)
                    Buffers: shared hit=5
                    ->  Bitmap Index Scan on knowledge_entries_organization_title_lower_unique  (cost=0.00..1.60 rows=30 width=0) (actual time=0.026..0.026 rows=30.00 loops=1)
                          Index Cond: (organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid)
                          Index Searches: 1
                          Buffers: shared hit=2
                    ->  Bitmap Index Scan on knowledge_entries_search_idx  (cost=0.00..2.78 rows=7 width=0) (actual time=0.153..0.153 rows=174.00 loops=1)
                          Index Cond: (search @@ (InitPlan 2).col1)
                          Index Searches: 1
                          Buffers: shared hit=3
```

## conversations.resolveIngestedConversation (con vigente)

Resultado: conversación vigente.

### Consulta 1 de 4

```text
duration: 0.112 ms  plan:
Query Text: select "id" from "clients" where ("clients"."organization_id" = $1 and "clients"."phone_e164" = $2) for update
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '+5491160000000'
LockRows  (cost=0.29..2.51 rows=1 width=22) (actual time=0.104..0.107 rows=1.00 loops=1)
  Buffers: shared hit=5
  ->  Index Scan using clients_organization_phone_unique on clients  (cost=0.29..2.50 rows=1 width=22) (actual time=0.046..0.047 rows=1.00 loops=1)
        Index Cond: ((organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid) AND (phone_e164 = '+5491160000000'::text))
        Index Searches: 1
        Buffers: shared hit=3
```

### Consulta 2 de 4

```text
duration: 0.056 ms  plan:
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
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '5eed0001-0014-4000-8000-000000000000', $3 = 'whatsapp', $4 = '2026-09-29 02:01:00+00', $5 = '2026-10-01 02:01:00+00', $6 = '2026-09-30 02:01:00+00', $7 = '2026-09-30 02:01:00+00'
Limit  (cost=2.53..2.55 rows=1 width=65) (actual time=0.049..0.050 rows=1.00 loops=1)
  Buffers: shared hit=6 dirtied=1
  ->  LockRows  (cost=2.53..2.55 rows=1 width=65) (actual time=0.048..0.049 rows=1.00 loops=1)
        Buffers: shared hit=6 dirtied=1
        ->  Sort  (cost=2.53..2.54 rows=1 width=65) (actual time=0.038..0.038 rows=1.00 loops=1)
              Sort Key: (GREATEST((started_at - '2026-09-30 02:01:00+00'::timestamp with time zone), ('2026-09-30 02:01:00+00'::timestamp with time zone - last_message_at), '00:00:00'::interval)), last_message_at DESC, id DESC
              Sort Method: quicksort  Memory: 25kB
              Buffers: shared hit=5
              ->  Index Scan using conversations_organization_client_last_message_idx on conversations  (cost=0.29..2.52 rows=1 width=65) (actual time=0.019..0.020 rows=1.00 loops=1)
                    Index Cond: ((organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid) AND (client_id = '5eed0001-0014-4000-8000-000000000000'::uuid) AND (last_message_at >= '2026-09-29 02:01:00+00'::timestamp with time zone))
                    Filter: ((external_ref IS NOT NULL) AND (status = ANY ('{open,pending}'::conversation_status[])) AND (started_at <= '2026-10-01 02:01:00+00'::timestamp with time zone) AND (channel = 'whatsapp'::conversation_channel))
                    Index Searches: 1
                    Buffers: shared hit=3
```

### Consulta 3 de 4

```text
duration: 0.763 ms  plan:
Query Text: 
    insert into messages
      (organization_id, conversation_id, direction, external_ref, sent_at, body_text, kind, sent_by)
    values ($1, $2, $3,
      $4, $5, $6, $7, $8)
    on conflict (organization_id, conversation_id, external_ref) where external_ref is not null
    do nothing
    returning id
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '5eed000b-0014-4000-8000-000000000000', $3 = 'inbound', $4 = 'medicion-13-2-mensaje', $5 = '2026-09-30 02:01:00+00', $6 = 'Mensaje de la medición', $7 = NULL, $8 = NULL
Insert on messages  (cost=0.00..0.01 rows=1 width=140) (actual time=0.240..0.241 rows=1.00 loops=1)
  Conflict Resolution: NOTHING
  Conflict Arbiter Indexes: messages_organization_conversation_external_ref_unique
  Tuples Inserted: 1
  Conflicting Tuples: 0
  Buffers: shared hit=21
  ->  Result  (cost=0.00..0.01 rows=1 width=140) (actual time=0.028..0.028 rows=1.00 loops=1)
```

### Consulta 4 de 4

```text
duration: 0.197 ms  plan:
Query Text: update "conversations" set "started_at" = least("conversations"."started_at", $1), "last_message_at" = greatest("conversations"."last_message_at", $2), "updated_at" = $3 where ("conversations"."organization_id" = $4 and "conversations"."id" = $5) returning "id"
Query Parameters: $1 = '2026-09-30 02:01:00+00', $2 = '2026-09-30 02:01:00+00', $3 = '2026-09-30 14:33:38.573+00', $4 = '5eed0000-0014-4000-8000-000000000021', $5 = '5eed000b-0014-4000-8000-000000000000'
Update on conversations  (cost=0.29..2.51 rows=1 width=30) (actual time=0.190..0.193 rows=1.00 loops=1)
  Buffers: shared hit=27 dirtied=1
  ->  Index Scan using conversations_organization_id_id_unique on conversations  (cost=0.29..2.51 rows=1 width=30) (actual time=0.017..0.019 rows=1.00 loops=1)
        Index Cond: ((organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid) AND (id = '5eed000b-0014-4000-8000-000000000000'::uuid))
        Index Searches: 1
        Buffers: shared hit=3
```

## conversations.resolveIngestedConversation (sin vigente)

Resultado: conversación nueva.

### Consulta 1 de 4

```text
duration: 0.081 ms  plan:
Query Text: select "id" from "clients" where ("clients"."organization_id" = $1 and "clients"."phone_e164" = $2) for update
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '+5491160000000'
LockRows  (cost=0.29..2.51 rows=1 width=22) (actual time=0.074..0.077 rows=1.00 loops=1)
  Buffers: shared hit=5
  ->  Index Scan using clients_organization_phone_unique on clients  (cost=0.29..2.50 rows=1 width=22) (actual time=0.037..0.039 rows=1.00 loops=1)
        Index Cond: ((organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid) AND (phone_e164 = '+5491160000000'::text))
        Index Searches: 1
        Buffers: shared hit=3
```

### Consulta 2 de 4

```text
duration: 0.033 ms  plan:
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
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '5eed0001-0014-4000-8000-000000000000', $3 = 'whatsapp', $4 = '2026-10-29 02:00:00+00', $5 = '2026-10-31 02:00:00+00', $6 = '2026-10-30 02:00:00+00', $7 = '2026-10-30 02:00:00+00'
Limit  (cost=2.53..2.55 rows=1 width=65) (actual time=0.031..0.032 rows=0.00 loops=1)
  Buffers: shared hit=2
  ->  LockRows  (cost=2.53..2.55 rows=1 width=65) (actual time=0.030..0.031 rows=0.00 loops=1)
        Buffers: shared hit=2
        ->  Sort  (cost=2.53..2.54 rows=1 width=65) (actual time=0.029..0.030 rows=0.00 loops=1)
              Sort Key: (GREATEST((started_at - '2026-10-30 02:00:00+00'::timestamp with time zone), ('2026-10-30 02:00:00+00'::timestamp with time zone - last_message_at), '00:00:00'::interval)), last_message_at DESC, id DESC
              Sort Method: quicksort  Memory: 25kB
              Buffers: shared hit=2
              ->  Index Scan using conversations_organization_client_last_message_idx on conversations  (cost=0.29..2.52 rows=1 width=65) (actual time=0.022..0.022 rows=0.00 loops=1)
                    Index Cond: ((organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid) AND (client_id = '5eed0001-0014-4000-8000-000000000000'::uuid) AND (last_message_at >= '2026-10-29 02:00:00+00'::timestamp with time zone))
                    Filter: ((external_ref IS NOT NULL) AND (status = ANY ('{open,pending}'::conversation_status[])) AND (started_at <= '2026-10-31 02:00:00+00'::timestamp with time zone) AND (channel = 'whatsapp'::conversation_channel))
                    Index Searches: 1
                    Buffers: shared hit=2
```

### Consulta 3 de 4

```text
duration: 1.021 ms  plan:
Query Text: 
    insert into conversations
      (organization_id, client_id, channel, external_ref, status, started_at, last_message_at)
    values ($1, $2, $3,
      $4, 'open', $5, $6)
    on conflict (organization_id, channel, external_ref) where external_ref is not null
    do nothing
    returning id
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '5eed0001-0014-4000-8000-000000000000', $3 = 'whatsapp', $4 = 'medicion-13-2-propuesta', $5 = '2026-10-30 02:00:00+00', $6 = '2026-10-30 02:00:00+00'
Insert on conversations  (cost=0.00..0.02 rows=1 width=120) (actual time=0.255..0.257 rows=1.00 loops=1)
  Conflict Resolution: NOTHING
  Conflict Arbiter Indexes: conversations_organization_channel_external_ref_unique
  Tuples Inserted: 1
  Conflicting Tuples: 0
  Buffers: shared hit=23
  ->  Result  (cost=0.00..0.02 rows=1 width=120) (actual time=0.029..0.030 rows=1.00 loops=1)
```

### Consulta 4 de 4

```text
duration: 0.365 ms  plan:
Query Text: 
    insert into messages
      (organization_id, conversation_id, direction, external_ref, sent_at, body_text, kind, sent_by)
    values ($1, $2, $3,
      $4, $5, $6, $7, $8)
    on conflict (organization_id, conversation_id, external_ref) where external_ref is not null
    do nothing
    returning id
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '9a3a13bc-c3f3-4df5-a659-0cb26b782c7d', $3 = 'inbound', $4 = 'medicion-13-2-mensaje', $5 = '2026-10-30 02:00:00+00', $6 = 'Mensaje de la medición', $7 = NULL, $8 = NULL
Insert on messages  (cost=0.00..0.01 rows=1 width=140) (actual time=0.127..0.128 rows=1.00 loops=1)
  Conflict Resolution: NOTHING
  Conflict Arbiter Indexes: messages_organization_conversation_external_ref_unique
  Tuples Inserted: 1
  Conflicting Tuples: 0
  Buffers: shared hit=7
  ->  Result  (cost=0.00..0.01 rows=1 width=140) (actual time=0.028..0.028 rows=1.00 loops=1)
```

## conversations.listRecentMessagesForService (20 de 4000, de 5916 de la organización)

Resultado: 20 filas.

### Consulta 1 de 2

```text
duration: 0.046 ms  plan:
Query Text: select "id" from "conversations" where ("conversations"."organization_id" = $1 and "conversations"."channel" = $2 and "conversations"."external_ref" = $3) limit $4
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = 'whatsapp', $3 = 'vol-conv-20-concentrada', $4 = '1'
Limit  (cost=0.41..2.63 rows=1 width=16) (actual time=0.042..0.043 rows=1.00 loops=1)
  Buffers: shared hit=4
  ->  Index Scan using conversations_organization_channel_external_ref_unique on conversations  (cost=0.41..2.63 rows=1 width=16) (actual time=0.040..0.041 rows=1.00 loops=1)
        Index Cond: ((organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid) AND (channel = 'whatsapp'::conversation_channel) AND (external_ref = 'vol-conv-20-concentrada'::text))
        Index Searches: 1
        Buffers: shared hit=4
```

### Consulta 2 de 2

```text
duration: 0.109 ms  plan:
Query Text: select "external_ref", "direction", "sent_at", "body_text", "kind", "sent_by" from "messages" where ("messages"."organization_id" = $1 and "messages"."conversation_id" = $2) order by "messages"."sent_at" desc, "messages"."id" desc limit $3
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '5eed000b-0014-4000-8000-000000000000', $3 = '20'
Limit  (cost=4.39..84.21 rows=20 width=100) (actual time=0.063..0.069 rows=20.00 loops=1)
  Buffers: shared hit=5
  ->  Incremental Sort  (cost=4.39..978.23 rows=244 width=100) (actual time=0.062..0.064 rows=20.00 loops=1)
        Sort Key: sent_at DESC, id DESC
        Presorted Key: sent_at
        Full-sort Groups: 1  Sort Method: quicksort  Average Memory: 27kB  Peak Memory: 27kB
        Buffers: shared hit=5
        ->  Index Scan Backward using messages_conversation_sent_idx on messages  (cost=0.42..967.25 rows=244 width=100) (actual time=0.030..0.040 rows=21.00 loops=1)
              Index Cond: (conversation_id = '5eed000b-0014-4000-8000-000000000000'::uuid)
              Filter: (organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid)
              Index Searches: 1
              Buffers: shared hit=5
```

## conversations.listRecentMessagesForService (50, el máximo del contrato)

Resultado: 50 filas.

### Consulta 1 de 2

```text
duration: 0.046 ms  plan:
Query Text: select "id" from "conversations" where ("conversations"."organization_id" = $1 and "conversations"."channel" = $2 and "conversations"."external_ref" = $3) limit $4
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = 'whatsapp', $3 = 'vol-conv-20-concentrada', $4 = '1'
Limit  (cost=0.41..2.63 rows=1 width=16) (actual time=0.042..0.043 rows=1.00 loops=1)
  Buffers: shared hit=4
  ->  Index Scan using conversations_organization_channel_external_ref_unique on conversations  (cost=0.41..2.63 rows=1 width=16) (actual time=0.040..0.041 rows=1.00 loops=1)
        Index Cond: ((organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid) AND (channel = 'whatsapp'::conversation_channel) AND (external_ref = 'vol-conv-20-concentrada'::text))
        Index Searches: 1
        Buffers: shared hit=4
```

### Consulta 2 de 2

```text
duration: 0.173 ms  plan:
Query Text: select "external_ref", "direction", "sent_at", "body_text", "kind", "sent_by" from "messages" where ("messages"."organization_id" = $1 and "messages"."conversation_id" = $2) order by "messages"."sent_at" desc, "messages"."id" desc limit $3
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '5eed000b-0014-4000-8000-000000000000', $3 = '50'
Limit  (cost=4.39..203.95 rows=50 width=100) (actual time=0.078..0.104 rows=50.00 loops=1)
  Buffers: shared hit=5
  ->  Incremental Sort  (cost=4.39..978.23 rows=244 width=100) (actual time=0.076..0.096 rows=50.00 loops=1)
        Sort Key: sent_at DESC, id DESC
        Presorted Key: sent_at
        Full-sort Groups: 2  Sort Method: quicksort  Average Memory: 29kB  Peak Memory: 29kB
        Buffers: shared hit=5
        ->  Index Scan Backward using messages_conversation_sent_idx on messages  (cost=0.42..967.25 rows=244 width=100) (actual time=0.039..0.059 rows=51.00 loops=1)
              Index Cond: (conversation_id = '5eed000b-0014-4000-8000-000000000000'::uuid)
              Filter: (organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid)
              Index Searches: 1
              Buffers: shared hit=5
```

## analytics 1 conversaciones iniciadas

Resultado: valor 38.

### Consulta 1 de 3

```text
duration: 0.026 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.022..0.023 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.020..0.020 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0014-4000-8000-000000000021'::uuid)
        Rows Removed by Filter: 20
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
duration: 0.077 ms  plan:
Query Text: select count(*) from "conversations" where ("conversations"."organization_id" = $1 and "conversations"."started_at" >= ($2::date::timestamp at time zone $3) and "conversations"."started_at" < (($4::date + 1)::timestamp at time zone $5))
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '2026-08-31', $3 = 'America/Argentina/Buenos_Aires', $4 = '2026-09-29', $5 = 'America/Argentina/Buenos_Aires'
Aggregate  (cost=2.56..2.57 rows=1 width=8) (actual time=0.072..0.073 rows=1.00 loops=1)
  Buffers: shared hit=4
  ->  Index Only Scan using conversations_organization_started_idx on conversations  (cost=0.29..2.44 rows=47 width=0) (actual time=0.024..0.061 rows=38.00 loops=1)
        Index Cond: ((organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid) AND (started_at >= '2026-08-31 03:00:00+00'::timestamp with time zone) AND (started_at < '2026-09-30 03:00:00+00'::timestamp with time zone))
        Heap Fetches: 4
        Index Searches: 1
        Buffers: shared hit=4
```

## analytics 2 conversaciones activas

Resultado: valor 38.

### Consulta 1 de 3

```text
duration: 0.029 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.024..0.025 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.022..0.022 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0014-4000-8000-000000000021'::uuid)
        Rows Removed by Filter: 20
        Buffers: shared hit=1
```

### Consulta 2 de 3

```text
duration: 0.023 ms  plan:
Query Text: select to_char((now() at time zone $1)::date, 'YYYY-MM-DD') as today
Query Parameters: $1 = 'America/Argentina/Buenos_Aires'
Result  (cost=0.00..0.02 rows=1 width=32) (actual time=0.021..0.021 rows=1.00 loops=1)
```

### Consulta 3 de 3

```text
duration: 3.744 ms  plan:
Query Text: select count(distinct "conversation_id") from "messages" where ("messages"."organization_id" = $1 and "messages"."sent_at" >= ($2::date::timestamp at time zone $3) and "messages"."sent_at" < (($4::date + 1)::timestamp at time zone $5))
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '2026-08-31', $3 = 'America/Argentina/Buenos_Aires', $4 = '2026-09-29', $5 = 'America/Argentina/Buenos_Aires'
Aggregate  (cost=526.94..526.95 rows=1 width=8) (actual time=3.730..3.732 rows=1.00 loops=1)
  Buffers: shared hit=385
  ->  Sort  (cost=521.18..524.06 rows=1152 width=16) (actual time=2.877..3.235 rows=4231.00 loops=1)
        Sort Key: conversation_id
        Sort Method: quicksort  Memory: 193kB
        Buffers: shared hit=385
        ->  Index Scan using messages_organization_sent_idx on messages  (cost=0.42..462.60 rows=1152 width=16) (actual time=0.039..1.911 rows=4231.00 loops=1)
              Index Cond: ((organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid) AND (sent_at >= '2026-08-31 03:00:00+00'::timestamp with time zone) AND (sent_at < '2026-09-30 03:00:00+00'::timestamp with time zone))
              Index Searches: 1
              Buffers: shared hit=385
```

## analytics 3 clientes únicos

Resultado: valor {"clients":25,"withoutClient":10}.

### Consulta 1 de 3

```text
duration: 0.146 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.140..0.141 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.138..0.138 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0014-4000-8000-000000000021'::uuid)
        Rows Removed by Filter: 20
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
duration: 3.179 ms  plan:
Query Text: select count(distinct "client_id"), count(*) filter (where "client_id" is null) from "conversations" where ("conversations"."organization_id" = $1 and "conversations"."id" in (select distinct "conversation_id" from "messages" where ("messages"."organization_id" = $2 and "messages"."sent_at" >= ($3::date::timestamp at time zone $4) and "messages"."sent_at" < (($5::date + 1)::timestamp at time zone $6))))
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '5eed0000-0014-4000-8000-000000000021', $3 = '2026-08-31', $4 = 'America/Argentina/Buenos_Aires', $5 = '2026-09-29', $6 = 'America/Argentina/Buenos_Aires'
Aggregate  (cost=582.15..582.16 rows=1 width=16) (actual time=3.162..3.166 rows=1.00 loops=1)
  Buffers: shared hit=393
  ->  Sort  (cost=581.97..582.03 rows=24 width=16) (actual time=3.146..3.152 rows=38.00 loops=1)
        Sort Key: conversations.client_id
        Sort Method: quicksort  Memory: 25kB
        Buffers: shared hit=393
        ->  Hash Join  (cost=567.45..581.42 rows=24 width=16) (actual time=3.077..3.126 rows=38.00 loops=1)
              Hash Cond: (messages.conversation_id = conversations.id)
              Buffers: shared hit=393
              ->  HashAggregate  (cost=465.48..476.55 rows=1107 width=16) (actual time=2.793..2.816 rows=38.00 loops=1)
                    Group Key: messages.conversation_id
                    Batches: 1  Memory Usage: 65kB
                    Buffers: shared hit=383
                    ->  Index Scan using messages_organization_sent_idx on messages  (cost=0.42..462.60 rows=1152 width=16) (actual time=0.058..1.542 rows=4231.00 loops=1)
                          Index Cond: ((organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid) AND (sent_at >= '2026-08-31 03:00:00+00'::timestamp with time zone) AND (sent_at < '2026-09-30 03:00:00+00'::timestamp with time zone))
                          Index Searches: 1
                          Buffers: shared hit=383
              ->  Hash  (cost=98.21..98.21 rows=301 width=32) (actual time=0.243..0.245 rows=301.00 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 26kB
                    Buffers: shared hit=10
                    ->  Index Scan using conversations_organization_id_id_unique on conversations  (cost=0.29..98.21 rows=301 width=32) (actual time=0.036..0.156 rows=301.00 loops=1)
                          Index Cond: (organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid)
                          Index Searches: 1
                          Buffers: shared hit=10
```

## analytics 4-5 mensajes

Resultado: valor {"inbound":2124,"outbound":2107}.

### Consulta 1 de 3

```text
duration: 0.027 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.023..0.023 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.021..0.021 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0014-4000-8000-000000000021'::uuid)
        Rows Removed by Filter: 20
        Buffers: shared hit=1
```

### Consulta 2 de 3

```text
duration: 0.026 ms  plan:
Query Text: select to_char((now() at time zone $1)::date, 'YYYY-MM-DD') as today
Query Parameters: $1 = 'America/Argentina/Buenos_Aires'
Result  (cost=0.00..0.02 rows=1 width=32) (actual time=0.022..0.022 rows=1.00 loops=1)
```

### Consulta 3 de 3

```text
duration: 2.427 ms  plan:
Query Text: select count(*) filter (where "direction" = 'inbound'), count(*) filter (where "direction" = 'outbound') from "messages" where ("messages"."organization_id" = $1 and "messages"."sent_at" >= ($2::date::timestamp at time zone $3) and "messages"."sent_at" < (($4::date + 1)::timestamp at time zone $5))
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '2026-08-31', $3 = 'America/Argentina/Buenos_Aires', $4 = '2026-09-29', $5 = 'America/Argentina/Buenos_Aires'
Aggregate  (cost=474.12..474.13 rows=1 width=16) (actual time=2.412..2.413 rows=1.00 loops=1)
  Buffers: shared hit=383
  ->  Index Scan using messages_organization_sent_idx on messages  (cost=0.42..462.60 rows=1152 width=4) (actual time=0.029..1.445 rows=4231.00 loops=1)
        Index Cond: ((organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid) AND (sent_at >= '2026-08-31 03:00:00+00'::timestamp with time zone) AND (sent_at < '2026-09-30 03:00:00+00'::timestamp with time zone))
        Index Searches: 1
        Buffers: shared hit=383
```

## analytics 6 mensajes por conversación

Resultado: valor {"status":"value","conversations":.

### Consulta 1 de 3

```text
duration: 0.029 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.025..0.026 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.023..0.023 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0014-4000-8000-000000000021'::uuid)
        Rows Removed by Filter: 20
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
duration: 2.766 ms  plan:
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
  
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '2026-08-31', $3 = 'America/Argentina/Buenos_Aires', $4 = '2026-09-29', $5 = 'America/Argentina/Buenos_Aires'
Aggregate  (cost=501.57..501.58 rows=1 width=48) (actual time=2.752..2.754 rows=1.00 loops=1)
  Buffers: shared hit=391
  ->  HashAggregate  (cost=468.36..479.43 rows=1107 width=24) (actual time=2.601..2.621 rows=38.00 loops=1)
        Group Key: messages.conversation_id
        Batches: 1  Memory Usage: 65kB
        Buffers: shared hit=383
        ->  Index Scan using messages_organization_sent_idx on messages  (cost=0.42..462.60 rows=1152 width=16) (actual time=0.024..1.396 rows=4231.00 loops=1)
              Index Cond: ((organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid) AND (sent_at >= '2026-08-31 03:00:00+00'::timestamp with time zone) AND (sent_at < '2026-09-30 03:00:00+00'::timestamp with time zone))
              Index Searches: 1
              Buffers: shared hit=383
```

## analytics 10 actividad diaria

Resultado: valor [{"day":"2026-08-31","started":3,".

### Consulta 1 de 3

```text
duration: 0.024 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.020..0.021 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.018..0.018 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0014-4000-8000-000000000021'::uuid)
        Rows Removed by Filter: 20
        Buffers: shared hit=1
```

### Consulta 2 de 3

```text
duration: 0.021 ms  plan:
Query Text: select to_char((now() at time zone $1)::date, 'YYYY-MM-DD') as today
Query Parameters: $1 = 'America/Argentina/Buenos_Aires'
Result  (cost=0.00..0.02 rows=1 width=32) (actual time=0.018..0.018 rows=1.00 loops=1)
```

### Consulta 3 de 3

```text
duration: 8.363 ms  plan:
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
  
Query Parameters: $1 = '2026-08-31', $2 = '2026-09-29', $3 = 'America/Argentina/Buenos_Aires', $4 = '5eed0000-0014-4000-8000-000000000021', $5 = '2026-08-31', $6 = 'America/Argentina/Buenos_Aires', $7 = '2026-09-29', $8 = 'America/Argentina/Buenos_Aires', $9 = 'America/Argentina/Buenos_Aires', $10 = '5eed0000-0014-4000-8000-000000000021', $11 = '2026-08-31', $12 = 'America/Argentina/Buenos_Aires', $13 = '2026-09-29', $14 = 'America/Argentina/Buenos_Aires'
Merge Left Join  (cost=532.75..588.29 rows=30 width=68) (actual time=7.041..8.326 rows=30.00 loops=1)
  Merge Cond: (((d.d)::date) = (((messages.sent_at AT TIME ZONE 'America/Argentina/Buenos_Aires'::text))::date))
  Buffers: shared hit=387
  ->  Sort  (cost=5.81..5.89 rows=30 width=16) (actual time=0.165..0.177 rows=30.00 loops=1)
        Sort Key: ((d.d)::date)
        Sort Method: quicksort  Memory: 26kB
        Buffers: shared hit=4
        ->  Hash Left Join  (cost=4.68..5.08 rows=30 width=16) (actual time=0.131..0.158 rows=30.00 loops=1)
              Hash Cond: ((d.d)::date = started.day)
              Buffers: shared hit=4
              ->  Function Scan on generate_series d  (cost=0.01..0.31 rows=30 width=8) (actual time=0.021..0.025 rows=30.00 loops=1)
              ->  Hash  (cost=4.09..4.09 rows=47 width=12) (actual time=0.103..0.107 rows=22.00 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 9kB
                    Buffers: shared hit=4
                    ->  Subquery Scan on started  (cost=2.91..4.09 rows=47 width=12) (actual time=0.088..0.098 rows=22.00 loops=1)
                          Buffers: shared hit=4
                          ->  HashAggregate  (cost=2.91..3.62 rows=47 width=12) (actual time=0.087..0.093 rows=22.00 loops=1)
                                Group Key: ((conversations.started_at AT TIME ZONE 'America/Argentina/Buenos_Aires'::text))::date
                                Batches: 1  Memory Usage: 32kB
                                Buffers: shared hit=4
                                ->  Index Only Scan using conversations_organization_started_idx on conversations  (cost=0.29..2.68 rows=47 width=4) (actual time=0.024..0.067 rows=38.00 loops=1)
                                      Index Cond: ((organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid) AND (started_at >= '2026-08-31 03:00:00+00'::timestamp with time zone) AND (started_at < '2026-09-30 03:00:00+00'::timestamp with time zone))
                                      Heap Fetches: 3
                                      Index Searches: 1
                                      Buffers: shared hit=4
  ->  GroupAggregate  (cost=526.94..564.38 rows=1152 width=28) (actual time=6.855..8.081 rows=27.00 loops=1)
        Group Key: (((messages.sent_at AT TIME ZONE 'America/Argentina/Buenos_Aires'::text))::date)
        Buffers: shared hit=383
        ->  Sort  (cost=526.94..529.82 rows=1152 width=24) (actual time=6.833..7.190 rows=4231.00 loops=1)
              Sort Key: (((messages.sent_at AT TIME ZONE 'America/Argentina/Buenos_Aires'::text))::date), messages.conversation_id
              Sort Method: quicksort  Memory: 358kB
              Buffers: shared hit=383
              ->  Index Scan using messages_organization_sent_idx on messages  (cost=0.42..468.36 rows=1152 width=24) (actual time=0.026..4.881 rows=4231.00 loops=1)
                    Index Cond: ((organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid) AND (sent_at >= '2026-08-31 03:00:00+00'::timestamp with time zone) AND (sent_at < '2026-09-30 03:00:00+00'::timestamp with time zone))
                    Index Searches: 1
                    Buffers: shared hit=383
```

## analytics 7 respondidas

Resultado: valor 31.

### Consulta 1 de 3

```text
duration: 0.028 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.023..0.023 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.021..0.021 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0014-4000-8000-000000000021'::uuid)
        Rows Removed by Filter: 20
        Buffers: shared hit=1
```

### Consulta 2 de 3

```text
duration: 0.023 ms  plan:
Query Text: select to_char((now() at time zone $1)::date, 'YYYY-MM-DD') as today
Query Parameters: $1 = 'America/Argentina/Buenos_Aires'
Result  (cost=0.00..0.02 rows=1 width=32) (actual time=0.020..0.020 rows=1.00 loops=1)
```

### Consulta 3 de 3

```text
duration: 3.414 ms  plan:
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
  
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '2026-08-31', $3 = 'America/Argentina/Buenos_Aires', $4 = '2026-09-29', $5 = 'America/Argentina/Buenos_Aires'
Aggregate  (cost=495.40..495.41 rows=1 width=8) (actual time=3.372..3.375 rows=1.00 loops=1)
  Buffers: shared hit=383
  ->  HashAggregate  (cost=477.00..490.83 rows=365 width=32) (actual time=3.342..3.364 rows=31.00 loops=1)
        Group Key: messages.conversation_id
        Filter: ((min(messages.sent_at) FILTER (WHERE (messages.direction = 'inbound'::message_direction)) IS NOT NULL) AND (max(messages.sent_at) FILTER (WHERE (messages.direction = 'outbound'::message_direction)) IS NOT NULL) AND (max(messages.sent_at) FILTER (WHERE (messages.direction = 'outbound'::message_direction)) > min(messages.sent_at) FILTER (WHERE (messages.direction = 'inbound'::message_direction))))
        Batches: 1  Memory Usage: 65kB
        Rows Removed by Filter: 7
        Buffers: shared hit=383
        ->  Index Scan using messages_organization_sent_idx on messages  (cost=0.42..462.60 rows=1152 width=28) (actual time=0.023..1.776 rows=4231.00 loops=1)
              Index Cond: ((organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid) AND (sent_at >= '2026-08-31 03:00:00+00'::timestamp with time zone) AND (sent_at < '2026-09-30 03:00:00+00'::timestamp with time zone))
              Index Searches: 1
              Buffers: shared hit=383
```

## analytics 8 cobertura de respuesta

Resultado: valor {"status":"value","responded":31,".

### Consulta 1 de 3

```text
duration: 0.026 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.022..0.022 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.019..0.020 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0014-4000-8000-000000000021'::uuid)
        Rows Removed by Filter: 20
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
duration: 3.316 ms  plan:
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
  
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '2026-08-31', $3 = 'America/Argentina/Buenos_Aires', $4 = '2026-09-29', $5 = 'America/Argentina/Buenos_Aires'
Aggregate  (cost=507.33..507.34 rows=1 width=16) (actual time=3.303..3.304 rows=1.00 loops=1)
  Buffers: shared hit=383
  ->  HashAggregate  (cost=477.00..488.07 rows=1101 width=32) (actual time=3.265..3.289 rows=37.00 loops=1)
        Group Key: messages.conversation_id
        Filter: (min(messages.sent_at) FILTER (WHERE (messages.direction = 'inbound'::message_direction)) IS NOT NULL)
        Batches: 1  Memory Usage: 65kB
        Rows Removed by Filter: 1
        Buffers: shared hit=383
        ->  Index Scan using messages_organization_sent_idx on messages  (cost=0.42..462.60 rows=1152 width=28) (actual time=0.036..1.491 rows=4231.00 loops=1)
              Index Cond: ((organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid) AND (sent_at >= '2026-08-31 03:00:00+00'::timestamp with time zone) AND (sent_at < '2026-09-30 03:00:00+00'::timestamp with time zone))
              Index Searches: 1
              Buffers: shared hit=383
```

## analytics 9 tiempo de primera respuesta

Resultado: valor {"population":37,"withoutResponse".

### Consulta 1 de 3

```text
duration: 0.027 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.023..0.024 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.021..0.022 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0014-4000-8000-000000000021'::uuid)
        Rows Removed by Filter: 20
        Buffers: shared hit=1
```

### Consulta 2 de 3

```text
duration: 0.055 ms  plan:
Query Text: select to_char((now() at time zone $1)::date, 'YYYY-MM-DD') as today
Query Parameters: $1 = 'America/Argentina/Buenos_Aires'
Result  (cost=0.00..0.02 rows=1 width=32) (actual time=0.051..0.052 rows=1.00 loops=1)
```

### Consulta 3 de 3

```text
duration: 3.811 ms  plan:
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
  
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '2026-08-31', $3 = 'America/Argentina/Buenos_Aires', $4 = '2026-09-29', $5 = 'America/Argentina/Buenos_Aires', $6 = '5eed0000-0014-4000-8000-000000000021', $7 = '2026-08-31', $8 = 'America/Argentina/Buenos_Aires', $9 = '2026-09-29', $10 = 'America/Argentina/Buenos_Aires', $11 = '5eed0000-0014-4000-8000-000000000021'
Aggregate  (cost=7415.48..7415.49 rows=1 width=24) (actual time=3.792..3.798 rows=1.00 loops=1)
  Buffers: shared hit=948
  CTE first_inbound
    ->  Subquery Scan on candidates  (cost=465.48..7321.66 rows=1107 width=24) (actual time=2.900..3.167 rows=38.00 loops=1)
          Buffers: shared hit=536
          ->  HashAggregate  (cost=465.48..476.55 rows=1107 width=16) (actual time=2.819..2.845 rows=38.00 loops=1)
                Group Key: messages.conversation_id
                Batches: 1  Memory Usage: 65kB
                Buffers: shared hit=383
                ->  Index Scan using messages_organization_sent_idx on messages  (cost=0.42..462.60 rows=1152 width=16) (actual time=0.041..1.547 rows=4231.00 loops=1)
                      Index Cond: ((organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid) AND (sent_at >= '2026-08-31 03:00:00+00'::timestamp with time zone) AND (sent_at < '2026-09-30 03:00:00+00'::timestamp with time zone))
                      Index Searches: 1
                      Buffers: shared hit=383
          SubPlan 2
            ->  Result  (cost=6.17..6.18 rows=1 width=8) (actual time=0.008..0.008 rows=1.00 loops=38)
                  Buffers: shared hit=153
                  InitPlan 1
                    ->  Limit  (cost=0.42..6.17 rows=1 width=8) (actual time=0.006..0.006 rows=0.97 loops=38)
                          Buffers: shared hit=153
                          ->  Index Scan using messages_conversation_sent_idx on messages m  (cost=0.42..6.17 rows=1 width=8) (actual time=0.005..0.005 rows=0.97 loops=38)
                                Index Cond: (conversation_id = candidates.conversation_id)
                                Filter: ((organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid) AND (direction = 'inbound'::message_direction))
                                Rows Removed by Filter: 0
                                Index Searches: 38
                                Buffers: shared hit=153
  ->  CTE Scan on first_inbound  (cost=0.00..27.68 rows=6 width=24) (actual time=2.906..3.193 rows=37.00 loops=1)
        Filter: ((sent_at >= '2026-08-31 03:00:00+00'::timestamp with time zone) AND (sent_at < '2026-09-30 03:00:00+00'::timestamp with time zone))
        Rows Removed by Filter: 1
        Storage: Memory  Maximum Storage: 18kB
        Buffers: shared hit=536
  SubPlan 5
    ->  Result  (cost=3.66..3.67 rows=1 width=8) (actual time=0.004..0.005 rows=1.00 loops=37)
          Buffers: shared hit=144
          InitPlan 4
            ->  Limit  (cost=0.42..3.66 rows=1 width=8) (actual time=0.004..0.004 rows=0.84 loops=37)
                  Buffers: shared hit=144
                  ->  Index Scan using messages_conversation_sent_idx on messages m_1  (cost=0.42..3.66 rows=1 width=8) (actual time=0.003..0.003 rows=0.84 loops=37)
                        Index Cond: ((conversation_id = first_inbound.conversation_id) AND (sent_at > first_inbound.sent_at))
                        Filter: ((organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid) AND (direction = 'outbound'::message_direction))
                        Rows Removed by Filter: 0
                        Index Searches: 37
                        Buffers: shared hit=144
  SubPlan 9
    ->  Result  (cost=3.66..3.67 rows=1 width=8) (actual time=0.004..0.004 rows=1.00 loops=37)
          Buffers: shared hit=144
          InitPlan 8
            ->  Limit  (cost=0.42..3.66 rows=1 width=8) (actual time=0.004..0.004 rows=0.84 loops=37)
                  Buffers: shared hit=144
                  ->  Index Scan using messages_conversation_sent_idx on messages m_3  (cost=0.42..3.66 rows=1 width=8) (actual time=0.003..0.003 rows=0.84 loops=37)
                        Index Cond: ((conversation_id = first_inbound.conversation_id) AND (sent_at > first_inbound.sent_at))
                        Filter: ((organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid) AND (direction = 'outbound'::message_direction))
                        Rows Removed by Filter: 0
                        Index Searches: 37
                        Buffers: shared hit=144
  SubPlan 7
    ->  Result  (cost=3.66..3.67 rows=1 width=8) (actual time=0.004..0.004 rows=1.00 loops=31)
          Buffers: shared hit=124
          InitPlan 6
            ->  Limit  (cost=0.42..3.66 rows=1 width=8) (actual time=0.004..0.004 rows=1.00 loops=31)
                  Buffers: shared hit=124
                  ->  Index Scan using messages_conversation_sent_idx on messages m_2  (cost=0.42..3.66 rows=1 width=8) (actual time=0.003..0.003 rows=1.00 loops=31)
                        Index Cond: ((conversation_id = first_inbound.conversation_id) AND (sent_at > first_inbound.sent_at))
                        Filter: ((organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid) AND (direction = 'outbound'::message_direction))
                        Rows Removed by Filter: 0
                        Index Searches: 31
                        Buffers: shared hit=124
```

## analytics 11 distribución de estado

Resultado: valor {"open":10,"pending":14,"closed":1.

### Consulta 1 de 3

```text
duration: 0.030 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.025..0.026 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.023..0.023 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0014-4000-8000-000000000021'::uuid)
        Rows Removed by Filter: 20
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
duration: 3.189 ms  plan:
Query Text: select count(*) filter (where "status" = 'open'), count(*) filter (where "status" = 'pending'), count(*) filter (where "status" = 'closed') from "conversations" where ("conversations"."organization_id" = $1 and "conversations"."id" in (select distinct "conversation_id" from "messages" where ("messages"."organization_id" = $2 and "messages"."sent_at" >= ($3::date::timestamp at time zone $4) and "messages"."sent_at" < (($5::date + 1)::timestamp at time zone $6))))
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '5eed0000-0014-4000-8000-000000000021', $3 = '2026-08-31', $4 = 'America/Argentina/Buenos_Aires', $5 = '2026-09-29', $6 = 'America/Argentina/Buenos_Aires'
Aggregate  (cost=581.78..581.79 rows=1 width=24) (actual time=3.171..3.175 rows=1.00 loops=1)
  Buffers: shared hit=392
  ->  Hash Join  (cost=567.45..581.42 rows=24 width=4) (actual time=3.117..3.159 rows=38.00 loops=1)
        Hash Cond: (messages.conversation_id = conversations.id)
        Buffers: shared hit=392
        ->  HashAggregate  (cost=465.48..476.55 rows=1107 width=16) (actual time=2.638..2.659 rows=38.00 loops=1)
              Group Key: messages.conversation_id
              Batches: 1  Memory Usage: 65kB
              Buffers: shared hit=383
              ->  Index Scan using messages_organization_sent_idx on messages  (cost=0.42..462.60 rows=1152 width=16) (actual time=0.028..1.491 rows=4231.00 loops=1)
                    Index Cond: ((organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid) AND (sent_at >= '2026-08-31 03:00:00+00'::timestamp with time zone) AND (sent_at < '2026-09-30 03:00:00+00'::timestamp with time zone))
                    Index Searches: 1
                    Buffers: shared hit=383
        ->  Hash  (cost=98.21..98.21 rows=301 width=20) (actual time=0.468..0.469 rows=301.00 loops=1)
              Buckets: 1024  Batches: 1  Memory Usage: 24kB
              Buffers: shared hit=9
              ->  Index Scan using conversations_organization_id_id_unique on conversations  (cost=0.29..98.21 rows=301 width=20) (actual time=0.034..0.390 rows=301.00 loops=1)
                    Index Cond: (organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid)
                    Index Searches: 1
                    Buffers: shared hit=9
```

## analytics 12 errores de ingestión

Resultado: valor {"status":"value","total":21,"fail.

### Consulta 1 de 3

```text
duration: 0.026 ms  plan:
Query Text: select "timezone" from "organizations" where "organizations"."id" = $1 limit $2
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '1'
Limit  (cost=0.00..1.26 rows=1 width=31) (actual time=0.022..0.022 rows=1.00 loops=1)
  Buffers: shared hit=1
  ->  Seq Scan on organizations  (cost=0.00..1.26 rows=1 width=31) (actual time=0.020..0.020 rows=1.00 loops=1)
        Filter: (id = '5eed0000-0014-4000-8000-000000000021'::uuid)
        Rows Removed by Filter: 20
        Buffers: shared hit=1
```

### Consulta 2 de 3

```text
duration: 0.021 ms  plan:
Query Text: select to_char((now() at time zone $1)::date, 'YYYY-MM-DD') as today
Query Parameters: $1 = 'America/Argentina/Buenos_Aires'
Result  (cost=0.00..0.02 rows=1 width=32) (actual time=0.018..0.019 rows=1.00 loops=1)
```

### Consulta 3 de 3

```text
duration: 0.467 ms  plan:
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
  
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '2026-08-31', $3 = 'America/Argentina/Buenos_Aires', $4 = '2026-09-29', $5 = 'America/Argentina/Buenos_Aires'
Result  (cost=11.84..11.85 rows=1 width=40) (actual time=0.458..0.461 rows=1.00 loops=1)
  Buffers: shared hit=17
  CTE events
    ->  Index Scan using ingestion_events_organization_received_idx on ingestion_events  (cost=0.29..10.61 rows=17 width=26) (actual time=0.322..0.347 rows=21.00 loops=1)
          Index Cond: ((organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid) AND (received_at >= '2026-08-31 03:00:00+00'::timestamp with time zone) AND (received_at < '2026-09-30 03:00:00+00'::timestamp with time zone))
          Filter: (event_type <> ALL ('{client.resolved,conversation.escalated}'::text[]))
          Index Searches: 1
          Buffers: shared hit=17
  InitPlan 2
    ->  Aggregate  (cost=0.38..0.40 rows=1 width=4) (actual time=0.374..0.375 rows=1.00 loops=1)
          Buffers: shared hit=17
          ->  CTE Scan on events  (cost=0.00..0.34 rows=17 width=0) (actual time=0.328..0.365 rows=21.00 loops=1)
                Storage: Memory  Maximum Storage: 17kB
                Buffers: shared hit=17
  InitPlan 3
    ->  Aggregate  (cost=0.39..0.40 rows=1 width=4) (actual time=0.013..0.014 rows=1.00 loops=1)
          ->  CTE Scan on events events_1  (cost=0.00..0.38 rows=1 width=0) (actual time=0.007..0.009 rows=2.00 loops=1)
                Filter: (status = 'failed'::ingestion_event_status)
                Rows Removed by Filter: 19
                Storage: Memory  Maximum Storage: 17kB
  InitPlan 4
    ->  Aggregate  (cost=0.43..0.44 rows=1 width=32) (actual time=0.061..0.062 rows=1.00 loops=1)
          ->  Sort  (cost=0.41..0.42 rows=1 width=68) (actual time=0.037..0.038 rows=2.00 loops=1)
                Sort Key: ((count(*))::integer) DESC, events_2.source, events_2.error_code
                Sort Method: quicksort  Memory: 25kB
                ->  HashAggregate  (cost=0.39..0.40 rows=1 width=68) (actual time=0.015..0.016 rows=2.00 loops=1)
                      Group Key: events_2.source, events_2.error_code
                      Batches: 1  Memory Usage: 32kB
                      ->  CTE Scan on events events_2  (cost=0.00..0.38 rows=1 width=64) (actual time=0.004..0.007 rows=2.00 loops=1)
                            Filter: (status = 'failed'::ingestion_event_status)
                            Rows Removed by Filter: 19
                            Storage: Memory  Maximum Storage: 17kB
```
