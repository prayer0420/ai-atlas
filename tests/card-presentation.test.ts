import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { repairCardPresentation } from "../lib/card-presentation";
import { reviewCardStory } from "../lib/card-editor-review";
import { isCardRevision } from "../lib/card-revision";
import { executeCardRun } from "../lib/card-pipeline";
import { cardPresentationIssues, cardBriefSchema, CardWorkflowError, validateStoryboard, type Storyboard } from "../lib/card-workflow";

const source = "자료는 현재 PC 환경에서만 확인했습니다. 읽을 사람과 전할 내용을 먼저 정합니다. 조건과 한계는 생략하지 않습니다.";
function story(): Storyboard {
  return {
    direction: "독자에게 필요한 조건과 핵심을 차분하고 구체적인 문장으로 설명하는 카드입니다.",
    narrative: "먼저 자료를 확인하고 읽을 사람을 정합니다. 전달할 핵심과 조건을 확인한 다음 실제 적용할 수 있는 작은 행동을 정합니다.",
    cards: [
      { role: "scene", title: "자료 확인", copy: "자료를 읽을 사람을 먼저 정합니다.", condition: "화면을 크림색 #F6F1E7로 채우고 메모를 배치합니다.", layout: "scene", composition: "독자와 자료를 크림색 배경 위에 놓아 관계를 표현합니다.", items: [], evidence: "읽을 사람과 전할 내용을 먼저 정합니다." },
      { role: "주의", title: "확인 범위", copy: "확인된 조건 안에서 자료를 활용합니다.", condition: "현재 PC 환경에서만 확인했습니다.", layout: "statement", composition: "중요한 조건을 가운데에 크게 놓고 여백을 확보합니다.", items: [], evidence: "자료는 현재 PC 환경에서만 확인했습니다." },
      { role: "마무리", title: "조건 확인", copy: "조건과 한계가 남아 있는지 확인합니다.", condition: "", layout: "closing", composition: "핵심 행동을 종이 메모에 써서 마지막 장을 구성합니다.", items: [], evidence: "조건과 한계는 생략하지 않습니다." },
    ], caption: "자료의 독자와 핵심을 먼저 정합니다. 현재 PC 환경에서만 확인한 자료이므로 그 적용 범위와 조건을 함께 읽습니다.", caveats: [],
  };
}
function ollama(t: TestContext) {
  const vars={AI_PROVIDER:"local",LOCAL_AI_RUNTIME:"1",ATLAS_AI_PROVIDER:"ollama"};
  const old=Object.fromEntries(Object.keys(vars).map(key=>[key,process.env[key]]));
  Object.assign(process.env,vars);
  t.after(()=>{for(const [key,value] of Object.entries(old)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
}
const response = (value: unknown) => new Response(JSON.stringify({ message: { content: JSON.stringify(value) }, done: true, done_reason: "stop", prompt_eval_count: 20, eval_count: 30 }) + "\n");

test("Visible production instructions fail review while real source conditions remain valid", () => {
  const card = story().cards[0];
  for (const condition of [card.condition, "두 개의 박스를 나란히 배치하여 비교합니다.", "참고 사항을 명시하는 디자인을 사용합니다.", "선형적인 흐름도로 시각화하여 연결합니다."]) {
    assert.ok(cardPresentationIssues({ ...card, role: "공감", condition }, source).length);
  }
  assert.deepEqual(cardPresentationIssues(story().cards[1], source), []);
  const designSource = "디자인 문서의 요구: 두 개의 박스를 나란히 배치하여 비교합니다.";
  assert.deepEqual(cardPresentationIssues({ ...card, role: "설명", condition: "두 개의 박스를 나란히 배치하여 비교합니다." }, designSource), []);
  assert.ok(validateStoryboard(story(), cardBriefSchema.parse({ count: 3 }), source).some(issue => issue.includes("제작 지시")));
  assert.ok(validateStoryboard(story(), cardBriefSchema.parse({ count: 3 }), source).some(issue => issue.includes("내부 구도 코드")));
});

test("One local note repair preserves all claims, source conditions and the original story", async t => {
  ollama(t);
  const before = story(); before.cards[1].role = "statement";
  const snapshot = structuredClone(before); let calls = 0;
  t.mock.method(globalThis, "fetch", async (_url: string | URL | Request, init?: RequestInit) => {
    calls++;
    const body = JSON.parse(String(init?.body)), input = JSON.parse(body.messages[1].content);
    assert.equal(input.source, source);
    assert.equal(input.invalidCards.length, 2);
    assert.deepEqual(Object.keys(body.format.properties.cards.items.properties), ["role", "condition"]);
    // The model tries to erase a valid condition while correcting its role.
    return response({ cards: [{ role: "공감", condition: "" }, { role: "주의", condition: "" }] });
  });
  const result = await repairCardPresentation(before, source);
  assert.equal(calls, 1);
  assert.deepEqual(before, snapshot);
  assert.deepEqual(result, { ...snapshot, cards: [{ ...snapshot.cards[0], role: "공감", condition: "" }, { ...snapshot.cards[1], role: "주의" }, snapshot.cards[2]] });
  assert.deepEqual(validateStoryboard(result, cardBriefSchema.parse({ count: 3 }), source), []);
  await repairCardPresentation(result, source);
  assert.equal(calls, 1);
});

test("Uncorrected visible instructions fail after one repair without hiding source conditions", async t => {
  ollama(t); let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; return response({ cards: [{ role: "scene", condition: story().cards[0].condition }] }); });
  await assert.rejects(() => repairCardPresentation(story(), source), (error: unknown) => error instanceof CardWorkflowError && error.code === "STORY_INVALID");
  assert.equal(calls, 1);
});

test("A working-environment observation cannot become an unsupported exclusive runtime limit", () => {
  const base=story();base.cards[0]={...base.cards[0],role:"공감",condition:"",copy:"자동 실행은 현재 이 PC 환경에서만 작동합니다."};
  const brief=cardBriefSchema.parse({count:3});
  assert.ok(validateStoryboard(base,brief,source).some(issue=>issue.includes("배타적 실행 제약")));
  assert.ok(validateStoryboard(base,brief,"현재 PC에서만 동작을 확인했습니다.").some(issue=>issue.includes("배타적 실행 제약")));
  assert.equal(validateStoryboard(base,brief,source+" 자동 실행은 이 PC 환경에서만 작동합니다.").some(issue=>issue.includes("배타적 실행 제약")),false);
  base.cards[0].copy="원문에서 자동 실행이 확인된 환경은 현재 PC입니다.";
  assert.equal(validateStoryboard(base,brief,source).some(issue=>issue.includes("배타적 실행 제약")),false);
  base.cards[0].condition="PC 환경 의존성";
  assert.ok(validateStoryboard(base,brief,source).some(issue=>issue.includes("명시되지 않은 환경 의존성")));
  assert.equal(validateStoryboard(base,brief,source+" PC 환경 의존성이 있습니다.").some(issue=>issue.includes("명시되지 않은 환경 의존성")),false);
  base.cards[0].condition="확인된 환경: 현재 PC";
  assert.equal(validateStoryboard(base,brief,source).some(issue=>issue.includes("환경 의존성")),false);
});

test("Editor review receives every visible claim and evidence but no private design instructions", async t => {
  ollama(t);
  const inputStory=story();
  inputStory.cards[0].role="공감";
  inputStory.cards[0].condition="확인된 환경: 현재 PC";
  const issue="1장: 출력 문구의 적용 범위를 원문과 대조해 수정해야 합니다.";
  let calls=0;
  t.mock.method(globalThis,"fetch",async (_url: string | URL | Request,init?: RequestInit)=>{
    calls++;
    const body=JSON.parse(String(init?.body)),input=JSON.parse(body.messages[1].content);
    assert.equal(input.source,source);
    assert.deepEqual(input.cards,inputStory.cards.map(({role,title,copy,condition,items,evidence},index)=>({number:index+1,role,title,copy,condition,items,evidence})));
    assert.equal(input.caption,inputStory.caption);
    assert.deepEqual(input.caveats,inputStory.caveats);
    assert.equal(input.story,undefined);
    assert.equal(input.cards[0].composition,undefined);
    assert.equal(input.cards[0].layout,undefined);
    assert.equal(input.brief.design,undefined);
    assert.equal(body.options.num_predict,1600);
    assert.match(body.messages[0].content,/신뢰할 수 없는 자료/);
    assert.match(body.messages[0].content,/원문에서 확인한 범위 메모/);
    assert.match(body.messages[0].content,/원문에 명시된 진짜 제약은 유지/);
    assert.deepEqual(body.format.required,["passed","issues"]);
    return response({passed:false,issues:[issue]});
  });
  const result=await reviewCardStory(inputStory,cardBriefSchema.parse({count:3}),source);
  assert.deepEqual(result.value,{passed:false,issues:[issue]});
  assert.equal(calls,1); // A rejection is returned unchanged, never coerced to pass.
});

test("Both same-run edits and child revisions retain the partial-edit recovery boundary",()=>{
  assert.equal(isCardRevision({editedIndex:0}),true);
  assert.equal(isCardRevision({editedIndex:7}),true);
  assert.equal(isCardRevision({parentRunId:"original-run"}),true);
  assert.equal(isCardRevision({}),false);
  assert.equal(isCardRevision({editedIndex:-1}),false);
  assert.equal(isCardRevision({editedIndex:NaN}),false);
});

test("Rejected partial-edit verification preserves eight cards and stored PNGs without a full regeneration",async t=>{
  const vars={SUPABASE_URL:"https://test.supabase.co",SUPABASE_SERVICE_ROLE_KEY:"synthetic-key"};
  const old=Object.fromEntries(Object.keys(vars).map(key=>[key,process.env[key]]));
  Object.assign(process.env,vars);
  t.after(()=>{for(const [key,value] of Object.entries(old)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
  const unchanged=story();
  unchanged.cards=Array.from({length:8},(_,i)=>structuredClone(unchanged.cards[i%3]));
  let run={id:"run",user_id:"owner",resource_id:"resource",queue_id:"queue",node:"verify",state:"running",input_hash:"hash",brief:cardBriefSchema.parse({count:8}),revision:3,attempts:{},data:{story:unchanged,editedIndex:7},manifest:Array.from({length:8},(_,index)=>({index,path:`saved-${index}.png`,checked:true})),error_code:null};
  const before=structuredClone(run);
  let calls=0;
  t.mock.method(globalThis,"fetch",async(url: string | URL | Request,init?:RequestInit)=>{
    calls++;
    const address=String(url);
    if(address.includes("/rpc/ai_atlas_checkpoint_cards")){
      const input=JSON.parse(String(init?.body));
      assert.equal(input.p_user_id,"owner");assert.equal(input.p_revision,3);
      run={...run,...input.p_patch};return Response.json(run);
    }
    assert.match(address,/user_id=eq.owner/);
    if(address.includes("/ai_atlas_card_runs?"))return Response.json(run);
    if(address.includes("/ai_atlas_resources?"))return Response.json({id:"resource",raw_text:source,content_hash:"hash"});
    throw Error("Unexpected regeneration or storage mutation");
  });
  const result=await executeCardRun({id:"queue",user_id:"owner",lease_token:"lease",payload:{runId:"run"}});
  assert.deepEqual(result,{runId:"run",state:"waiting_input"});
  assert.equal(run.node,"verify");
  assert.deepEqual(run.data.story,before.data.story);
  assert.deepEqual(run.manifest,before.manifest);
  assert.equal(run.error_code,"STORY_INVALID");
  assert.equal(calls,4);
});
