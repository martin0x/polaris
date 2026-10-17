export interface Integration {
  name: string;
  displayName: string;
  status(): Promise<"connected" | "disconnected" | "expired">;
  connect(): Promise<string>;
  disconnect(): Promise<void>;
}
