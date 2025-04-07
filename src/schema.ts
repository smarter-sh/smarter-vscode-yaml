import * as path from "path";
import * as fs from "fs";
import RefParser from "json-schema-ref-parser";

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
      examples?: string[];
      properties?: Schema["properties"];
    };
  };
}

const schemaCache = new Map<string, object>();

export default async function getSchemaForKind(
  kind: string,
): Promise<Schema | null> {
  if (schemaCache.has(kind)) {
    return schemaCache.get(kind) || null;
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
