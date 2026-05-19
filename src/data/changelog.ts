// 앱 내 "최근 업데이트" 패널에 표시될 변경 로그.
// 새 릴리즈 시 이 파일에 항목을 추가하면 됩니다.

export interface ChangelogEntry {
  date: string;   // YYYY-MM-DD (KST 기준 릴리즈 일)
  title: string;
  items: string[];
  type?: "feature" | "fix" | "improvement";
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: "2026-05-18",
    title: "플랫폼 전반 강화",
    type: "improvement",
    items: [
      "Postgres GROUP BY 집계로 대시보드 응답 속도 개선",
      "공유 토큰 brute-force 방어 (rate limit + 형식 검증)",
      "삭제는 30일 동안 복구 가능한 soft delete 로 전환",
      "초대 수락 race condition 픽스 (트랜잭션)",
      "대시보드 30초 새로고침 시 깜빡임 제거",
      "활동 로그 필터·CSV 내보내기",
      "레코드 서버사이드 검색 (10만 건 넘어도 빠름)",
    ],
  },
  {
    date: "2026-05-18",
    title: "마케팅 대시보드 14대 기능",
    type: "feature",
    items: [
      "글로벌 필터 (소스/UTM, Last·First touch 토글)",
      "캠페인 퍼포먼스 표 + 자동 인사이트 + 히트맵 + 게이지 + 퍼널",
      "드래그앤드롭, 위젯 복제, 위젯 단위 CSV",
      "다중 보드 + 복제 템플릿",
      "공유 링크 (읽기 전용)",
      "정기 리포트 (Slack 웹훅, KST 크론)",
    ],
  },
  {
    date: "2026-05-18",
    title: "UTM 어트리뷰션 + 마케팅 대시보드",
    type: "feature",
    items: [
      "First-touch / Last-touch 분리 추적 (3중 저장소)",
      "프로젝트별 커스텀 대시보드 + 기간 선택기",
      "위젯 6종: KPI / 시계열 / UTM 분포 / TOP N / 필드 분포 / 최근 제출",
    ],
  },
  {
    date: "2026-05-18",
    title: "데이터 수집 대규모 확장",
    type: "feature",
    items: [
      "엑셀/CSV 가져오기 (중복 처리 3-모드)",
      "중복 정리 + 정규화 일괄 작업",
      "보안: CORS Origin 제한 / Rate limit / 허니팟 / API 키 재발급",
      "스크립트 설치 테스트 + 위험 영역 (전체 삭제)",
      "활동 로그 + 웹훅/인앱 알림",
    ],
  },
];
