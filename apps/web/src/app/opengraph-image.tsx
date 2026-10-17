import { renderSocialCard, SOCIAL_ALT, SOCIAL_SIZE } from "./_og/socialCard";

// Open Graph card for "/" — LinkedIn, Slack, Discord, iMessage, portfolios.
export const alt = SOCIAL_ALT;
export const size = SOCIAL_SIZE;
export const contentType = "image/png";

export default function Image() {
  return renderSocialCard();
}
