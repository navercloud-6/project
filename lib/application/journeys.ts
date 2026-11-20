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
  async function getJourney(owner: string, id: string) {
    const journey = await repository.find(owner, id);
    if (!journey)
      throw new ApplicationError('NOT_FOUND', '여행을 찾을 수 없습니다.');
    return journey;
  }
  async function saveJourney(owner: string, input: JourneyDraft) {
    const journey: Journey = {
      ...input,
      id: identity.id(),
      createdAt: new Date(identity.now()).toISOString(),
      revision: identity.id(),
      records: {},
    };
    await repository.insert(owner, journey);
    return journey;
  }
  async function saveRecord(owner: string, input: RecordInput) {
    return repository.transaction(async () => {
      const journey = await getJourney(owner, input.journeyId);
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
      await repository.update(owner, journey);
      return journey;
    });
  }
  async function applyEdit(
    owner: string,
    id: string,
    expected: string,
    proposal: Pick<Journey, 'name' | 'date' | 'placeIds'>,
  ) {
    return repository.transaction(async () => {
      const current = await getJourney(owner, id);
      assertEditable(
        current,
        expected,
        proposal,
        await repository.photoPlaces(owner, id),
      );
      const next = { ...current, ...proposal, revision: identity.id() };
      await repository.update(owner, next);
      return next;
    });
  }
  async function photoFor(owner: string, journey: string, place: string) {
    await getJourney(owner, journey);
    return repository.photo(owner, journey, place);
  }
  async function savePhoto(
    owner: string,
    journey: string,
    place: string,
    image: Uint8Array,
  ) {
    return repository.transaction(async () => {
      const current = await getJourney(owner, journey);
      if (!current.placeIds.includes(place))
        throw new ApplicationError(
          'INVALID_INPUT',
          '여행에 담은 장소의 사진만 저장할 수 있습니다.',
        );
      await repository.putPhoto(owner, journey, place, {
        id: identity.id(),
        image,
      });
      current.revision = identity.id();
      await repository.update(owner, current);
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
