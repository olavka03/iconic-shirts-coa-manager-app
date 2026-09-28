// The legacy proof-photo file names mirror the product titles:
// RobertLewandowskiSignedOriginalBayernMunichFootballShirt-2015-16Home-photoproof.png →
// Robert Lewandowski Signed Original Bayern Munich Football Shirt - 2015-16 Home.

const IMAGE_EXTENSION = /\.(png|jpe?g|webp)$/i;
const UPLOAD_UUID =
  /_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROOF_TAIL =
  /[-_ ]+(signing|photo|signature|signeer|including)?[-_ ]*(proof|photo|photoproof|signingproof|proofofsigning|photoproofsigning|signingphoto|signingphotoproof|signaturephotoproof|back|signature)[-_a-z]*$/i;

export function photoFileName(url: string): string {
  return decodeURIComponent(url.split("?")[0].split("/").pop() ?? "");
}

// In an all-lower-case name a hyphen separates words; in a mixed-case one it is the title's dash.
function spaceKebabCase(name: string): string {
  if (name !== name.toLowerCase()) {
    return name;
  }

  return name
    .replace(/([a-z])-([a-z])/g, "$1 $2")
    .replace(/([a-z])-(\d)/g, "$1 $2")
    .replace(/(\d)-([a-z])/g, "$1 $2");
}

function spaceWords(name: string): string {
  return name
    .replace(/((?:19|20)\d{2})((?:19|20)\d{2})/g, "$1-$2")
    .replace(/(\d{4})_(\d{2,4})/g, "$1-$2")
    .replace(/_/g, " ")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-zà-ÿ])([A-Z])/g, "$1 $2")
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Z])/g, "$1 $2")
    .replace(/([A-Z]{2,})(\d)/g, "$1 $2")
    .replace(/(\d)-([A-Za-z])/g, "$1 $2")
    .replace(/([A-Za-z])-(\d)/g, "$1 - $2")
    .replace(/\s+/g, " ")
    .trim();
}

export function titleFromPhotoUrl(url: string): string {
  const name = photoFileName(url)
    .replace(IMAGE_EXTENSION, "")
    .replace(UPLOAD_UUID, "")
    .replace(PROOF_TAIL, "");

  return spaceWords(spaceKebabCase(name));
}
