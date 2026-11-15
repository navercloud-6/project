import type { z } from 'zod';
import type { Journey, recordInput } from '@/lib/domain/contracts';
import type { WeatherResponse } from '@/lib/domain/weather';

export type JourneyDraft = Pick<
  Journey,
  'name' | 'date' | 'placeIds' | 'event'
>;
export type RecordInput = z.infer<typeof recordInput>;
export type Photo = { id: string; image: Uint8Array };

export interface JourneyRepository {
  list(owner: string): Journey[];
  find(owner: string, id: string): Journey | undefined;
  insert(owner: string, journey: Journey): void;
  update(owner: string, journey: Journey): void;
  photo(owner: string, journey: string, place: string): Photo | undefined;
  photoPlaces(owner: string, journey: string): string[];
  putPhoto(owner: string, journey: string, place: string, photo: Photo): void;
  transaction<T>(operation: () => T): T;
}
export interface LimitPort {
  consume(key: string, maximum: number): boolean;
}
export interface IdentityPort {
  id(): string;
  now(): number;
  token(): string;
  digest(token: string): string;
}
export interface SessionRepository {
  valid(owner: string, now: number): boolean;
  insert(owner: string, expires: number): void;
}
export type Capabilities = {
  clova: boolean;
  voice: boolean;
  translate: boolean;
  ocr: boolean;
};
export interface AIPort {
  imageData(image: Uint8Array): string;
  capabilities(): Capabilities;
  chat(
    messages: unknown[],
    extra?: Record<string, unknown>,
    model?: string,
  ): Promise<{ content?: unknown; toolCalls?: unknown }>;
  translate(text: string, target: string): Promise<string>;
  voice(text: string): Promise<Uint8Array>;
  ocr(image: Uint8Array): Promise<string>;
}
export type ModelSettings = { functionModel: string; visionModel: string };
export interface WeatherPort {
  demo(): boolean;
  current(region: string): Promise<WeatherResponse>;
}
