import type { ProductValue } from "~/features/certificates/types/certificates.types";
import type { ProductStatus } from "~/shared/types/api.types";
import type { SectionProps } from "~/features/certificates/types/certificate-form.types";

const STATUS_BADGES: Partial<
  Record<ProductStatus, { label: string; tone?: "info" }>
> = {
  DRAFT: { label: "Draft", tone: "info" },
  ARCHIVED: { label: "Archived" },
  UNLISTED: { label: "Unlisted" },
};

async function pickProduct(
  { state, dispatch }: SectionProps,
  linked: ProductValue | null,
) {
  try {
    const selected = await shopify.resourcePicker({
      type: "product",
      action: "select",
      multiple: false,
      filter: { variants: false },
      ...(linked
        ? { selectionIds: [{ id: linked.id }] }
        : { query: state.draft.item.trim() || undefined }),
    });
    const product = selected?.[0];

    if (!product) {
      return;
    }

    dispatch({
      type: "linkProduct",
      product: {
        id: product.id,
        title: product.title,
        imageUrl: product.images[0]?.originalSrc ?? null,
        status: null,
      },
    });
  } catch (error) {
    console.error(error);
  }
}

function StatusBadge({ status }: { status: ProductStatus | null }) {
  const badge = status === null ? undefined : STATUS_BADGES[status];

  if (!badge) {
    return null;
  }

  return <s-badge tone={badge.tone}>{badge.label}</s-badge>;
}

function NoProduct({ onLink }: { onLink(): void }) {
  return (
    <s-stack gap="small-200">
      <s-stack direction="inline">
        <s-button
          id="link-product"
          variant="tertiary"
          icon="product"
          onClick={onLink}
        >
          Link product
        </s-button>
      </s-stack>
      <s-text color="subdued">
        Optional. Fills in the item name from a product in your store.
      </s-text>
    </s-stack>
  );
}

type ProductRowProps = {
  product: ProductValue;
  onChange(): void;
  onRemove(): void;
};

function ProductRow({ product, onChange, onRemove }: ProductRowProps) {
  const imageUrl = product.missing ? null : product.imageUrl;

  return (
    <s-box border="base" borderRadius="base" padding="small">
      <s-grid
        gridTemplateColumns="auto 1fr auto"
        gap="small"
        alignItems="center"
      >
        <s-thumbnail
          size="small"
          src={imageUrl ?? undefined}
          alt={product.title}
        />
        <s-stack gap="small-300">
          <s-stack direction="inline" gap="small-200" alignItems="center">
            <s-text>{product.title}</s-text>
            {!product.missing && <StatusBadge status={product.status} />}
          </s-stack>
          {product.missing && (
            <s-text color="subdued">
              This product is no longer in your store.
            </s-text>
          )}
        </s-stack>
        <s-stack direction="inline" gap="small-200">
          {!product.missing && (
            <s-button
              id="link-product"
              variant="tertiary"
              accessibilityLabel="Change linked product"
              onClick={onChange}
            >
              Change
            </s-button>
          )}
          <s-button
            id={product.missing ? "link-product" : undefined}
            variant="tertiary"
            accessibilityLabel="Remove linked product"
            onClick={onRemove}
          >
            Remove
          </s-button>
        </s-stack>
      </s-grid>
    </s-box>
  );
}

export function LinkedProduct(props: SectionProps) {
  const { state, dispatch } = props;
  const linked = state.draft.product;

  if (linked === null) {
    return <NoProduct onLink={() => void pickProduct(props, null)} />;
  }

  return (
    <ProductRow
      product={linked}
      onChange={() => void pickProduct(props, linked)}
      onRemove={() => dispatch({ type: "removeProduct" })}
    />
  );
}
