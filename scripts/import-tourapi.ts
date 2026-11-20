import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import mapData from '../data/gyeonggi-map.json';

type TourRecord = Record<string, string>;
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const sourceUrl = 'https://www.data.go.kr/data/15101578/openapi.do';
const priorityNames = [
  '수원화성',
  '화성행궁',
  '광교호수공원',
  '방화수류정',
  '수원화성박물관',
  '율동공원',
  '성남중앙공원',
  '판교박물관',
  '성남아트센터',
  '회룡사',
  '의정부미술도서관',
  '부대찌개거리',
  '직동근린공원',
  '안양예술공원',
  '안양천',
  '평촌중앙공원',
  '김중업건축박물관',
  '부천자연생태공원',
  '한국만화박물관',
  '상동호수공원',
  '부천백만송이장미원',
  '광명동굴',
  '광명업사이클아트센터',
  '안양천',
  '오리서원',
  '평택호관광단지',
  '소풍동물원',
  '평택시농업생태원',
  '진위천유원지',
  '소요산',
  '니지모리스튜디오',
  '동두천자연휴양림',
  '경기북부어린이박물관',
  '대부도',
  '안산갈대습지공원',
  '시화나래조력공원',
  '경기도미술관',
  '바다향기수목원',
  '일산호수공원',
  '행주산성',
  '서오릉',
  '아쿠아플라넷일산',
  '현대모터스튜디오',
  '서울대공원',
  '서울랜드',
  '국립과천과학관',
  '국립현대미술관과천',
  '구리한강시민공원',
  '동구릉',
  '장자호수공원',
  '고구려대장간마을',
  '다산정약용유적지',
  '물의정원',
  '광릉',
  '수종사',
  '실학박물관',
  '물향기수목원',
  '오산독산성',
  '오산오색시장',
  '오산미니어처빌리지',
  '철쭉동산',
  '초막골생태공원',
  '수리산',
  '반월호수',
  '왕송호수',
  '철도박물관',
  '의왕레일파크',
  '백운호수',
  '미사경정공원',
  '하남유니온파크',
  '검단산',
  '하남역사박물관',
  '한국민속촌',
  '에버랜드',
  '용인농촌테마파크',
  '호암미술관',
  '경기도박물관',
  '임진각',
  '헤이리예술마을',
  '오두산통일전망대',
  '벽초지수목원',
  '파주출판도시',
  '이천도자예술마을',
  '설봉공원',
  '이천테르메덴',
  '덕평공룡수목원',
  '안성팜랜드',
  '안성맞춤랜드',
  '미리내성지',
  '칠장사',
  '안성맞춤박물관',
  '김포장릉',
  '라베니체',
  '애기봉평화생태공원',
  '김포아트빌리지',
  '문수산성',
  '제부도',
  '궁평항',
  '전곡항',
  '동탄호수공원',
  '화성융건릉',
  '용주사',
  '화담숲',
  '남한산성도립공원',
  '남한산성행궁',
  '경기도자박물관',
  '나리농원',
  '양주회암사지',
  '송추계곡',
  '가나아트파크',
  '장흥조각공원',
  '포천아트밸리',
  '포천산정호수',
  '허브아일랜드',
  '국립수목원',
  '비둘기낭폭포',
  '신륵사',
  '여주영릉',
  '강천섬유원지',
  '여주도자세상',
  '황학산수목원',
  '재인폭포',
  '연천호로고루',
  '전곡선사박물관',
  '연천당포성',
  '임진강댑싸리정원',
  '아침고요수목원',
  '자라섬',
  '쁘띠프랑스',
  '잣향기푸른숲',
  '호명호수공원',
  '양평두물머리',
  '세미원',
  '용문사',
  '양평군립미술관',
  '황순원문학촌',
];

export function plainText(value = ''): string {
  const entities: Record<string, string> = {
    nbsp: ' ',
    amp: '&',
    quot: '"',
    apos: "'",
    lt: '<',
    gt: '>',
  };
  return value
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(
      /&(#x[0-9a-f]+|#\d+|nbsp|amp|quot|apos|lt|gt);/gi,
      (_, entity: string) => {
        if (!entity.startsWith('#'))
          return entities[entity.toLowerCase()] ?? '';
        const code =
          entity[1].toLowerCase() === 'x'
            ? parseInt(entity.slice(2), 16)
            : Number(entity.slice(1));
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
      },
    )
    .replace(/\s+/g, ' ')
    .trim();
}

export function cityForRecord(item: TourRecord) {
  if (item.lDongRegnCd !== '41' || !/^\d{3}$/.test(item.lDongSignguCd ?? ''))
    return undefined;
  const city = mapData.cities.find(
    (city) =>
      item.addr1?.startsWith(`경기도 ${city.name} `) ||
      item.addr1 === `경기도 ${city.name}`,
  );
  const code = `41${item.lDongSignguCd}`;
  return city && code.slice(0, 4) === city.id.slice(0, 4) ? city : undefined;
}

export function reusablePhoto(item: TourRecord): string | null {
  if (item.cpyrhtDivCd !== 'Type1') return null;
  try {
    const url = new URL(item.firstimage);
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.hostname !== 'tong.visitkorea.or.kr' ||
      !url.pathname.startsWith('/cms/') ||
      url.search ||
      url.username ||
      url.password
    )
      return null;
    url.protocol = 'https:';
    return url.href;
  } catch {
    return null;
  }
}

