import { docs } from "collections/server";
import { loader } from "fumadocs-core/source";

/**
 * Content source for the staff documentation site at /docs.
 *
 * The docs are part of the application build (not a separate deployment), so
 * they use the same components and can link to the product's screenshots.
 */
export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
});
