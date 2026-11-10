#!/usr/bin/env node
/** Read-only contract checks for the deliberately synthetic Catalog Hub fixtures. */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const jsonPath = resolve(root, "fixtures/catalog-hub/product.fixture.json");
const csvPath = resolve(root, "fixtures/catalog-hub/products.fixture.csv");
const errors = [];
const requiredCsv = ["fixture", "product_id", "product_title", "product_description", "variant_id", "variant_title", "sku", "original_price", "currency", "inventory", "images", "source_name", "source_url", "source_record_id", "license_name", "license_url", "license_attribution"];

function assert(condition, message) { if (!condition) errors.push(message); }
function https(value, label) { assert(typeof value === "string" && value.startsWith("https://"), `${label} must be HTTPS`); }

const document = JSON.parse(await readFile(jsonPath, "utf8"));
assert(document.schema_version === "catalog-hub.product.v1", "JSON schema_version is incorrect");
assert(document.fixture === true, "JSON fixture marker must be true");
const product = document.product;
assert(Boolean(product?.id && product?.title), "JSON product id/title are required");
https(product?.source?.url, "JSON source.url");
https(product?.license?.url, "JSON license.url");
const skus = new Set();
for (const image of product?.images ?? []) { https(image.url, "JSON image.url"); https(image.license?.url, "JSON image.license.url"); }
for (const variant of product?.variants ?? []) {
  assert(!skus.has(variant.sku), `duplicate JSON SKU: ${variant.sku}`); skus.add(variant.sku);
  assert(Number.isFinite(variant.original_price) && variant.original_price > 0, `invalid JSON price: ${variant.sku}`);
  assert(/^[A-Z]{3}$/.test(variant.currency), `invalid JSON currency: ${variant.sku}`);
  assert(Number.isInteger(variant.inventory) && variant.inventory >= 0, `invalid JSON inventory: ${variant.sku}`);
}

// Small RFC-4180-compatible parser sufficient for validating fixture data (including quoted cells).
function parseCsv(text) {
  const rows = []; let row = []; let cell = ""; let quoted = false;
  for (let i = 0; i < text.length; i++) { const c = text[i];
    if (quoted && c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
    else if (c === '"' && cell === "" && !quoted) quoted = true;
    else if (c === '"' && quoted) quoted = false;
    else if (c === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((c === "\n" || c === "\r") && !quoted) { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some(Boolean));
}
const rows = parseCsv(await readFile(csvPath, "utf8"));
assert(JSON.stringify(rows[0]) === JSON.stringify(requiredCsv), "CSV header does not match the contract");
const indexes = Object.fromEntries(requiredCsv.map((name, index) => [name, index]));
const csvSkus = new Set();
for (const [line, row] of rows.slice(1).entries()) {
  const at = (name) => row[indexes[name]];
  assert(at("fixture") === "true", `CSV row ${line + 2} fixture marker must be true`);
  assert(row.length === requiredCsv.length, `CSV row ${line + 2} has wrong column count`);
  https(at("source_url"), `CSV row ${line + 2} source_url`); https(at("license_url"), `CSV row ${line + 2} license_url`);
  for (const url of at("images").split("|")) https(url, `CSV row ${line + 2} image URL`);
  assert(!csvSkus.has(at("sku")), `duplicate CSV SKU: ${at("sku")}`); csvSkus.add(at("sku"));
  assert(Number(at("original_price")) > 0 && /^\d+(\.\d{1,2})?$/.test(at("original_price")), `invalid CSV price on row ${line + 2}`);
  assert(/^[A-Z]{3}$/.test(at("currency")), `invalid CSV currency on row ${line + 2}`);
  assert(/^\d+$/.test(at("inventory")), `invalid CSV inventory on row ${line + 2}`);
}

if (errors.length) { console.error(errors.map((error) => `✗ ${error}`).join("\n")); process.exit(1); }
console.log(`Catalog Hub fixtures valid: ${product.variants.length} JSON variants, ${rows.length - 1} CSV rows (read-only).`);
