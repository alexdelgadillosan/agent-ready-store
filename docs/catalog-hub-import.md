# Catalog Hub import contract

This repository defines a **portable import format only**. It does not import, publish,
or sync anything to Shopify. A future importer must perform a dry run, verify ownership
of source material and licenses, and require an explicit operator action before writing
to any commerce system.

## JSON

The canonical format is one envelope per product, described by
`schemas/catalog-hub-product.schema.json`. Every variant carries its own `sku`,
`original_price`, three-letter ISO currency, and non-negative integer `inventory`.
Product-level provenance is required (`source` and `license`); every image also has
its own license so image rights cannot be inferred accidentally.

`original_price` is the source/list price before any downstream promotion. It is not a
Shopify price and must not be used to create an order without a separate pricing review.

## CSV

CSV is a flattened, one-row-per-variant representation. Product fields repeat across
rows for the same `product_id`. The exact header is:

```text
fixture,product_id,product_title,product_description,variant_id,variant_title,sku,original_price,currency,inventory,images,source_name,source_url,source_record_id,license_name,license_url,license_attribution
```

`images` is a pipe-separated list of HTTPS URLs. CSV values containing commas, quotes,
or newlines must use standard RFC 4180 quoting. An importer must reject a product when
rows disagree on repeated product/provenance fields, when SKU is duplicated, or when
an image/source/license URL is not HTTPS. CSV has no implicit defaults.

The repository fixtures are intentionally marked with `fixture=true`, synthetic names,
and `example.invalid` URLs. They are not a catalog, inventory, recommendation, or
commercial pricing source.

## Safety boundary

There is deliberately no API route, Shopify mutation, credential use, or database table
for this contract. Validation is local and read-only:

```bash
npm run validate:catalog-hub
```
