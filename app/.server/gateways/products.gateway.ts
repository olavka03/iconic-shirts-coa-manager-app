import {
  adminGraphql,
  type AdminClient,
  type AdminGraphqlOptions,
} from "./admin-graphql.gateway";
import type { ProductStatus } from "~/shared/types/api.types";

export type ProductSnapshot = {
  id: string;
  title: string;
  imageUrl: string | null;
  status: ProductStatus;
};

const PRODUCTS = `#graphql
  query CoaProducts($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        id
        title
        status
        featuredMedia {
          preview {
            image {
              url
            }
          }
        }
      }
    }
  }
` as const;

type ProductNode = {
  id?: string;
  title?: string;
  status?: ProductStatus;
  featuredMedia?: {
    preview?: { image?: { url: string } | null } | null;
  } | null;
} | null;

export async function getProductSnapshot(
  admin: AdminClient,
  id: string,
  options?: AdminGraphqlOptions,
): Promise<ProductSnapshot | null> {
  const data = await adminGraphql(admin, PRODUCTS, { ids: [id] }, options);
  const node: ProductNode = data.nodes[0] ?? null;

  // A deleted product comes back as null; a non-Product id as an empty object.
  if (!node?.id || node.title === undefined || !node.status) {
    return null;
  }

  return {
    id: node.id,
    title: node.title,
    imageUrl: node.featuredMedia?.preview?.image?.url ?? null,
    status: node.status,
  };
}
