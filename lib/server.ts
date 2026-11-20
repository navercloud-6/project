import {
  journeyRepository,
  sessionRepository,
  limits,
  authRepository,
} from './adapters/postgres';
import { identity } from './adapters/identity';
import { naver } from './adapters/naver';
import { liveWeather } from './adapters/open-meteo';
import { createJourneys } from './application/journeys';
import { createSession } from './application/session';
import { createAssistant } from './application/assistant';
import { createRecommendation } from './application/recommendation';
import { createOperations } from './application/operations';
import { createWeather } from './application/weather';
import { createAuth } from './application/auth';
import { naverLogin } from './adapters/naver-login';
import { naverMapClientId } from './adapters/naver-map';

export const journeyService = createJourneys(journeyRepository, identity);
export const {
  journeys,
  saveJourney,
  saveRecord,
  getJourney,
  applyEdit,
  photoFor,
  savePhoto,
} = journeyService;
export const resolveSession = createSession(sessionRepository, identity);
export const auth = createAuth(
  authRepository,
  sessionRepository,
  identity,
  naverLogin,
);
export const { guide, proposeEdit } = createAssistant(naver);
export const recommend = createRecommendation(naver);
export const operations = createOperations(journeyService, naver, limits);
export const fetchSiheungWeather = createWeather({
  now: identity.now,
  demo: () => process.env.WEATHER_MODE === 'demo',
  current: liveWeather,
});
export const capabilities = naver.capabilities;
export { naverMapClientId };
