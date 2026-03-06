export interface HoldedContact {
  id: string;
  name: string;
  email?: string;
  code?: string;
  tradeName?: string;
  isperson?: boolean;
  vatnumber?: string;
}

export interface HoldedProject {
  id: string;
  name: string;
  status?: string;
}

export interface CardHoldedData {
  contactId?: string;
  contactName?: string;
  projectId?: string;
  projectName?: string;
}

export interface TrelloPowerUp {
  initialize(capabilities: Record<string, unknown>): void;
  iframe(): TrelloContext;
}

export interface TrelloContext {
  set(scope: string, visibility: string, key: string, value: unknown): Promise<void>;
  get(scope: string, visibility: string, key: string): Promise<unknown>;
  remove(scope: string, visibility: string, key: string): Promise<void>;
  popup(options: {
    title: string;
    url: string;
    height?: number;
  }): void;
  closePopup(): void;
  sizeTo(selector: string | HTMLElement): Promise<void>;
  arg(name: string, defaultValue?: string): string;
  signUrl(url: string): string;
  card(...fields: string[]): Promise<{ id: string; desc: string; [key: string]: unknown }>;
  getRestApi(): TrelloRestApi;
}

export interface TrelloRestApi {
  authorize(opts: { expiration: string; scope: string }): Promise<void>;
  isAuthorized(): Promise<boolean>;
  getToken(): Promise<string | null>;
}

declare global {
  interface Window {
    TrelloPowerUp: TrelloPowerUp;
  }
}
