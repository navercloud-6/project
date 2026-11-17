import type { z } from 'zod';
import type {
  Journey,
  Recommendation,
  recordInput,
} from '@/lib/domain/contracts';
import type { Place } from '@/lib/domain/catalog';
import type { History, editOutput, posterOutput } from '@/lib/domain/assistant';
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
  owner(hash: string, now: number): string | undefined;
  insert(owner: string, expires: number): void;
}
export interface LoginPort {
  enabled(): boolean;
  authorize(state: string): string;
  identify(code: string, state: string): Promise<string>;
}
export interface AuthRepository {
  attempt(state: string, session: string, expires: number): void;
  consume(state: string, session: string, now: number): boolean;
  login(previous: string, next: string, owner: string, now: number): void;
  revoke(hash: string): void;
}
export type AuthStatus = { enabled: boolean; authenticated: boolean };
export type Capabilities = {
  clova: boolean;
  voice: boolean;
  translate: boolean;
  ocr: boolean;
};
export type AICandidate = Pick<
  Place,
  'id' | 'name' | 'region' | 'description' | 'tags'
>;
export type GuideSource = {
  id: string;
  title: string;
  text: string;
  url: string;
  checkedOn: string;
  status: Place['reviewStatus'];
};
export interface AIPort {
  capabilities(): Capabilities;
  recommend(
    prompt: string,
    candidates: AICandidate[],
    feedback: { placeId: string; rating: number }[],
  ): Promise<Omit<Recommendation, 'mode'>>;
  guide(
    question: string,
    sources: GuideSource[],
    history: History,
  ): Promise<{ answer: string; sourceIds: string[] }>;
  proposeEdit(
    journey: Pick<Journey, 'name' | 'date' | 'placeIds'>,
    candidates: AICandidate[],
    prompt: string,
    history: History,
  ): Promise<z.infer<typeof editOutput>>;
  diary(placeName: string, image: Uint8Array): Promise<{ draft: string }>;
  poster(text: string): Promise<z.infer<typeof posterOutput>>;
  translate(text: string, target: string): Promise<string>;
  voice(text: string): Promise<Uint8Array>;
  ocr(image: Uint8Array): Promise<string>;
}
export interface WeatherPort {
  now(): number;
  demo(): boolean;
  current(region: string): Promise<WeatherResponse>;
}
