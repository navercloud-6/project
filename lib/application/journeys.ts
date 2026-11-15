import type { Journey } from '@/lib/domain/contracts';
import { ApplicationError } from '@/lib/domain/errors';
import { assertEditable } from '@/lib/domain/journey';
import type {
  IdentityPort,
  JourneyRepository,
  JourneyDraft,
  RecordInput,
} from './ports';

export function createJourneys(
  repository: JourneyRepository,
  identity: IdentityPort,
) {
  function getJourney(owner: string, id: string) {
    const journey = repository.find(owner, id);
    if (!journey)
      throw new ApplicationError('NOT_FOUND', '여행을 찾을 수 없습니다.');
    return journey;
  }
  function saveJourney(owner: string, input: JourneyDraft) {
    const journey: Journey = {
      ...input,
      id: identity.id(),
      createdAt: new Date(identity.now()).toISOString(),
      revision: identity.id(),
      records: {},
    };
    repository.insert(owner, journey);
    return journey;
  }
  function saveRecord(owner: string, input: RecordInput) {
    return repository.transaction(() => {
      const journey = getJourney(owner, input.journeyId);
      if (!journey.placeIds.includes(input.placeId))
        throw new ApplicationError(
          'NOT_FOUND',
          '여행 또는 장소를 찾을 수 없습니다.',
        );
      journey.revision = identity.id();
      journey.records[input.placeId] = {
        rating: input.rating,
        note: input.note,
      };
      repository.update(owner, journey);
      return journey;
    });
  }
  function applyEdit(
    owner: string,
    id: string,
    expected: string,
    proposal: Pick<Journey, 'name' | 'date' | 'placeIds'>,
  ) {
    return repository.transaction(() => {
      const current = getJourney(owner, id);
      assertEditable(
        current,
        expected,
        proposal,
        repository.photoPlaces(owner, id),
      );
      const next = { ...current, ...proposal, revision: identity.id() };
      repository.update(owner, next);
      return next;
    });
  }
  function photoFor(owner: string, journey: string, place: string) {
    getJourney(owner, journey);
    return repository.photo(owner, journey, place);
  }
  function savePhoto(
    owner: string,
    journey: string,
    place: string,
    image: Uint8Array,
  ) {
    return repository.transaction(() => {
      const current = getJourney(owner, journey);
      if (!current.placeIds.includes(place))
        throw new ApplicationError(
          'INVALID_INPUT',
          '여행에 담은 장소의 사진만 저장할 수 있습니다.',
        );
      repository.putPhoto(owner, journey, place, { id: identity.id(), image });
      current.revision = identity.id();
      repository.update(owner, current);
      return current;
    });
  }
  return {
    journeys: (owner: string) => repository.list(owner),
    getJourney,
    saveJourney,
    saveRecord,
    applyEdit,
    photoFor,
    savePhoto,
  };
}
export type JourneyService = ReturnType<typeof createJourneys>;
