import { useRef, useState } from "react";
import type { CertificateListItem } from "~/features/certificates/types/certificates.types";
import { thumbnailUrl } from "~/features/media/utils/media.utils";
import { useDomEvent } from "~/shared/hooks/use-dom-event.hook";

const PLACEHOLDER_SRC = "/images/no-photo.svg";

export function GridCard({ row }: { row: CertificateListItem }) {
  const imageRef = useRef<HTMLElementTagNameMap["s-image"]>(null);
  const photoSrc = row.imageUrl ? thumbnailUrl(row.imageUrl, 400) : null;
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const shownSrc =
    photoSrc !== null && photoSrc !== brokenSrc ? photoSrc : PLACEHOLDER_SRC;

  useDomEvent(imageRef, "error", () => setBrokenSrc(photoSrc));

  return (
    <s-box
      border="base"
      borderRadius="base"
      overflow="hidden"
      background="base"
    >
      <s-clickable
        href={`/app/certificates/${row.id}`}
        accessibilityLabel={`Open certificate ${row.code}`}
      >
        <s-image
          ref={imageRef}
          src={shownSrc}
          alt=""
          accessibilityRole="presentation"
          aspectRatio="1/1"
          objectFit="cover"
          loading="lazy"
        />
        <s-divider />
        <s-box padding="small">
          <s-stack gap="small-300">
            <s-heading fontSize="base" lineClamp={1}>
              {row.code}
            </s-heading>
            <s-paragraph lineClamp={1}>{row.signedBy || "—"}</s-paragraph>
            <s-paragraph lineClamp={1} color="subdued">
              {row.item}
            </s-paragraph>
          </s-stack>
        </s-box>
      </s-clickable>
    </s-box>
  );
}
