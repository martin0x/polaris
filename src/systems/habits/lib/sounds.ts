// Sound engine lands in a later task; these no-ops keep call sites stable.
export type SoundSlot = "partial" | "complete" | "off";

export function initSounds(): void {}

export function playSound(_slot: SoundSlot): void {}
