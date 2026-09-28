import type { ProofLabel } from "~/features/certificates/types/certificates.types";

export function proofLabel(hasPhoto: boolean, hasVideo: boolean): ProofLabel {
  if (hasPhoto && hasVideo) {
    return "Photo and video";
  }

  if (hasPhoto) {
    return "Photo only";
  }

  return hasVideo ? "Video only" : "";
}
