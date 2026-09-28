import { useRef } from "react";
import { useFilePolling } from "~/features/media/hooks/use-file-polling.hook";
import { requestJson } from "~/shared/utils/json-request.utils";
import type {
  CertificateDetail,
  UpdateResponse,
} from "~/features/certificates/types/certificates.types";
import type { MediaStatus } from "~/features/media/types/media.types";

export function useMediaCompletion(
  certificateId: string | null,
  pendingFileIds: string[],
  onCompleted: (certificate: CertificateDetail) => void,
) {
  const requestPending = useRef(false);

  const complete = async (id: string) => {
    if (requestPending.current) {
      return;
    }

    requestPending.current = true;
    const result = await requestJson<UpdateResponse>(
      `/api/certificates/${id}`,
      { body: { intent: "complete-media" } },
    );
    requestPending.current = false;

    if (result.ok) {
      onCompleted(result.certificate);
    }
  };

  useFilePolling(pendingFileIds, {
    kind: "mixed",
    enabled: certificateId !== null,
    onStatuses: (files: MediaStatus[]) => {
      if (
        certificateId !== null &&
        files.some((file) => file.status !== "processing")
      ) {
        void complete(certificateId);
      }
    },
  });
}
