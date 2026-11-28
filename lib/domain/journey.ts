import type { Journey } from './contracts';
import { ApplicationError } from './errors';

export const revisionOf = (journey: Journey) =>
  journey.revision || journey.createdAt;
export function assertEditable(
  current: Journey,
  expected: string,
  proposal: Pick<Journey, 'name' | 'date' | 'placeIds'>,
  photoPlaces: string[],
) {
  if (revisionOf(current) !== expected)
    throw new ApplicationError(
      'CONFLICT',
      '여행이 변경되었습니다. 새로고침 후 다시 제안받아 주세요.',
    );
  const nextIds = new Set(proposal.placeIds);
  if (
    Object.keys(current.records).some((place) => !nextIds.has(place)) ||
    photoPlaces.some((place) => !nextIds.has(place))
  )
    throw new ApplicationError(
      'CONFLICT',
      '방문 기록이나 사진이 있는 장소는 제외할 수 없습니다.',
    );
  if (current.event && current.date !== proposal.date)
    throw new ApplicationError(
      'CONFLICT',
      '포스터에서 저장한 행사 날짜는 대화 편집으로 변경할 수 없습니다.',
    );
}
