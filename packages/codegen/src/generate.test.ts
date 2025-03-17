import { describe, it, expect } from "vitest";
import ApiGenerator, {
  getOperationName,
  isJsonMimeType,
  isMimeType,
} from "./generate";
import { printNode } from "./tscodegen";
import { OpenAPIV3 } from "openapi-types";

describe("getOperationName", () => {
  it("should use the id", () => {
    expect(getOperationName("GET", "/pets", "list pets")).toEqual("listPets");
  });
  it("should use the verb and path", () => {
    expect(getOperationName("GET", "/pets/{color}/{status}")).toEqual(
      "getPetsByColorAndStatus",
    );
  });
  it("should not use ids with special chars", () => {
    expect(
      getOperationName("GET", "/pets", "API\\PetController::listPetAction"),
    ).toEqual("getPets");
  });
});

describe("content types", () => {
  it("should identify strings that look like mime types", () => {
    expect(isMimeType("*/*")).toBe(true);
    expect(isMimeType("foo/bar")).toBe(true);
    expect(isMimeType("foo/bar+baz")).toBe(true);
    expect(isMimeType(undefined)).toBe(false);
    expect(isMimeType("")).toBe(false);
    expect(isMimeType("foo")).toBe(false);
    expect(isMimeType("foo/bar/boo")).toBe(false);
  });

  it("should treat some content types as json", () => {
    expect(isJsonMimeType("application/json")).toBe(true);
    expect(isJsonMimeType("application/json+foo")).toBe(true);
    expect(isJsonMimeType("*/*")).toBe(true);
    expect(isJsonMimeType("text/plain")).toBe(false);
  });
});

describe("getBaseTypeFromSchema", () => {
  it("should generate type with required properties when extending a schema with the 'allOf' operator", () => {
    const generator = new ApiGenerator({} as unknown as OpenAPIV3.Document);
    const node = generator.getBaseTypeFromSchema(
      {
        type: "object",
        allOf: [
          {
            type: "object",
            properties: {
              firstName: {
                type: "string",
              },
              secondName: {
                type: "string",
              },
            },
          },
        ],
        required: ["firstName"],
      },
      "Person",
    );

    expect(printNode(node)).toMatchInlineSnapshot(`
      "{
          firstName: string;
          secondName?: string;
      }"
    `);
  });
});

describe("union types defined by type: array", () => {
  it("should generate a union type", () => {
    const generator = new ApiGenerator({} as unknown as OpenAPIV3.Document);
    const node = generator.getBaseTypeFromSchema(
      {
        type: "object",
        properties: {
          instances: {
            type: ["array", "null"],
            items: {
              type: "string",
            },
          },
        },
      },
      "LoadBalancerLatestTelemetryController",
    );

    expect(printNode(node)).toMatchInlineSnapshot(`
      "{
          instances?: string[] | null;
      }"
    `);
  });
});

describe.only("nullable openapi 3.1", () => {
  it("should generate a string | null", () => {
    const generator = new ApiGenerator({} as unknown as OpenAPIV3.Document);
    const node = generator.getBaseTypeFromSchema({
      type: "object",
      properties: {
        lastName: { type: ["string", "null"], example: "Doe" },
      },
    });

    expect(printNode(node)).toMatchInlineSnapshot(`
      "{
          lastName?: string | null;
      }"
    `);
  });

  it("works with $ref", () => {
    const spec = {
      components: {
        schemas: {
          UserDTO: {
            type: ["object", "null"],
            properties: {
              firstName: { type: "string" },
            },
          },
        },
      },
    } as unknown as OpenAPIV3.Document;

    const generator = new ApiGenerator(spec);

    const node = generator.getBaseTypeFromSchema({
      type: "object",
      properties: {
        id: {
          type: "string",
          example: "70a76f01-c455-4b24-a980-15953733325e",
        },
        user: {
          $ref: "#/components/schemas/UserDTO",
        },
      },
    });

    expect(printNode(node)).toMatchInlineSnapshot(`
      "{
          id?: string;
          user?: UserDto;
      }"
    `);
  });

  it("anyOf workaround", () => {
    const spec = {
      components: {
        schemas: {
          UserDTO: {
            type: ["object", "null"],
            properties: {
              firstName: { type: "string" },
            },
          },
        },
      },
    } as unknown as OpenAPIV3.Document;

    const generator = new ApiGenerator(spec);

    const node = generator.getBaseTypeFromSchema({
      type: "object",
      properties: {
        id: {
          type: "string",
          example: "70a76f01-c455-4b24-a980-15953733325e",
        },
        user: {
          type: "object",
          anyOf: [{ $ref: "#/components/schemas/UserDTO" }, { type: "null" }],
        },
      },
    });

    expect(printNode(node)).toMatchInlineSnapshot(`
      "{
          id?: string;
          user?: UserDto | null;
      }"
    `);
  });
});

describe("getUnionType", () => {
  describe("discriminator with propertyName", () => {
    describe("propertyName doesn’t exists", () => {
      it("should use the schema’s name as variant name", () => {
        const spec = {
          components: {
            schemas: {
              LoginSuccess: {
                type: "object",
                properties: {},
              },
              LoginRedirect: {
                type: "object",
                properties: {},
              },
            },
          },
        } as unknown as OpenAPIV3.Document;
        const generator = new ApiGenerator(spec);
        const variants = [
          {
            $ref: "#/components/schemas/LoginSuccess",
          },
          {
            $ref: "#/components/schemas/LoginRedirect",
          },
        ];

        const discriminator = { propertyName: "response_type" };
        const unionTypeNode = generator.getUnionType(variants, discriminator);
        const result = printNode(unionTypeNode);
        expect(result).toMatchInlineSnapshot(`
          "({
              response_type: "LoginSuccess";
          } & LoginSuccess) | ({
              response_type: "LoginRedirect";
          } & LoginRedirect)"
        `);
      });
    });

    describe("propertyName exists and leads to an enum", () => {
      it("should use the enum given as variant name", () => {
        const spec = {
          components: {
            schemas: {
              LoginSuccess: {
                type: "object",
                properties: {
                  response_type: {
                    type: "string",
                    enum: ["success"],
                  },
                },
              },
              LoginRedirect: {
                type: "object",
                properties: {
                  response_type: {
                    type: "string",
                    enum: ["redirect"],
                  },
                },
              },
            },
          },
        } as unknown as OpenAPIV3.Document;
        const generator = new ApiGenerator(spec);
        const variants = [
          {
            $ref: "#/components/schemas/LoginSuccess",
          },
          {
            $ref: "#/components/schemas/LoginRedirect",
          },
        ];

        const discriminator = { propertyName: "response_type" };
        const unionTypeNode = generator.getUnionType(variants, discriminator);
        const result = printNode(unionTypeNode);
        expect(result).toMatchInlineSnapshot(`
          "({
              response_type: "success";
          } & LoginSuccess) | ({
              response_type: "redirect";
          } & LoginRedirect)"
        `);
      });
    });
  });
});
