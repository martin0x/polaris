import { renderSocialCard, SOCIAL_ALT, SOCIAL_SIZE } from "./_og/socialCard";

// X card for "/" — the same image as the Open Graph card.
export const alt = SOCIAL_ALT;
export const size = SOCIAL_SIZE;
export const contentType = "image/png";

export default function Image() {
  return renderSocialCard();
}
