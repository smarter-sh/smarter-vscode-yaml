import * as path from "path";
import * as fs from "fs";
import axios from "axios";
import RefParser from "json-schema-ref-parser";
import * as vscode from "vscode";

const defaultRootUrl = "https://platform.smarter.sh";
const rootUrl =
  vscode.workspace.getConfiguration("smarterYaml").get<string>("rootUrl") ||
  defaultRootUrl;
console.log("Configured rootUrl:", rootUrl);

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
  rootSchema: any = schema, // Pass the root schema to retain $defs
  visited: Set<any> = new Set(), // Track visited schemas
): any {
  if (!schema) {
    console.error("Invalid schema.");
    return null;
  }

  // Prevent revisiting the same schema
  if (visited.has(schema)) {
    console.warn(
      "Already visited schema, skipping to prevent infinite loop:",
      schema,
    );
    return null;
  }
  visited.add(schema);

  //console.log("Schema passed to findPropertyInSchema:", schema);
  //console.log("Schema $defs keys in findPropertyInSchema:", Object.keys(rootSchema.$defs || {}));

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
    // Strip the '#/$defs/' or '#/' prefix from the $ref path
    const refPath = schema.$ref.startsWith("#/$defs/")
      ? schema.$ref.substring("#/$defs/".length)
      : schema.$ref.startsWith("#/")
        ? schema.$ref.substring("#/".length)
        : schema.$ref;

    // Debug log to inspect the $defs and refPath
    console.log("Schema $defs keys:", Object.keys(rootSchema.$defs || {}));
    console.log("Resolving $ref path:", refPath);

    // Check if the $defs section exists and contains the referenced schema
    if (rootSchema.$defs && rootSchema.$defs[refPath]) {
      const refSchema = rootSchema.$defs[refPath];
      console.log(`Resolved $ref '${schema.$ref}' to '${refPath}' in $defs.`);
      return findPropertyInSchema(
        property,
        refSchema,
        path,
        currentPath,
        rootSchema,
        visited,
      );
    } else {
      console.error(
        `$ref '${schema.$ref}' could not be resolved. Ensure the $defs section contains '${refPath}'.`,
      );
      return null;
    }
  }

  // Recurse into child keys of the current schema
  if (schema.properties) {
    for (const key of Object.keys(schema.properties)) {
      const childSchema = schema.properties[key];
      const result = findPropertyInSchema(
        property,
        childSchema,
        path,
        `${currentPath}${key}.`,
        rootSchema, // Pass the root schema
        visited, // Pass the visited set
      );
      if (result) {
        return result;
      }
    }
  }

  // Handle $defs explicitly
  if (rootSchema.$defs) {
    for (const [key, defSchema] of Object.entries(rootSchema.$defs)) {
      const result = findPropertyInSchema(
        property,
        defSchema,
        path,
        `${currentPath}${key}.`,
        rootSchema, // Pass the root schema
        visited, // Pass the visited set
      );
      if (result) {
        return result;
      }
    }
  }

  return null;
}

export async function getSchemaForKind(kind: string): Promise<Schema | null> {
  if (schemaCache.has(kind)) {
    return schemaCache.get(kind) || null;
  }

  let schema: Schema | null = null;

  // Try fetching the schema from the API
  try {
    const apiUrl = `${rootUrl}/api/v1/cli/schema/${kind}`;
    const response = await axios.get(apiUrl);
    schema = response.data?.data as Schema;

    if (schema) {
      console.log(
        `getSchemaForKind() successfully fetched schema for kind: ${kind} from API (${apiUrl})`,
        schema,
      );
      console.log(
        "Fetched schema $defs keys:",
        Object.keys(schema.$defs || {}),
      );
      schemaCache.set(kind, schema);
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

  if (fs.existsSync(schemaPath)) {
    try {
      const schema = (await RefParserTyped.dereference(schemaPath)) as Schema;
      console.log(
        `Cache miss. Loading schema for kind: ${kind} from ${schemaPath}`,
      );
      schemaCache.set(kind, schema);
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
