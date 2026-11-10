import { readFile } from "node:fs/promises";
import { validateCatalogInput } from "../lib/catalog-hub";

async function main() {
  const json = JSON.parse(await readFile("fixtures/catalog-hub/product.fixture.json", "utf8"));
  const csv = await readFile("fixtures/catalog-hub/products.fixture.csv", "utf8");
  const jsonResult = validateCatalogInput(json);
  const csvResult = validateCatalogInput(csv, "csv");
  if (jsonResult.productCount !== 1 || jsonResult.variantCount !== 2 || !jsonResult.fixture) throw new Error("JSON fixture import validation failed");
  if (csvResult.productCount !== 1 || csvResult.variantCount !== 2 || !csvResult.fixture) throw new Error("CSV fixture import validation failed");
  console.log("Catalog Hub import validation passed for JSON and CSV fixtures.");
}

void main();
