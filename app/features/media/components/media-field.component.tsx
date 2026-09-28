import { useMediaField } from "~/features/media/hooks/use-media-field.hook";
import type {
  MediaFieldActions,
  MediaFieldProps,
} from "~/features/media/types/media-field.types";
import {
  MEDIA_FIELD_COPY,
  type View,
} from "~/features/media/utils/media-field-view.utils";
import type { MediaKind } from "~/features/media/types/media.types";
import { BusyLine, PickPanel, UrlPanel } from "./media-field-panels.component";
import { PoliteAnnouncement } from "~/shared/components/polite-announcement.component";
import { FileRow, PreviewMedia, ServerError } from "./media-preview.component";

function MediaView({
  kind,
  view,
  serverError,
  pickerAvailable,
  actions,
}: {
  kind: MediaKind;
  view: View;
  serverError: string | null;
  pickerAvailable: boolean;
  actions: MediaFieldActions;
}) {
  const copy = MEDIA_FIELD_COPY[kind];

  switch (view.name) {
    case "pick":
      return (
        <PickPanel
          kind={kind}
          view={view}
          pickerAvailable={pickerAvailable}
          actions={actions}
        />
      );
    case "url":
      return (
        <UrlPanel
          kind={kind}
          checking={view.checking}
          error={view.error}
          actions={actions}
        />
      );
    case "adding":
      return <BusyLine label={copy.adding} />;
    case "processing":
      return (
        <s-stack gap="small">
          <BusyLine
            label={copy.processing}
            details={copy.processingDetails ?? undefined}
          />
          <ServerError message={serverError} />
        </s-stack>
      );
    default:
      return (
        <s-stack gap="small">
          <PreviewMedia
            kind={kind}
            view={view}
            onBroken={() => actions.markBroken(view.url)}
          />
          <FileRow kind={kind} url={view.url} actions={actions} />
          <ServerError message={serverError} />
        </s-stack>
      );
  }
}

export function MediaField(props: MediaFieldProps) {
  const { view, pickerAvailable, announcement, actions } = useMediaField(props);

  return (
    <>
      <MediaView
        kind={props.kind}
        view={view}
        serverError={props.serverError}
        pickerAvailable={pickerAvailable}
        actions={actions}
      />
      <PoliteAnnouncement message={announcement} />
    </>
  );
}
