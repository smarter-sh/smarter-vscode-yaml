import * as path from "path";
import * as fs from "fs";
import RefParser from "json-schema-ref-parser";
import axios from "axios";

interface RefParserType {
  dereference(path: string): Promise<object>;
}
export const RefParserTyped: RefParserType =
  RefParser as unknown as RefParserType;

interface Schema {
  properties?: {
    [key: string]: {
      type?: string;
      description?: string;
      title?: string;
      examples?: string[];
      properties?: Schema["properties"];
      anyOf?: Array<{ type?: string; $ref?: string }>;
      default?: any;
      $ref?: string;
      required?: string[];
      format?: string;
    };
  };
  required?: string[];
  $defs?: {
    [key: string]: Schema;
  };
  title?: string;
  description?: string;
  type?: string;
}

const schemaCache = new Map<string, object>();

export function findPropertyInSchema(
  property: string,
  schema: any,
  path: string[] = [],
  currentPath: string = "",
): any {
  console.log(
    `findPropertyInSchema() called with property: '${property}', currentPath: '${currentPath}'`,
  );

  if (!schema) {
    console.error("Invalid schema.");
    return null;
  }

  // Check if the property exists at the current level
  if (schema.properties && schema.properties[property]) {
    console.log(
      `Property '${property}' found at path: '${currentPath}${property}'`,
    );
    return {
      ...schema.properties[property],
      fullPath: `${currentPath}${property}`,
    };
  }

  // If the schema has a $ref, resolve it and continue searching
  if (schema.$ref) {
    const refPath = schema.$ref.replace("#/$defs/", "");
    console.log(`Resolving $ref: '${schema.$ref}'`);
    const refSchema = schema.$defs?.[refPath];
    if (!refSchema) {
      console.error(`$ref '${schema.$ref}' could not be resolved.`);
      return null;
    }
    return findPropertyInSchema(property, refSchema, path, currentPath);
  }

  // Recurse into child keys of the current schema
  if (schema.properties) {
    for (const key of Object.keys(schema.properties)) {
      console.log(
        `Descending into child key: '${key}' at path: '${currentPath}${key}.'`,
      );
      const childSchema = schema.properties[key];
      const result = findPropertyInSchema(
        property,
        childSchema,
        path,
        `${currentPath}${key}.`,
      );
      if (result) {
        return result;
      }
    }
  }

  // Handle $defs explicitly
  if (schema.$defs) {
    for (const [key, defSchema] of Object.entries(schema.$defs)) {
      console.log(`Searching in $defs key: '${key}'`);
      const result = findPropertyInSchema(
        property,
        defSchema,
        path,
        `${currentPath}${key}.`,
      );
      if (result) {
        return result;
      }
    }
  }

  console.log(
    `Property '${property}' not found at current path: '${currentPath}'. Backtracking...`,
  );
  return null;
}

export async function getSchemaForKind(kind: string): Promise<Schema | null> {
  if (schemaCache.has(kind)) {
    return schemaCache.get(kind) || null;
  }

  const apiUrl = `https://platform.smarter.sh/api/v1/cli/schema/${kind}`;

  let schema: Schema | null = null;

  // Try fetching the schema from the API
  try {
    const response = await axios.get(apiUrl);
    schema = response.data?.data as Schema;

    if (schema) {
      console.log(
        `getSchemaForKind() successfully fetched schema for kind: ${kind} from API`,
        schema,
      );
      schemaCache.set(kind, schema); // Cache the resolved schema
      return schema;
    } else {
      console.error(
        `Schema for kind '${kind}' is missing in the API response.`,
      );
    }
  } catch (error) {
    console.error(
      `Failed to fetch schema for kind '${kind}' from API. Falling back to local file. Error:`,
      error,
    );
  }

  const schemaPath = path.join(
    __dirname,
    `../schemas/${kind.toLowerCase()}.json`,
  );
  console.log(
    `Cache miss. Loading schema for kind: ${kind} from ${schemaPath}`,
  );

  if (fs.existsSync(schemaPath)) {
    try {
      const schema = (await RefParserTyped.dereference(schemaPath)) as Schema;
      schemaCache.set(kind, schema); // Cache the resolved schema
      return schema;
    } catch (error) {
      console.error(`Failed to resolve schema for kind '${kind}':`, error);
      return null;
    }
  }

  console.error(
    `getSchemaForKind() schema for kind '${kind}' not found at path: ${schemaPath}`,
  );
  return null;
}
