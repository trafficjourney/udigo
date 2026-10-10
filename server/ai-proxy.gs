/**
 * 창고여지도 AI 구역 찾기 중계 (Google Apps Script 웹 앱)
 *
 * 앱(index.html)은 사진만 이 웹 앱으로 보내고, 여기서 Roboflow 키를 붙여 분석을 요청한 뒤
 * 결과(predictions)만 돌려준다. 키는 앱에도, 브라우저 네트워크 기록에도 나타나지 않는다.
 * 사진은 중계만 하고 어디에도 저장하지 않는다.
 *
 * 설정 (프로젝트 설정 ⚙ → 스크립트 속성)
 *   ROBOFLOW_KEY : Roboflow API 키 (필수)
 *   DAILY_LIMIT  : 하루 최대 분석 횟수 (선택, 기본 300) — 키를 누가 몰래 쓰더라도 사용량이 이 안에서 멈춘다
 *
 * 배포: [배포] → [배포 관리] → 연필(수정) → 버전 "새 버전" → [배포]
 *   (새 배포를 만들면 주소가 바뀌므로, 기존 배포를 수정해야 앱의 주소가 그대로 유지된다)
 *   실행 사용자: 나 / 액세스 권한: 모든 사용자
 */

var ROBOFLOW_MODEL = 'find-cabinet/1';
var MAX_IMAGE_CHARS = 3 * 1024 * 1024; // base64 3MB 넘는 요청은 거절 (앱은 가로 800px로 줄여 보내서 보통 200KB 안팎)

function doPost(e) {
  try {
    var image = e && e.postData && e.postData.contents;
    if (!image) return json_({ status: 'error', message: '사진이 없어요' });
    if (image.length > MAX_IMAGE_CHARS) return json_({ status: 'error', message: '사진이 너무 커요' });

    var props = PropertiesService.getScriptProperties();
    var key = props.getProperty('ROBOFLOW_KEY');
    if (!key) return json_({ status: 'error', message: '서버 설정이 아직 안 됐어요' });

    if (!takeDailyQuota_(props)) return json_({ status: 'limit', message: '오늘 AI 사용량이 다 찼어요. 직접 그려 주세요' });

    var res = UrlFetchApp.fetch('https://detect.roboflow.com/' + ROBOFLOW_MODEL + '?api_key=' + encodeURIComponent(key), {
      method: 'post',
      contentType: 'application/x-www-form-urlencoded',
      payload: image,
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) return json_({ status: 'error', message: 'AI 서버 오류 ' + res.getResponseCode() });

    var result = JSON.parse(res.getContentText());
    return json_({ status: 'success', predictions: result.predictions || [] });
  } catch (err) {
    return json_({ status: 'error', message: String(err && err.message || err) });
  }
}

// 예전 앱은 여기서 키를 받아 갔다. 이제 키는 돌려주지 않는다 (새 앱이 반영된 뒤 이 상태로 배포).
function doGet() {
  return json_({ status: 'ok' });
}

// 하루 사용량 세기 (동시에 여러 요청이 와도 숫자가 꼬이지 않게 잠금)
function takeDailyQuota_(props) {
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var today = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
    var limit = parseInt(props.getProperty('DAILY_LIMIT') || '300', 10);
    var countKey = 'COUNT_' + today;
    var count = parseInt(props.getProperty(countKey) || '0', 10);
    if (count >= limit) return false;
    props.setProperty(countKey, String(count + 1));
    if (props.getProperty('COUNT_DAY') !== today) { // 날짜가 바뀌면 어제 숫자는 지운다
      var old = props.getProperty('COUNT_DAY');
      if (old) props.deleteProperty('COUNT_' + old);
      props.setProperty('COUNT_DAY', today);
    }
    return true;
  } finally {
    lock.releaseLock();
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// 편집기에서 한 번 실행하면 외부 연결(UrlFetchApp) 권한을 허용하는 창이 뜬다. 키 설정 확인용.
function testSetup() {
  var key = PropertiesService.getScriptProperties().getProperty('ROBOFLOW_KEY');
  Logger.log(key ? '키 설정됨' : 'ROBOFLOW_KEY가 없어요');
  var res = UrlFetchApp.fetch('https://detect.roboflow.com/', { muteHttpExceptions: true });
  Logger.log('Roboflow 연결: ' + res.getResponseCode());
}