function validRecord(item: TourRecord): boolean {
  const lat = Number(item.mapy),
    lng = Number(item.mapx);
  return Boolean(
    cityForRecord(item) &&
      /^\d+$/.test(item.contentid) &&
      plainText(item.title) &&
      ['12', '14'].includes(item.contenttypeid) &&
      lat >= 36.8 &&
      lat <= 38.35 &&
      lng >= 126.3 &&
      lng <= 127.9,
  );
}

function normalizedName(item: TourRecord): string {
  return plainText(item.title).replace(/\s/g, '');
}

export function selectRecords(
  items: TourRecord[],
  cityId: string,
  limit = 20,
): TourRecord[] {
  const score = (item: TourRecord) => {
    const name = normalizedName(item);
    const priority = priorityNames.findIndex((part) => name.includes(part));
    return (
      (priority >= 0 ? 10000 - priority : 0) +
      (item.contenttypeid === '12' ? 20 : 0) +
      (reusablePhoto(item) ? 10 : 0) -
      (/도서관|문화원|체육공원/.test(name) ? 30 : 0)
    );
  };
  const sorted = items
    .filter((item) => validRecord(item) && cityForRecord(item)?.id === cityId)
    .sort(
      (a, b) =>
        score(b) - score(a) ||
        a.title.localeCompare(b.title, 'ko') ||
        a.contentid.localeCompare(b.contentid),
    );
  const names = new Set<string>(),
    ids = new Set<string>();
  return sorted
    .filter((item) => {
      const name = normalizedName(item);
      if (names.has(name) || ids.has(item.contentid)) return false;
      names.add(name);
      ids.add(item.contentid);
      return true;
    })
    .slice(0, limit);
}

export function toPlace(item: TourRecord, checkedOn: string) {
  const city = cityForRecord(item);
  if (!city || !validRecord(item))
    throw new Error('경기도 관광지의 코드·주소·좌표를 확인할 수 없습니다.');
  const name = plainText(item.title);
  const overview = plainText(item.overview);
  const photo = reusablePhoto(item);
  const tags = [item.contenttypeid === '14' ? '문화시설' : '관광명소'];
  if (item.lclsSystm1 === 'NA' || /수목원|숲|계곡|호수|생태/.test(name))
    tags.push('자연·생태');
  if (/공원|산책|둘레길|수목원/.test(name)) tags.push('산책');
  if (/박물관|유적|산성|행궁|왕릉|미술관|향교|사찰/.test(name))
    tags.push('역사·문화');
  if (item.lclsSystm1 === 'EX' || /체험|테마파크|랜드/.test(name))
    tags.push('체험');
  return {
    id: `PLACE_TOURAPI_${item.contentid}`,
    cityId: city.id,
    name,
    region: city.name,
    description: overview
      ? overview.slice(0, 200)
      : `${city.name}에 있는 ${name}. 자세한 소개와 방문 정보는 한국관광공사 안내를 확인해 주세요.`,
    address: plainText(`${item.addr1} ${item.addr2 ?? ''}`),
    tags,
    coordinates: { lat: Number(item.mapy), lng: Number(item.mapx) },
    reviewStatus: 'DRAFT',
    checkedOn,
    sources: [
      {
        code: `SRC_TOURAPI_${item.contentid}`,
        title: `${name} (TourAPI 콘텐츠 ${item.contentid})`,
        publisher: '한국관광공사',
        url: sourceUrl,
        checked_on: checkedOn,
        content_date: /^\d{14}$/.test(item.modifiedtime ?? '')
          ? `${item.modifiedtime.slice(0, 4)}-${item.modifiedtime.slice(4, 6)}-${item.modifiedtime.slice(6, 8)}`
          : '',
        content_date_note: 'TourAPI 공급자 갱신일; 현재 운영 확인일 아님',
        access_status: 'API_CHECKED',
        evidence_section: '지역·공통정보의 소개·주소·좌표',
        reuse_note:
          '한국관광공사 TourAPI 제공 정보를 수집·일부 발췌·정규화했다. 출처를 표시하며 운영·요금·예약은 별도로 확인해야 한다.',
      },
    ],
    image: photo
      ? {
          path: photo,
          alt: `${name} — 한국관광공사 제공 사진`,
          author: '한국관광공사 TourAPI 제공',
          sourceUrl: photo,
          license: '공공누리 제1유형',
          licenseUrl: 'https://www.kogl.or.kr/info/licenseType1.do',
          checkedOn,
        }
      : null,
  };
}

