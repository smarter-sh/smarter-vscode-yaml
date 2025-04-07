declare module "json-schema-ref-parser" {
  export default class RefParser {
    static dereference(path: string): Promise<object>;
  }
}
