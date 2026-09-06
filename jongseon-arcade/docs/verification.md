# 검증 기록

2026-09-06, Windows / Microsoft Edge (Playwright).

## 자동 검증

- `npm test`: 엔진·오디오 17개 테스트 통과. 점수 배수, 황금, 폭탄, 시간 경계, 중복 타격, pause, snapshot 격리, 오디오 unlock 실패·중단·재개, 예약 소리 정리를 포함한다.
- `node tests/browser.cjs`: PC 시작, 숫자키 점수, 정지 시간 동결, 이어하기, 초기화, 효과음/음악 토글, 390px 모바일 터치, 가로 넘침 검사 통과. 브라우저 예외 0개.
- `node tests/full-game.cjs`: 실제 UI에서 연속 타격 후 60초 종료, 결과 점수, 최고 기록 재로딩, 종료 후 점수 불변, `file://` 오프라인 실행 통과.
- 실제 OfflineAudioContext로 hit/miss/bomb/pop/countdown/end 6종 효과음을 렌더링해 0이 아닌 파형과 클리핑 없음(peak < 0.98)을 검사했다. 음원 합성 노드는 실제 브라우저 구현을 사용하고, 오프라인 예약 시에만 running 상태 guard를 테스트에서 조정한다.
- 독립 리뷰에서 320/390/681/700/768px 결과 모달, 카운트다운 중 숨김, 게임 중 61초 숨김 동결, 다시 시작, 키보드 포커스 순환, localStorage 제한 환경을 검사했다.
- 정상/타격 이미지가 game DOM에서 렌더링되는 PC/모바일 스크린샷을 확인했다. 생성 PNG의 RGB 배경은 SVG 필터로 합성하며, 알파 없는 PNG를 투명 PNG로 잘못 표시하지 않는다.

## 실제 확인 범위

PC Edge와 모바일 화면/터치 에뮬레이션으로 검사했다. 물리적 iPhone/Android 장치나 스피커의 체감 음량은 별도 실기기 검사하지 않았다. 브라우저의 사용자 제스처 제한에 맞춰 시작 버튼에서 소리를 활성화한다.

## 리뷰 조치

- 오디오 interrupted 상태의 unlock, resume 거절 시 컨텍스트 보존, pending suspend/resume 순서를 수정하고 독립 재검토 승인 받았다.
- 작은 태블릿에서 결과 모달이 잘리지 않도록 게임판 최소 높이를 430px로 조정했다.
- BFCache 복원 및 음량 입력에서 Escape를 누르는 경로를 수정했고, `node tests/lifecycle.cjs` 회귀 검사에 통과했다. 실제 Edge 뒤로 가기 복원 후 컨텍스트 running과 효과음 재생, 소리 패널의 체크박스/슬라이더 Escape 및 포커스 복원을 포함한다.
- 최종 독립 재검토에서 위 두 수정 모두 승인받았으며 신규 문제는 발견되지 않았다.