export async function importTourApi() {
  const key = process.env.TOUR_API_KEY?.trim();
  if (!key) throw new Error('.env.local에 TOUR_API_KEY를 설정해 주세요.');
  const checkedOn = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
  }).format(new Date());
  const cacheRoot = resolve(root, '.runtime', 'tourapi', checkedOn);
  mkdirSync(cacheRoot, { recursive: true });
  async function request(method: string, params: Record<string, string>) {
    const cachePath = resolve(
      cacheRoot,
      `${method}-${Object.values(params).join('-')}.json`,
    );
    if (!process.argv.includes('--refresh') && existsSync(cachePath))
      return JSON.parse(readFileSync(cachePath, 'utf8'));
    const url = new URL(
      `https://apis.data.go.kr/B551011/KorService2/${method}`,
    );
    url.search = new URLSearchParams({
      serviceKey: key!,
      MobileOS: 'ETC',
      MobileApp: 'GyeonggiHaruieum',
      _type: 'json',
      ...params,
    }).toString();
    let body;
    let status = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await delay(attempt ? 1000 * attempt : 100);
        const response = await fetch(url, {
          signal: AbortSignal.timeout(30000),
          redirect: 'error',
        });
        status = response.status;
        if (!response.ok) throw new Error();
        body = (await response.json()).response;
        break;
      } catch {
        if (attempt === 2 || [400, 401, 403].includes(status))
          throw new Error(
            `TourAPI ${method} 호출에 실패했습니다 (HTTP ${status || '연결 실패'}). 기존 카탈로그를 유지합니다.`,
          );
      }
    }
    if (body?.header?.resultCode !== '0000' || !body.body)
      throw new Error(
        `TourAPI ${method} 응답을 확인할 수 없습니다. 인증·승인·사용 한도를 확인해 주세요.`,
      );
    writeFileSync(cachePath, JSON.stringify(body.body));
    return body.body;
  }
  const records: TourRecord[] = [];
  for (const contentTypeId of ['12', '14']) {
    for (let page = 1; ; page++) {
      const body = await request('areaBasedList2', {
        contentTypeId,
        lDongRegnCd: '41',
        numOfRows: '1000',
        pageNo: String(page),
        arrange: 'A',
      });
      const items = body.items?.item ?? [];
      if (!Array.isArray(items))
        throw new Error('TourAPI 목록 형식이 올바르지 않습니다.');
      records.push(...items);
      if (page * 1000 >= Number(body.totalCount)) break;
      if (!items.length)
        throw new Error('TourAPI 목록이 완료되기 전에 비었습니다.');
    }
  }
  const selected = mapData.cities
    .filter((city) => city.id !== '41390')
    .flatMap((city) => selectRecords(records, city.id));
  const imported = [];
  // Sequential requests keep this development importer below burst limits.
  for (const [index, item] of selected.entries()) {
    const body = await request('detailCommon2', { contentId: item.contentid });
    const detail = body.items?.item?.[0];
    if (
      !detail ||
      detail.contentid !== item.contentid ||
      cityForRecord(detail)?.id !== cityForRecord(item)?.id
    )
      throw new Error(
        'TourAPI 상세의 장소·시군 식별자가 목록과 일치하지 않습니다. 기존 카탈로그를 유지합니다.',
      );
    imported.push(toPlace({ ...item, ...detail }, checkedOn));
    if ((index + 1) % 50 === 0)
      console.log(`관광지 상세 수집: ${index + 1}/${selected.length}`);
  }
  const destination = resolve(root, 'data', 'places.json');
  const existing = JSON.parse(readFileSync(destination, 'utf8'));
  const siheung = existing.filter(
    (place: { cityId: string; id: string }) =>
      place.cityId === '41390' && !place.id.startsWith('PLACE_TOURAPI_'),
  );
  if (siheung.length !== 20)
    throw new Error(
      '기존 시흥 20곳이 확인되지 않아 카탈로그를 변경하지 않았습니다.',
    );
  const combined = [...siheung, ...imported];
  if (
    new Set(combined.map((place) => place.id)).size !== combined.length ||
    mapData.cities.some(
      (city) => !combined.some((place) => place.cityId === city.id),
    )
  )
    throw new Error(
      '장소 중복 또는 관광지가 없는 시·군이 있어 카탈로그를 변경하지 않았습니다.',
    );
  const temporary = resolve(cacheRoot, 'places.json');
  writeFileSync(temporary, JSON.stringify(combined, null, 2) + '\n');
  renameSync(temporary, destination);
  console.log(
    `완료: 경기도 31개 시·군 ${combined.length}곳 (기존 시흥 ${siheung.length}곳, 추가 ${imported.length}곳)`,
  );
  for (const city of mapData.cities)
    console.log(
      `${city.name}: ${combined.filter((place) => place.cityId === city.id).length}곳`,
    );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  importTourApi().catch((error) => {
    console.error(
      error instanceof Error ? error.message : '관광지 수집에 실패했습니다.',
    );
    process.exitCode = 1;
  });
}
