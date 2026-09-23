# 펌프 공정품질현황 관리

펌프 생산공정의 모델별 검사기준과 검사결과를 관리하고, 공정능력(Cp/Cpk)과 히스토그램이 포함된 품질보고서를 만드는 웹앱입니다.

데모: [https://pump-quality-manager.vercel.app](https://pump-quality-manager.vercel.app)

저장소: [https://github.com/1959kimik-create/pump-quality-manager](https://github.com/1959kimik-create/pump-quality-manager)

## 하는 일

1. 모델과 검사일을 고르면 해당 모델의 전류/전력/유량 기준이 자동으로 적용됩니다.
2. 시료를 한 줄씩 입력하면 OK/NG를 바로 판정합니다.
3. 같은 모델·같은 날짜에 다시 저장하면 시료번호가 이어서 붙습니다.
4. 품질보고서에서 검사수, 불량율, 히스토그램, Cp/Cpk를 확인합니다.
5. 보고서를 PDF로 저장하거나 인쇄하거나 메일로 보낼 수 있습니다.

## 두 가지 실행 방식

| 방식 | 주소 / 실행 | 데이터 | 메일 |
| --- | --- | --- | --- |
| Vercel / 로컬 | 위 데모 주소, 또는 로컬 서버 | 브라우저 `localStorage` | PDF 저장 후 메일 앱 열기 |
| Google Apps Script | 시트에 배포한 웹앱 주소 | Google Sheets | Gmail로 PDF 첨부 전송 |

현장 데이터와 메일 전송이 필요하면 Apps Script 웹앱을 사용하세요. Vercel 주소는 화면 확인과 데모용입니다.

## 폴더 구조

```text
index.html              화면 진입점
css/style.css           스타일
js/store.js             저장(로컬 / Google)
js/stats.js             판정, Cp/Cpk, 히스토그램
js/app.js               검사입력 · 보고서 · 기준정보
scripts/dev-server.js   로컬 실행용 서버
apps-script/            Google Apps Script에 붙여 넣을 파일
기획안.md                요구사항
```

## 로컬에서 실행

Node.js가 있으면 프로젝트 폴더에서 다음을 실행합니다.

```bash
node scripts/dev-server.js
```

브라우저에서 [http://127.0.0.1:5173](http://127.0.0.1:5173) 을 엽니다.

## Google Sheets 연동

1. 구글 시트에 `pump_spec` 탭을 만들고 헤더를 맞춥니다.  
   `모델명`, `전류 하한`, `전류 상한`, `전력 하한`, `전력 상한`, `유량 하한`, `유량 상한`, `사용여부`, `수정일`
2. 시트에서 **확장 프로그램 → Apps Script** 를 엽니다.
3. `apps-script` 폴더의 파일을 그대로 붙여 넣습니다.
   - `Code.gs` → `코드.gs`
   - `Index.html` → `Index`
   - `JavaScript.html` → `JavaScript`
   - `Stylesheet.html` → `Stylesheet`
4. 편집기에서 `authorizeOnce`를 한 번 실행해 권한을 허용합니다.
5. **배포 → 새 배포 → 웹 앱** 으로 배포합니다.
   - 다음 계정으로 실행: **나**
   - 액세스: 사용할 사람에게 맞게 설정
6. 코드를 바꾼 뒤에는 **배포 관리 → 연필 → 새 버전 → 배포** 합니다.

검사결과는 `모델명_YYYYMMDD` 시트에 쌓입니다.

## 메일과 PDF

- 메일 본문에는 모델명, 검사일, 총 검사수, 불량수, 불량율만 들어갑니다.
- 첨부 PDF에는 품질보고서 화면과 같은 히스토그램, 공정능력, 불량율이 들어갑니다. 시료별 검사결과 표는 넣지 않습니다.
- 기본 수신자는 기준정보 화면에서 바꿀 수 있습니다.

## Vercel 배포

이 저장소의 `main` 브랜치에 푸시하면 Vercel이 정적 사이트를 다시 배포합니다.

수동 배포:

```bash
npx vercel deploy --prod --yes
```

## 기본 모델 예시

| 모델 | 전류 [A] | 전력 [W] | 유량 [ml/min] |
| --- | --- | --- | --- |
| MODEL_A | 1.20 ~ 1.80 | 250 ~ 350 | 10.0 ~ 15.0 |
| MODEL_B | 1.50 ~ 2.10 | 300 ~ 400 | 12.0 ~ 18.0 |
| MODEL_C | 2.00 ~ 2.50 | 400 ~ 500 | 15.0 ~ 20.0 |

시료가 5개 미만이거나 표준편차가 0이면 Cp/Cpk는 `N/A`로 표시합니다.
