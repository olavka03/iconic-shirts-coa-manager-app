import { useRef, type CSSProperties } from "react";
import type { MediaFieldActions } from "~/features/media/types/media-field.types";
import {
  fieldIdOf,
  fileNameOf,
  MEDIA_FIELD_COPY,
  type PreviewView,
} from "~/features/media/utils/media-field-view.utils";
import type { MediaKind } from "~/features/media/types/media.types";
import {
  MEDIA_MESSAGES,
  thumbnailUrl,
} from "~/features/media/utils/media.utils";
import { useDomEvent } from "~/shared/hooks/use-dom-event.hook";

const VIDEO_STYLE: CSSProperties = { inlineSize: "100%", maxBlockSize: 360 };

function ReadyPhoto({ url, onBroken }: { url: string; onBroken(): void }) {
  const imageRef = useRef<HTMLElementTagNameMap["s-image"]>(null);

  useDomEvent(imageRef, "error", onBroken);

  return (
    <s-box
      border="base"
      borderRadius="base"
      overflow="hidden"
      background="subdued"
    >
      <s-clickable
        href={url}
        target="_blank"
        accessibilityLabel="Open photo in a new tab"
      >
        <s-image
          ref={imageRef}
          src={thumbnailUrl(url, 800)}
          alt="Proof photo"
          aspectRatio="4/3"
          objectFit="contain"
        />
      </s-clickable>
    </s-box>
  );
}

function ReadyVideo({
  url,
  previewUrl,
}: {
  url: string;
  previewUrl: string | null;
}) {
  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption -- proof clips have no caption track
    <video
      controls
      preload="metadata"
      poster={previewUrl ?? undefined}
      aria-label="Proof video"
      src={url}
      style={VIDEO_STYLE}
    />
  );
}

function BrokenPhoto() {
  return (
    <s-box
      border="base"
      borderRadius="base"
      background="subdued"
      padding="base"
    >
      <s-text>{MEDIA_MESSAGES.brokenPhoto}</s-text>
    </s-box>
  );
}

export function PreviewMedia({
  kind,
  view,
  onBroken,
}: {
  kind: MediaKind;
  view: PreviewView;
  onBroken(): void;
}) {
  if (view.name === "broken") {
    return <BrokenPhoto />;
  }

  return kind === "photo" ? (
    <ReadyPhoto url={view.url} onBroken={onBroken} />
  ) : (
    <ReadyVideo url={view.url} previewUrl={view.previewUrl} />
  );
}

export function FileRow({
  kind,
  url,
  actions,
}: {
  kind: MediaKind;
  url: string;
  actions: MediaFieldActions;
}) {
  const { buttonLabels } = MEDIA_FIELD_COPY[kind];

  return (
    <s-grid gridTemplateColumns="1fr auto" alignItems="center" gap="small">
      <s-text color="subdued">{fileNameOf(url)}</s-text>
      <s-stack direction="inline" gap="small">
        <s-button
          id={fieldIdOf(kind)}
          variant="tertiary"
          accessibilityLabel={buttonLabels.replace}
          onClick={actions.pick}
        >
          Replace
        </s-button>
        <s-button
          variant="tertiary"
          accessibilityLabel={buttonLabels.remove}
          onClick={actions.remove}
        >
          Remove
        </s-button>
      </s-stack>
    </s-grid>
  );
}

export function ServerError({ message }: { message: string | null }) {
  return message ? <s-text tone="critical">{message}</s-text> : null;
}
